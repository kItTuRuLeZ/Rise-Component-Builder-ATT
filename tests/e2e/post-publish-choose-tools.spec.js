import { expect, test } from '@playwright/test';

// Post-Publish, step 2 ("Choose Tools"): selecting or deselecting a tool used to append another
// copy of the whole step beneath the first, because the checkbox handler re-rendered the step
// without clearing it. Toggling now updates the card in place.

const risePage = '<!DOCTYPE html><html><head><title>Course</title></head><body><div>Rise 360 course</div></body></html>';

async function reachChooseTools(page) {
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
  await page.locator('#btn-ppt-next').click();
  await expect(page.getByRole('heading', { name: 'Step 2: Choose Persistent Tools' })).toBeVisible();
}

const tool = (page, key) => page.locator(`.ppt-tool-chk[data-tool="${key}"]`);

test('toggling tools never stacks extra copies of the step', async ({ page }) => {
  await reachChooseTools(page);
  const panels = page.locator('.ppt-step-panel');
  const headings = page.getByRole('heading', { name: 'Step 2: Choose Persistent Tools' });
  await expect(panels).toHaveCount(1);

  for (const key of ['glossary', 'resources', 'help', 'glossary', 'help', 'resources', 'glossary']) {
    await tool(page, key).click();
    await expect(panels).toHaveCount(1);
    await expect(headings).toHaveCount(1);
  }
  await expect(page.locator('.ppt-tool-card')).toHaveCount(3);
});

test('the selected look and the checkbox stay in step with each other', async ({ page }) => {
  await reachChooseTools(page);
  const card = key => tool(page, key).locator('xpath=ancestor::label[contains(@class,"ppt-tool-card")]');

  await expect(tool(page, 'glossary')).toBeChecked();
  await expect(card('glossary')).toHaveClass(/selected/);

  await tool(page, 'glossary').uncheck();
  await expect(tool(page, 'glossary')).not.toBeChecked();
  await expect(card('glossary')).not.toHaveClass(/selected/);
  // The other two are untouched.
  await expect(card('resources')).toHaveClass(/selected/);
  await expect(card('help')).toHaveClass(/selected/);

  await tool(page, 'glossary').check();
  await expect(card('glossary')).toHaveClass(/selected/);
});

test('keyboard focus stays on the checkbox that was toggled, and Space toggles it', async ({ page }) => {
  await reachChooseTools(page);
  await tool(page, 'resources').focus();
  await page.keyboard.press('Space');
  await expect(tool(page, 'resources')).not.toBeChecked();
  await expect(tool(page, 'resources')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(tool(page, 'resources')).toBeChecked();
  await expect(tool(page, 'resources')).toBeFocused();
  await expect(page.locator('.ppt-step-panel')).toHaveCount(1);
});

test('the choice carries to the next step: only the selected tools get a tab', async ({ page }) => {
  await reachChooseTools(page);
  await tool(page, 'glossary').uncheck();
  await tool(page, 'help').uncheck();
  await page.locator('#btn-ppt-next').click();
  const tabs = page.locator('.ppt-subtab-btn');
  await expect(tabs).toHaveCount(1);
  await expect(page.locator('.ppt-step-panel')).toHaveCount(1);
  // Resources is the only tool left on, so Glossary and Help & Support have no tab.
  await expect(page.locator('.ppt-subtab-btn[data-tab="resources"]')).toHaveCount(1);
  await expect(page.locator('.ppt-subtab-btn[data-tab="glossary"]')).toHaveCount(0);
  await expect(page.locator('.ppt-subtab-btn[data-tab="help"]')).toHaveCount(0);
});
