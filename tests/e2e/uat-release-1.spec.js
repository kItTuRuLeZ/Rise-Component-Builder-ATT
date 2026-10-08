import { expect, test } from '@playwright/test';

// UAT (Oct 2026), as an author sees it: clearing a field must not print "<br>" in the preview,
// formatting must not print "<b>", and Button List's File Type / File Size must reject nonsense.

async function openButtonList(page) {
  await page.goto('/?catalog');
  await page.locator('.nav-item[data-category="navigation"]').click();
  await page.locator('.component-select-card').filter({ hasText: 'Button List' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

const firstItemField = (page, label) => page.getByRole('textbox', { name: label }).first();

test('clearing a Button List title falls back to the default label instead of printing "<br>"', async ({ page }) => {
  await openButtonList(page);
  const title = page.getByRole('textbox', { name: /^Button Label|^Title/ }).first();
  await title.click();
  await title.fill('Temporary');
  await title.fill('');
  const preview = page.frameLocator('#live-preview-iframe');
  await expect(preview.locator('.btn-title').first()).toHaveText('Launch link');
  await expect(preview.locator('body')).not.toContainText('<br>');
});

test('bold in a button label renders as bold, not as the text "<b>"', async ({ page }) => {
  await openButtonList(page);
  const title = page.getByRole('textbox', { name: /^Button Label|^Title/ }).first();
  await title.click();
  await title.evaluate(el => { el.innerHTML = '<b>Bold label</b>'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const preview = page.frameLocator('#live-preview-iframe');
  await expect(preview.locator('.btn-title b').first()).toHaveText('Bold label');
  await expect(preview.locator('body')).not.toContainText('<b>');
});

test('File Type and File Size reject values that are not a type or a size', async ({ page }) => {
  await openButtonList(page);
  const type = firstItemField(page, /^File Type/);
  const size = firstItemField(page, /^File Size/);
  await type.click();
  await type.fill('a b!');
  await expect(page.locator('.field-error').filter({ hasText: /File Type uses letters and numbers/ }).first()).toBeVisible();
  await type.fill('PDF');
  await expect(page.locator('.field-error').filter({ hasText: /File Type uses letters and numbers/ })).toHaveCount(0);

  await size.click();
  await size.fill('lots of bytes');
  await expect(page.locator('.field-error').filter({ hasText: /File Size is a number followed by a unit/ }).first()).toBeVisible();
  await size.fill('2.4 MB');
  await expect(page.locator('.field-error').filter({ hasText: /File Size is a number followed by a unit/ })).toHaveCount(0);
});

test('the Heading Level field says it does not change how the headline looks', async ({ page }) => {
  await page.goto('/?catalog');
  await page.locator('.nav-item[data-category="interactive"]').click();
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await page.locator('.editor-tab[data-tab="appearance"]').click();
  await expect(page.locator('#select-heading-level').locator('xpath=following-sibling::p[contains(@class,"field-hint")]')).toContainText('does not change how the headline looks');
});
