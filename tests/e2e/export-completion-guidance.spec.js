import { expect, test } from '@playwright/test';

// UAT (Oct 2026): with media in a component and a completion setting chosen, the export panel
// recommended the Web Package ZIP and then refused it ("Switch to Copy for Rise"). Six testers hit
// the contradiction. The recommendation now follows what each format can actually do.

// An uploaded image is real media: the export reports it as an asset. (Same helper idea as media-pipeline.spec.js.)
async function uploadCanvasImage(fileInput) {
  await fileInput.evaluate(async input => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    canvas.getContext('2d').fillRect(0, 0, 400, 300);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], 'icon.png', { type: 'image/png' }));
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function openExport(page, { track }) {
  await page.goto('/?catalog');
  await page.locator('.nav-item[data-category="interactive"]').click();
  await page.locator('.component-select-card').filter({ hasText: 'Study Cards' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
  const iconField = page.locator('#schema-0-iconImage').locator('xpath=ancestor::div[contains(@class,"schema-field")]');
  await uploadCanvasImage(iconField.locator('input[type="file"]'));
  await expect(iconField.locator('.media-file-metadata')).toContainText('icon.png');
  if (track) {
    await page.locator('.editor-tab[data-tab="completion"]').click();
    await page.locator('#completion-mode-all-items').check();
  }
  await page.locator('#btn-export').click();
  await expect(page.locator('#modal-export')).toBeVisible();
  await expect(page.locator('#export-modal-content')).toBeVisible();
}

test('media + completion tracking: the Rise Code Block is recommended, not the ZIP, and the ZIP says why it is off', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit-on-Windows cannot store Blobs in IndexedDB in this test environment (see media-pipeline.spec.js).');
  await openExport(page, { track: true });
  await expect(page.locator('#export-card-rise')).toHaveClass(/is-recommended/);
  await expect(page.locator('#export-card-zip')).not.toHaveClass(/is-recommended/);
  const note = page.locator('#export-large-paste-warning');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Rise Code Block');
  await expect(note).toContainText('cannot report completion');
  await expect(page.locator('#btn-download-rise-zip')).toBeDisabled();
  await expect(page.locator('#export-card-zip .completion-export-block')).toBeVisible();
});

test('media without completion tracking: the ZIP is recommended and the note says both formats work', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit-on-Windows cannot store Blobs in IndexedDB in this test environment (see media-pipeline.spec.js).');
  await openExport(page, { track: false });
  await expect(page.locator('#export-card-zip')).toHaveClass(/is-recommended/);
  await expect(page.locator('#export-card-rise')).not.toHaveClass(/is-recommended/);
  const note = page.locator('#export-large-paste-warning');
  await expect(note).toContainText('loads faster');
  await expect(note).toContainText('Copy for Rise also works');
});
