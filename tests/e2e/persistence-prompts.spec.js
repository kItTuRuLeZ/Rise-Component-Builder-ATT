import { expect, test } from '@playwright/test';

// P2 audit findings, in the real app: the unsaved-changes prompt must name the actual course
// and block (never "Untitled project" while a named course is open); an explicit save must not
// leave an "unsaved working draft" banner behind; a genuinely unsaved edit must still be
// recoverable; and opening incidental controls must not mark the project dirty.

async function seedAndOpen(page) {
  await page.goto('/?dashboard');
  await page.evaluate(async () => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject } = await import('/js/storage.js');
    const cfg = { blockTitle: 'M', blockHeadline: 'Overview', items: [{ title: 'One', content: 'Body' }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none', iconStyle: 'chevron' };
    saveProject(buildProjectSchemaV3({
      name: 'Audit Course', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) },
      components: { c1: createComponentInstance({ id: 'c1', name: 'Lesson', type: 'accordion', config: cfg }) }
    }));
  });
  await page.reload();
  await page.locator('.project-card').filter({ hasText: 'Audit Course' }).locator('[data-action="open"]').first().click();
  await page.locator('[data-action="open-focus-editor"]').first().click().catch(async () => {
    await page.locator('.component-row').first().click();
    await page.locator('[data-action="open-focus-editor"]').first().click();
  });
  await expect(page.locator('#editor-state')).toBeVisible();
  await expect(page.locator('#input-block-headline')).toHaveText('Overview');
}

// Fetched from the live app rather than hardcoded, so this can never drift out of sync with
// js/client-isolation.js's edition-namespaced key (audit 2026-09-27, section 3).
const draftKey = page => page.evaluate(async () => (await import('/js/storage.js')).KEYS.draft);

test('the unsaved-changes prompt names the block and its course, not "Untitled project"', async ({ page }) => {
  await seedAndOpen(page);
  await page.locator('#input-block-headline').fill('Edited headline');
  await page.locator('#btn-back-to-catalog').click();
  const prompt = page.getByText(/has unsaved changes/);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('“Lesson” in “Audit Course”');
  await expect(prompt).not.toContainText('Untitled');
});

test('an explicit save leaves no recovery banner on the dashboard', async ({ page }) => {
  await seedAndOpen(page);
  await page.locator('#input-block-headline').fill('Saved headline');
  await page.locator('#btn-save').click();
  await expect(page.locator('.toast')).toContainText('Saved');
  await page.goto('/?dashboard');
  await expect(page.locator('.project-card').filter({ hasText: 'Audit Course' })).toHaveCount(1);
  await expect(page.locator('.dashboard-draft-banner')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), await draftKey(page))).toBeNull();
});

test('a genuinely unsaved edit is still recoverable, with a timestamp and what it differs from', async ({ page }) => {
  await seedAndOpen(page);
  await page.locator('#input-block-headline').fill('Unsaved headline');
  const key = await draftKey(page);
  await expect.poll(() => page.evaluate(k => localStorage.getItem(k), key), { timeout: 10000 }).not.toBeNull();
  await page.goto('/?dashboard');
  const banner = page.locator('.dashboard-draft-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Recovered autosave');
  await expect(banner).toContainText('Autosaved');
  await expect(banner).toContainText('not in the saved project');
  await expect(banner).toContainText('Audit Course');
  await expect(banner).not.toContainText('Unsaved Working Draft');
});

test('opening Preflight, Export or a device mode and cancelling does not mark the project dirty', async ({ page }) => {
  await seedAndOpen(page);
  await page.locator('#btn-preflight').click();
  await page.keyboard.press('Escape');
  await page.locator('#btn-export').click();
  await page.keyboard.press('Escape');
  await page.locator('[data-device="mobile"]').click();
  await page.locator('[data-device="desktop"]').click();
  await page.locator('#btn-back-to-catalog').click();
  await expect(page.getByText(/has unsaved changes/)).toHaveCount(0);
  await expect(page.locator('#project-overview-workspace')).toBeVisible();
});
