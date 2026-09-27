import { expect, test } from '@playwright/test';

// A project saved before Schema v3 (single component, no `components` map) must open from
// the dashboard with its content, not as an empty course. js/storage.js#loadProjects
// upgrades it on read (js/project-migration.js) and keeps a one-time backup of the original.

// clientLabel: pre-v3 projects predate the AT&T/PMI storage split too, and this repo was
// the only consumer of the shared key back then — labelling the fixture 'AT&T' keeps this
// first test about schema migration, not edition-ownership. Edition-ownership itself (the
// core migration logic) is covered at the unit level in tests/unit/client-isolation.test.js
// and tests/unit/client-isolation-media.test.js; the two tests below cover just the
// dashboard's own explicit-import UI for a project neither test can attribute automatically.
const legacy = {
  id: 'p-legacy', schemaVersion: 1, name: 'My Old Project', componentId: 'accordion', clientLabel: 'AT&T',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
  config: {
    blockTitle: 'T', blockHeadline: 'H', blockDesc: 'D', colorPrimary: '#00388F', colorAccent: '#009FDB',
    colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '12', shadowDepth: 'soft', iconStyle: 'chevron',
    completionMsg: 'Done', borderOutline: true, accordionMulti: true, accordionAnimation: true, trackCompletion: false,
    items: [{ title: 'Legacy item', content: 'Legacy body' }]
  }
};

test('a pre-v3 project opens from the dashboard with its component, and the original is backed up', async ({ page }) => {
  await page.addInitScript(project => {
    if (!localStorage.getItem('rise-builder-projects-v1')) {
      localStorage.setItem('rise-builder-projects-v1', JSON.stringify([project]));
    }
  }, legacy);
  await page.goto('/?dashboard');

  const card = page.locator('.project-card').filter({ hasText: 'My Old Project' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.project-version-badge')).toHaveCount(1);
  await card.locator('[data-action="open"]').first().click();

  const overview = page.locator('#project-overview-workspace');
  await expect(overview).toBeVisible();
  await expect(overview).not.toContainText('Course is empty');
  await expect(overview).toContainText(/\b1\s+component/);

  const backup = await page.evaluate(() => JSON.parse(localStorage.getItem('rise-builder-projects-backup-v2')));
  expect(backup).toHaveLength(1);
  expect(backup[0].config.items[0].title).toBe('Legacy item');
});

// 27 September 2026 functional audit, section 3: a legacy project this edition can't
// confidently attribute to itself (blank/unrecognised clientLabel) must not silently appear
// as a normal, directly-open-able project — it stays out of the workspace list until the
// author explicitly imports it.
const ambiguous = {
  ...legacy, id: 'p-ambiguous', schemaVersion: 3, name: 'Ambiguous Legacy Course', clientLabel: '',
  sectionOrder: ['s1'], unsectionedComponentOrder: [],
  sections: { s1: { id: 's1', name: 'Module', componentOrder: ['c1'] } },
  components: { c1: { id: 'c1', name: 'Lesson', type: 'accordion', status: 'ready', config: legacy.config } }
};

test('a legacy project with no client label is not shown as a project until explicitly imported', async ({ page }) => {
  await page.addInitScript(project => {
    localStorage.setItem('rise-builder-projects-v1', JSON.stringify([project]));
  }, ambiguous);
  await page.goto('/?dashboard');

  await expect(page.locator('.project-card').filter({ hasText: 'Ambiguous Legacy Course' })).toHaveCount(0);
  const banner = page.locator('.dashboard-legacy-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Ambiguous Legacy Course');
  await expect(banner).toContainText('No client label');

  await banner.locator('[data-action="import-legacy-project"]').click();
  await expect(page.locator('.toast')).toContainText('Imported');
  await expect(page.locator('.dashboard-legacy-banner')).toHaveCount(0);
  await expect(page.locator('.project-card').filter({ hasText: 'Ambiguous Legacy Course' })).toHaveCount(1);

  // The legacy record is still there, untouched — this was a copy, not a move.
  const stillLegacy = await page.evaluate(() => JSON.parse(localStorage.getItem('rise-builder-projects-v1')));
  expect(stillLegacy.some(p => p.id === 'p-ambiguous')).toBe(true);
});
