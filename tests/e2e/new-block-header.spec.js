import { expect, test } from '@playwright/test';

// Every block added to a course used to be titled "INTERACTIVE ACCORDION" (and carry the
// Accordion's description), because registry defaults have no header text and the editor's
// base config is the Accordion demo.

async function courseOverview(page, components = { c1: { name: 'Lesson', type: 'accordion' } }) {
  await page.goto('/?dashboard');
  await page.evaluate(async comps => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject } = await import('/js/storage.js');
    const cfg = { blockTitle: 'M', blockHeadline: 'Overview', items: [{ title: 'One', content: 'Body' }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none', iconStyle: 'chevron' };
    const built = {};
    for (const [id, c] of Object.entries(comps)) built[id] = createComponentInstance({ id, name: c.name, type: c.type, config: c.config || cfg });
    saveProject(buildProjectSchemaV3({
      name: 'Header Course', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: Object.keys(built) }) },
      components: built
    }));
  }, components);
  await page.reload();
  await page.locator('.project-card').filter({ hasText: 'Header Course' }).locator('[data-action="open"]').first().click();
  await expect(page.locator('#project-overview-workspace')).toBeVisible();
}

test('a Multiple Choice block added to a course gets its own title, not INTERACTIVE ACCORDION', async ({ page }) => {
  await courseOverview(page);
  await page.locator('[data-action="add-comp-to-sec"]').first().click();
  await page.locator('[data-action="select-picker-item"][data-comp-type="multiple-choice"]').first().click();
  await expect.poll(() => page.evaluate(async () => {
    const { loadProjects } = await import('/js/storage.js');
    return Object.values(loadProjects().find(p => p.name === 'Header Course').components).some(c => c.type === 'multiple-choice');
  })).toBe(true);

  const added = await page.evaluate(async () => {
    const { loadProjects } = await import('/js/storage.js');
    const project = loadProjects().find(p => p.name === 'Header Course');
    const comp = Object.values(project.components).find(c => c.type === 'multiple-choice');
    return { blockTitle: comp?.config.blockTitle, blockHeadline: comp?.config.blockHeadline, blockDesc: comp?.config.blockDesc };
  });
  expect(added.blockTitle).toMatch(/MULTIPLE CHOICE/);
  expect(added.blockTitle).not.toContain('ACCORDION');
  expect(added.blockHeadline).toMatch(/Multiple Choice/);
  expect(added.blockHeadline).not.toContain('Core Dimensions');
  expect(added.blockDesc).not.toContain('Click on the headers');

  // Open the new block from the outline; the editor must show the block's own header.
  // Via the row's explicit Focus Edit button: clicking the row body only selects it (the row is
  // compact, so its centre is no longer the Edit button).
  await page.locator('.component-row').filter({ hasText: /Multiple Choice/ }).first().locator('[data-action="edit-comp"]').click();
  await expect(page.locator('#editor-state')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#input-block-title')).toContainText('MULTIPLE CHOICE');
  await expect(page.locator('#input-block-title')).not.toContainText('ACCORDION');
  await expect(page.locator('#input-block-headline')).toContainText('Explore details about Multiple Choice');
});

test('a block saved earlier with the leaked Accordion header is repaired when opened, and real text is kept', async ({ page }) => {
  const leaked = { blockTitle: 'INTERACTIVE ACCORDION', blockHeadline: 'Explore the Core Dimensions', blockDesc: 'Click on the headers below to discover detailed insights.', items: [{ title: 'Q', content: 'A', label: 'A', correct: true }, { title: 'Q2', content: 'B', label: 'B', correct: false }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none' };
  await courseOverview(page, { c1: { name: 'Old Quiz', type: 'multiple-choice', config: leaked } });
  await page.locator('.component-row').first().click();
  await page.locator('[data-action="open-focus-editor"]').first().click();
  await expect(page.locator('#editor-state')).toBeVisible();
  await expect(page.locator('#input-block-title')).not.toContainText('ACCORDION');
  await expect(page.locator('#input-block-title')).toContainText('MULTIPLE CHOICE');
});
