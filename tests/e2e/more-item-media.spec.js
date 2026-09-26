import { expect, test } from '@playwright/test';

// Each component below offers the same per-item "Media — Optional" control that Accordion has.
const components = [
  ['Study Cards', 'interactive', '.flip-card .item-media-slot.item-media-type-image'],
  ['Guided Vertical Timeline', 'timelines', '.step-card .item-media-slot.item-media-type-image'],
  ['Horizontal Timeline', 'timelines', '.timeline-slide.active .item-media-slot.item-media-type-image'],
  ['Guided Process', 'process', '.process-slide.active .item-media-slot.item-media-type-image']
];

for (const [label, category, selector] of components) {
  test(`${label}: an item can carry an image, shown in the live preview`, async ({ page }) => {
    await page.goto('/?catalog');
    await page.locator(`.nav-item[data-category="${category}"]`).click();
    await page.locator('.component-select-card').filter({ hasText: label }).first().click();
    await expect(page.locator('#editor-state')).toBeVisible();

    const card = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)').first();
    const media = card.locator('.item-media-details-shell');
    await expect(media).toBeVisible();
    await media.locator('.item-media-type-select').selectOption('image');
    await media.locator('input[type="url"]').first().fill('https://example.com/diagram.png');
    await media.locator('textarea[placeholder*="Describe the image"]').fill('A diagram of the project lifecycle');

    const frame = page.frameLocator('#live-preview-iframe');
    await expect(frame.locator(selector).first()).toBeAttached();
  });
}

test('Study Cards offer images only, not audio or video', async ({ page }) => {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: 'Study Cards' }).first().click();
  await expect(page.locator('#editor-state')).toBeVisible();
  const select = page.locator('#dynamic-items-container .item-media-type-select').first();
  await expect(select.locator('option')).toHaveText([/None/, /Image/]);
});
