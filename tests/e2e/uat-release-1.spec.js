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

test('the link popup opens above the editors below it, not underneath their toolbars', async ({ page }) => {
  await page.goto('/?catalog');
  await page.locator('.nav-item[data-category="interactive"]').click();
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
  // Block Label / Main Headline / Instructional Text are three editors stacked in one panel.
  await expect(page.locator('.rich-text-editor-container').nth(2)).toBeVisible();
  await page.locator('.rich-text-editor-container').first().locator('.rt-btn[title*="ink" i]').first().click();
  const popover = page.locator('.rt-link-popover');
  await expect(popover).toBeVisible();
  const box = await popover.boundingBox();
  // Sample the popup's whole height: whatever is painted there must be the popup, never a neighbouring toolbar.
  for (const fraction of [0.1, 0.35, 0.6, 0.85, 0.97]) {
    const topmostIsPopup = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.rt-popover')), { x: box.x + box.width / 2, y: box.y + box.height * fraction });
    expect(topmostIsPopup, `popup is covered at ${Math.round(fraction * 100)}% of its height`).toBe(true);
  }
});
