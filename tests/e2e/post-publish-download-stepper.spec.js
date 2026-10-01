import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Two Post-Publish problems reported during UAT preparation:
//  1. Step 6 showed no Download button at all when validation had errors, and gave no way forward.
//  2. On tall steps (Upload, Add Content) the stepper was squeezed to a sliver with a vertical
//     scrollbar, because it was a shrinkable flex item.

const risePage = '<!DOCTYPE html><html><head><title>Course</title></head><body><div>Rise 360 course</div></body></html>';

async function openWithPackage(page) {
  await page.goto('/?post-publish');
  const base64 = await page.evaluate(async html => {
    const { createZip } = await import('/js/zip.js');
    const blob = createZip([{ path: 'index.html', data: html }, { path: 'lib/rise/main.js', data: 'console.log("rise")' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }, risePage);
  await page.locator('#ppt-zip-input').setInputFiles({ name: 'course.zip', mimeType: 'application/zip', buffer: Buffer.from(base64, 'base64') });
  await expect(page.locator('.ppt-package-detected-card')).toHaveClass(/success/);
}

const next = page => page.locator('#btn-ppt-next').click();
const stepper = page => page.locator('.ppt-stepper-nav');

async function stepperGeometry(page) {
  return stepper(page).evaluate(nav => ({ height: nav.getBoundingClientRect().height, verticalScroll: nav.scrollHeight > nav.clientHeight + 1 }));
}

test('the stepper keeps its full height, with no scrollbar, on every step, including the tall ones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openWithPackage(page);
  const heights = [];
  heights.push(await stepperGeometry(page)); // step 1 (package summary is tall)
  await next(page);
  heights.push(await stepperGeometry(page)); // step 2
  await next(page);
  await expect(page.locator('.ppt-subtab-btn').first()).toBeVisible();
  heights.push(await stepperGeometry(page)); // step 3 (editors are tall)
  for (const tab of ['resources', 'help', 'glossary']) {
    await page.locator(`.ppt-subtab-btn[data-tab="${tab}"]`).click();
    heights.push(await stepperGeometry(page));
  }
  for (const geometry of heights) {
    expect(geometry.verticalScroll).toBe(false);
    expect(geometry.height).toBeGreaterThan(50);
  }
  // Same height everywhere: it never collapses from one step to another.
  expect(Math.max(...heights.map(h => h.height)) - Math.min(...heights.map(h => h.height))).toBeLessThan(1);
});

test('Step 6 always shows the Download button; with sample content it is disabled, explained, and the fixes are one click away', async ({ page }) => {
  await openWithPackage(page);
  for (let i = 0; i < 5; i += 1) await next(page);
  await expect(page.getByRole('heading', { name: 'Step 6: Download Enhanced Package' })).toBeVisible();

  const download = page.locator('#btn-run-enhancement');
  await expect(download).toBeVisible();
  await expect(download).toBeDisabled();
  await expect(download).toHaveAttribute('aria-describedby', 'ppt-export-blockers');
  // It looks disabled, not just inert.
  expect(Number(await download.evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(0.8);
  const blockers = page.locator('#ppt-export-blockers');
  await expect(blockers).toContainText('Download is unavailable until');
  await expect(blockers).toContainText('placeholder address');
  await expect(blockers).toContainText('example.com');

  await page.locator('#btn-fix-sample').click();
  await expect(page.locator('#ppt-sample-ack')).toBeVisible();   // step 5
  await next(page);
  await page.locator('#btn-fix-content').click();                  // back to step 3
  await expect(page.locator('.ppt-subtab-btn').first()).toBeVisible();
});

test('after the placeholder and sample content are replaced, Step 6 enables the button and it downloads the enhanced ZIP', async ({ page }) => {
  await openWithPackage(page);
  await next(page);
  await page.locator('.ppt-tool-chk[data-tool="glossary"]').uncheck();
  await page.locator('.ppt-tool-chk[data-tool="help"]').uncheck();
  await next(page);                                                  // step 3: only Resources is left
  await page.locator('.input-res-title').fill('Acme field guide');
  await page.locator('.input-res-url').fill('https://learn.acme-telecom.net/guide.pdf');
  for (let i = 0; i < 3; i += 1) await next(page);
  await expect(page.getByRole('heading', { name: 'Step 6: Download Enhanced Package' })).toBeVisible();

  const download = page.locator('#btn-run-enhancement');
  await expect(download).toBeEnabled();
  await expect(page.locator('#ppt-export-blockers')).toHaveCount(0);

  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toMatch(/\.zip$/i);
  expect(readFileSync(await file.path()).subarray(0, 2).toString()).toBe('PK');
});
