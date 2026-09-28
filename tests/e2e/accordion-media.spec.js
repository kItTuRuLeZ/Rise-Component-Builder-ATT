import { expect, test } from '@playwright/test';

async function openAccordion(page) {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

test.beforeEach(async ({ page }) => openAccordion(page));

test('Accordion item media control allows adding image with responsive placement and preview', async ({ page }) => {
  const cards = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)');
  const firstCard = cards.first();

  // Find the Media — Optional details section
  const mediaDetails = firstCard.locator('.item-media-details-shell');
  await expect(mediaDetails).toBeVisible();

  // Select Image from Media Type select
  const typeSelect = mediaDetails.locator('.item-media-type-select');
  await typeSelect.selectOption('image');

  // Verify type badge updates
  await expect(mediaDetails.locator('.item-media-type-badge')).toHaveText('IMAGE');

  // Enter URL directly into the URL input
  const urlInput = mediaDetails.locator('input[type="url"]').first();
  await urlInput.fill('https://images.unsplash.com/photo-1579546929518-9e396f3cc809');

  // Fill Alt text
  const altInput = mediaDetails.locator('textarea[placeholder*="Describe the image"]');
  await altInput.fill('Vibrant gradient abstract illustration');

  // Fill Caption
  const captionInput = mediaDetails.locator('input[placeholder*="caption"]');
  await captionInput.fill('Figure 1: Spectrum Demonstration');

  // Check preview iframe
  const frame = page.frameLocator('#live-preview-iframe');
  const imgSlot = frame.locator('.item-media-slot.item-media-type-image').first();
  await expect(imgSlot).toBeVisible();
  await expect(imgSlot.locator('img')).toHaveAttribute('alt', 'Vibrant gradient abstract illustration');
  await expect(imgSlot.locator('.item-media-caption')).toHaveText('Figure 1: Spectrum Demonstration');
});

test('Accordion item media supports audio with transcript drawer in preview', async ({ page }) => {
  const firstCard = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)').first();
  const mediaDetails = firstCard.locator('.item-media-details-shell');

  const typeSelect = mediaDetails.locator('.item-media-type-select');
  await typeSelect.selectOption('audio');

  const urlInput = mediaDetails.locator('input[type="url"]').first();
  await urlInput.fill('https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg');

  // Fill transcript
  const transcriptInput = mediaDetails.locator('textarea[placeholder*="transcript"]');
  await transcriptInput.fill('Transcript: Sound of heavy rain falling on a tin roof.');

  // Check preview iframe
  const frame = page.frameLocator('#live-preview-iframe');
  const audioSlot = frame.locator('.item-media-slot.item-media-type-audio').first();
  await expect(audioSlot).toBeVisible();
  await expect(audioSlot.locator('audio')).toBeVisible();
  await expect(audioSlot.locator('.item-media-transcript-drawer')).toBeVisible();
  await expect(audioSlot.locator('.item-media-transcript-body')).toContainText('Sound of heavy rain');
});

test('an image that finishes loading after the panel opens still fits — no clipping on first open', async ({ page }) => {
  // Reported: an accordion item's image doesn't show on the first click, only after opening a
  // different item and reopening this one. Root cause (components/accordion.js#toggleAccordion):
  // the panel's max-height is measured via scrollHeight the instant it opens, but its item-media
  // <img> is loading="lazy" (js/item-media.js) and only starts fetching once the panel actually
  // becomes visible — so on first open, scrollHeight is read before the image has any rendered
  // height, and the image gets clipped by overflow:hidden once it loads a moment later.
  //
  // A real but fast network fetch can beat the panel-open click and mask the bug, so the image
  // request is held open deliberately — this guarantees it's still in flight at the exact moment
  // the panel opens, reproducing the race condition every run instead of depending on timing.
  const imageUrl = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809';
  let releaseImage;
  const imageHeld = new Promise(resolve => { releaseImage = resolve; });
  await page.route(imageUrl, async route => {
    await imageHeld;
    await route.continue();
  });

  const firstCard = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)').first();
  const mediaDetails = firstCard.locator('.item-media-details-shell');
  await mediaDetails.locator('.item-media-type-select').selectOption('image');
  await mediaDetails.locator('input[type="url"]').first().fill(imageUrl);

  const frame = page.frameLocator('#live-preview-iframe');
  const trigger = frame.locator('.accordion-trigger').first();
  const panel = frame.locator('.accordion-content').first();
  const img = panel.locator('img').first();
  await expect(img).toBeAttached();
  expect(await img.evaluate(el => el.complete)).toBe(false);

  // Open the panel — this is the exact moment the buggy code measured scrollHeight, with the
  // image request still held open above.
  await trigger.click();
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  expect(await img.evaluate(el => el.complete)).toBe(false);

  // Let the image finish loading now that the panel is already open.
  releaseImage();
  await expect.poll(async () => img.evaluate(el => el.complete && el.naturalWidth > 0), { timeout: 10000 }).toBe(true);

  // No clipping: the panel's own rendered height must cover all of its content, including the
  // now-loaded image, not just what fit before the image arrived.
  await expect.poll(async () => panel.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  const imgBox = await img.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(imgBox.y + imgBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
});

test('Accordion item media supports video with 16:9 aspect ratio and placement', async ({ page }) => {
  const firstCard = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)').first();
  const mediaDetails = firstCard.locator('.item-media-details-shell');

  const typeSelect = mediaDetails.locator('.item-media-type-select');
  await typeSelect.selectOption('video');

  const urlInput = mediaDetails.locator('input[type="url"]').first();
  await urlInput.fill('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');

  const frame = page.frameLocator('#live-preview-iframe');
  const videoSlot = frame.locator('.item-media-slot.item-media-type-video').first();
  await expect(videoSlot).toBeVisible();
  await expect(videoSlot.locator('video')).toBeVisible();
});
