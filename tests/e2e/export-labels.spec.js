import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Three different things were all called "Export Package": a course's hosted ZIP, a project's
// editable backup (.rise-project.zip, includes media) and a "default export package" format setting.
// Testers could not tell which one restores a project. Each now has its own name.

const NAME = 'Label Course';

async function seed(page) {
  await page.goto('/?dashboard');
  await page.evaluate(async name => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject } = await import('/js/storage.js');
    const config = { blockTitle: 'M', blockHeadline: 'H', items: [{ title: 'One', content: 'Body' }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none', iconStyle: 'chevron' };
    saveProject(buildProjectSchemaV3({
      name, sectionOrder: ['s1'], sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) },
      components: { c1: createComponentInstance({ id: 'c1', name: 'Lesson', type: 'accordion', config }) }
    }));
  }, NAME);
  await page.reload();
}

test('the course tab says what it makes: a hosted copy, not a backup', async ({ page }) => {
  await seed(page);
  await page.locator('.project-card').first().locator('[data-action="open"]').first().click();
  const tab = page.locator('#wp-export-btn');
  await expect(tab).toContainText('Export for Hosting');
  await expect(tab).not.toContainText('Export Package');
  await expect(tab).toHaveAttribute('title', /not a project backup/i);
});

test('the dashboard project menu offers both exports under distinct names', async ({ page }) => {
  await seed(page);
  await page.locator('.project-card').first().locator('[data-action="menu"]').click();
  await expect(page.locator('[data-action="export-json"]')).toContainText('Export JSON (content only)');
  await expect(page.locator('[data-action="export-backup"]')).toContainText('Export Backup (.rise-project.zip)');
  await expect(page.locator('.project-action-menu')).not.toContainText('Export Package');
});

test('Export Backup from the dashboard downloads a project ZIP that the dashboard Import restores', async ({ page }) => {
  await seed(page);
  await page.locator('.project-card').first().locator('[data-action="menu"]').click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-backup"]').click()]);
  expect(file.suggestedFilename()).toMatch(/\.rise-project\.zip$/);
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes(Buffer.from('project.json'))).toBe(true);
  await expect(page.locator('.toast').last()).toContainText('Project backup downloaded');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.locator('#dash-import-file-input').setInputFiles({ name: file.suggestedFilename(), mimeType: 'application/zip', buffer: bytes });
  await expect(page.locator('.toast').last()).toContainText(`Imported “${NAME}”`);
});

test('the editor Open dialog names its exports the same way', async ({ page }) => {
  await seed(page);
  await page.goto('/?editor');
  await page.locator('#btn-open').click();
  const actions = page.locator('#modal-open .sc-actions').first();
  await expect(actions.getByRole('button', { name: 'Export JSON (content only)' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Export Backup (.rise-project.zip)' })).toBeVisible();
  await expect(actions).not.toContainText('Export Package');
});

test('the settings format choice is no longer called "Export Package"', async ({ page }) => {
  await page.goto('/?dashboard');
  await expect(page.locator('label[for="settings-export-format"]')).toHaveText('Default export format');
});

test('a ZIP that is not a backup is refused with the new names', async ({ page }) => {
  await page.goto('/?dashboard');
  const zip = await page.evaluate(async () => {
    const { createZip } = await import('/js/zip.js');
    const bytes = new Uint8Array(await createZip([{ path: 'index.html', data: '<html></html>' }]).arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  });
  await page.locator('#dash-import-file-input').setInputFiles({ name: 'hosted.zip', mimeType: 'application/zip', buffer: Buffer.from(zip, 'base64') });
  const toast = page.locator('.toast').last();
  await expect(toast).toContainText('Export Backup (.rise-project.zip)');
  await expect(toast).toContainText('Export for Hosting');
  await expect(toast).not.toContainText('Export Package');
});
