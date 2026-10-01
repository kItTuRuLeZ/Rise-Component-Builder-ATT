import { expect, test } from '@playwright/test';

// Post-Publish upload step, as an author sees it. A real Rise export arrived wrapped in a single
// folder ("content/index.html", "content/lib/rise/…") and was rejected with "This ZIP cannot be
// used", quoting an unrelated asset page. One wrapper folder is now accepted, with a warning.

async function buildZip(page, files) {
  const base64 = await page.evaluate(async entries => {
    const { createZip } = await import('/js/zip.js');
    const blob = createZip(entries);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }, files);
  return Buffer.from(base64, 'base64');
}

const risePage = '<!DOCTYPE html><html><head><title>Course</title></head><body><div>Rise 360 course</div></body></html>';
const riseFiles = prefix => [
  { path: `${prefix}index.html`, data: risePage },
  { path: `${prefix}lib/rise/main.js`, data: 'console.log("rise")' },
  { path: `${prefix}assets/9783168f/index.html`, data: '<html><body>block</body></html>' }
];

async function upload(page, files, name) {
  await page.goto('/?post-publish');
  const buffer = await buildZip(page, files);
  await page.locator('#ppt-zip-input').setInputFiles({ name, mimeType: 'application/zip', buffer });
  return page.locator('.ppt-package-detected-card');
}

test('a Rise export wrapped in one folder is accepted, names the launch file, and explains the folder', async ({ page }) => {
  const card = await upload(page, riseFiles('content/'), 'wrapped-export.zip');
  await expect(card).toHaveClass(/success/);
  await expect(card).toContainText('Package detected');
  await expect(card).toContainText('Rise Web export');
  await expect(card.getByText('Launch document:')).toBeVisible();
  await expect(card).toContainText('content/index.html');
  await expect(card.locator('.ppt-package-warnings')).toContainText('treated as the package root');
  await expect(card).not.toContainText('cannot be used');
});

test('a package with files at the root is accepted with no wrapper warning (unchanged)', async ({ page }) => {
  const card = await upload(page, riseFiles(''), 'plain-export.zip');
  await expect(card).toHaveClass(/success/);
  await expect(card).toContainText('Launch document: index.html');
  await expect(card.locator('.ppt-package-warnings')).toHaveCount(0);
});

test('a ZIP whose pages are scattered across several folders is still rejected with an explanation', async ({ page }) => {
  const card = await upload(page, [...riseFiles('a/'), { path: 'b/readme.txt', data: 'x' }], 'scattered.zip');
  await expect(card).toHaveClass(/error/);
  await expect(card).toContainText('This ZIP cannot be used');
  await expect(card).toContainText('No launch file at the root');
});
