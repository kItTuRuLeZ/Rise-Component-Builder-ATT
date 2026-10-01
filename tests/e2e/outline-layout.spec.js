import { expect, test } from '@playwright/test';

// The course outline column is a fixed width. Each row's status dropdown and action buttons used
// to stay on the title's line and squeeze it to ~40px ("Introduc…"), with the type badge drawn on
// top of the dropdown. The row now gives the title a real minimum width and lets the controls
// wrap to their own line. These tests measure the rendered geometry, so they hold on every engine.

const TITLES = [
  'Introduction to Fiber Network Deployment Readiness',
  'Understanding Project Risk Registers and Escalation Paths',
  'Knowledge Check: Field Safety Protocols and Compliance',
  'Short title'
];

async function openOutline(page) {
  await page.goto('/?dashboard');
  await page.evaluate(async titles => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject } = await import('/js/storage.js');
    const cfg = { blockTitle: 'M', blockHeadline: 'H', items: [{ title: 'One', content: 'Body' }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none', iconStyle: 'chevron' };
    const components = {};
    titles.forEach((name, index) => { components[`c${index}`] = createComponentInstance({ id: `c${index}`, name, type: 'accordion', config: cfg }); });
    saveProject(buildProjectSchemaV3({
      name: 'Long titles', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module One: Foundations', componentOrder: Object.keys(components) }) },
      components
    }));
  }, TITLES);
  await page.reload();
  await page.locator('.project-card').first().locator('[data-action="open"]').first().click();
  await expect(page.locator('#project-overview-workspace .component-row')).toHaveCount(TITLES.length);
}

const rowGeometry = page => page.evaluate(() => {
  const intersects = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
  return [...document.querySelectorAll('#project-overview-workspace .component-row')].map(row => {
    const rect = el => el.getBoundingClientRect();
    const name = row.querySelector('.component-name');
    const badge = row.querySelector('.component-type-badge');
    const status = row.querySelector('.component-status-select');
    const actions = row.querySelector('.component-row-right');
    const rowBox = rect(row);
    return {
      title: name.textContent.trim(),
      titleWidth: rect(name).width,
      badgeOverlapsStatus: intersects(rect(badge), rect(status)),
      actionsBelowTitle: rect(actions).top >= rect(name).bottom - 1,
      spillsOutOfRow: [name, badge, status, actions].some(el => rect(el).right > rowBox.right + 0.5)
    };
  });
});

for (const width of [1280, 1366, 1920]) {
  test(`at ${width}px the outline gives each title a readable width and nothing overlaps`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openOutline(page);
    for (const row of await rowGeometry(page)) {
      // Before the fix this was 38-77px; the long titles now get the row's full width.
      if (row.title.length > 30) expect(row.titleWidth, `"${row.title}" title width`).toBeGreaterThan(200);
      expect(row.badgeOverlapsStatus, `"${row.title}" badge overlaps the status dropdown`).toBe(false);
      expect(row.actionsBelowTitle, `"${row.title}" controls wrap under the title`).toBe(true);
      expect(row.spillsOutOfRow, `"${row.title}" has content outside its row`).toBe(false);
    }
  });
}

test('a truncated title is still reachable without hovering: selecting the row shows it in full', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openOutline(page);
  const long = TITLES[0];
  await page.locator('.component-row').filter({ hasText: long.slice(0, 20) }).locator('.component-select-target').click();
  await expect(page.getByLabel('Component Title')).toHaveValue(long);
});
