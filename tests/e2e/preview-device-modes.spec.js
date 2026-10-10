import { expect, test } from '@playwright/test';

const COMPONENTS = [
  { name: 'Accordion', category: 'Interactive', rootSelector: '.accordion-group' },
  { name: 'Study Cards', category: 'Interactive', rootSelector: '.flip-cards-grid' },
  { name: 'Horizontal Tabs', category: 'Interactive', rootSelector: '.tabs-container' },
  { name: 'Hotspots', category: 'Interactive', rootSelector: '.hotspots-container' },
  { name: 'Multiple Choice', category: 'Knowledge Checks', rootSelector: '.quiz-block' },
  { name: 'Guided Vertical Timeline', category: 'Timelines', rootSelector: '.vertical-timeline-container' },
  { name: 'Image Gallery', category: 'Media Blocks', rootSelector: '.gallery-grid' }
];

const CATEGORY_ID = {
  Interactive: 'interactive', Navigation: 'navigation', 'Knowledge Checks': 'knowledge',
  Timelines: 'timelines', 'Process Flows': 'process', 'Cards & Layouts': 'cards',
  'Media Blocks': 'media', 'Advanced Interactions': 'advanced'
};

async function openComponent(page, name, category = 'Interactive') {
  await page.goto('/?catalog');
  const categoryId = CATEGORY_ID[category] || category;
  if (categoryId !== 'interactive') await page.locator(`.nav-item[data-category="${categoryId}"]`).click();
  await page.locator('.component-select-card').filter({ hasText: name }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

async function selectDevice(page, device) {
  await page.locator(`.device-btn[data-device="${device}"]`).click();
}

function noPageHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

// A window wide enough for the preview panel's 48% share to comfortably fit a 768px tablet
// frame plus its chrome padding — proves exact widths are achievable, not just clamped.
const WIDE_WINDOW = { width: 1920, height: 1080 };

for (const { name, category, rootSelector } of COMPONENTS) {
  test.describe(`${name} preview device modes`, () => {
    test(`${name}: desktop, tablet, large mobile, and mobile set the exact selected width`, async ({ page }) => {
      await page.setViewportSize(WIDE_WINDOW);
      await openComponent(page, name, category);
      const viewport = page.locator('#preview-viewport');

      await selectDevice(page, 'mobile');
      await expect.poll(() => viewport.evaluate(el => el.getBoundingClientRect().width)).toBe(375);

      await selectDevice(page, 'mobile-lg');
      await expect.poll(() => viewport.evaluate(el => el.getBoundingClientRect().width)).toBe(430);

      await selectDevice(page, 'tablet');
      await expect.poll(() => viewport.evaluate(el => el.getBoundingClientRect().width)).toBe(768);

      await selectDevice(page, 'desktop');
      const desktopWidth = await viewport.evaluate(el => el.getBoundingClientRect().width);
      expect(desktopWidth).toBeGreaterThan(0);
      expect(desktopWidth).toBeLessThanOrEqual(740);
    });

    test(`${name}: no device mode causes page-level horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize(WIDE_WINDOW);
      await openComponent(page, name, category);
      for (const device of ['desktop', 'tablet', 'mobile-lg', 'mobile']) {
        await selectDevice(page, device);
        await expect.poll(() => noPageHorizontalScroll(page)).toBe(true);
      }
    });

    test(`${name}: the iframe's own layout viewport reflects the selected width (real CSS, not a visual scale)`, async ({ page }) => {
      await page.setViewportSize(WIDE_WINDOW);
      await openComponent(page, name, category);
      const frameHtml = page.frameLocator('#live-preview-iframe').locator('html');

      await selectDevice(page, 'mobile');
      await expect.poll(() => frameHtml.evaluate(el => el.ownerDocument.defaultView.matchMedia('(max-width: 400px)').matches)).toBe(true);

      await selectDevice(page, 'desktop');
      await expect.poll(() => frameHtml.evaluate(el => el.ownerDocument.defaultView.matchMedia('(max-width: 400px)').matches)).toBe(false);
    });

    test(`${name}: content fits within the frame at mobile and tablet widths (no internal overflow)`, async ({ page }) => {
      await page.setViewportSize(WIDE_WINDOW);
      await openComponent(page, name, category);
      const frame = page.frameLocator('#live-preview-iframe');
      await expect(frame.locator(rootSelector).first()).toBeVisible();

      for (const device of ['tablet', 'mobile']) {
        await selectDevice(page, device);
        const overflow = await frame.locator('html').evaluate(el => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(2); // allow for sub-pixel/scrollbar rounding
      }
    });
  });
}

test.describe('grid-based components reflow to fewer columns at mobile width', () => {
  for (const { name, category, itemSelector } of [
    { name: 'Study Cards', category: 'Interactive', itemSelector: '.flip-card' },
    { name: 'Image Gallery', category: 'Media Blocks', itemSelector: '.gallery-item-card' }
  ]) {
    test(`${name}: two-column desktop layout stacks to one column at mobile width`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await openComponent(page, name, category);
      const frame = page.frameLocator('#live-preview-iframe');
      const items = frame.locator(itemSelector);
      await expect(items.first()).toBeVisible();

      await selectDevice(page, 'desktop');
      const desktopTops = await items.evaluateAll(elements => elements.slice(0, 2).map(element => element.getBoundingClientRect().top));
      expect(desktopTops[0]).toBe(desktopTops[1]); // same row at desktop width

      await selectDevice(page, 'mobile');
      const mobileTops = await items.evaluateAll(elements => elements.slice(0, 2).map(element => element.getBoundingClientRect().top));
      expect(mobileTops[0]).not.toBe(mobileTops[1]); // stacked into separate rows at mobile width
    });
  }
});

test.describe('device switcher accessibility', () => {
  test('device switcher exposes a labeled group with a single pressed control', async ({ page }) => {
    await openComponent(page, 'Accordion');
    await expect(page.locator('.device-switcher')).toHaveAttribute('aria-label', /.+/);
    await expect(page.locator('.device-switcher')).toHaveAttribute('role', 'group');

    const buttons = page.locator('.device-btn');
    const pressedStates = async () => buttons.evaluateAll(elements => elements.map(el => el.getAttribute('aria-pressed')));
    expect((await pressedStates()).filter(state => state === 'true')).toHaveLength(1);

    await page.locator('[data-device="mobile"]').click();
    await expect(page.locator('[data-device="mobile"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await pressedStates()).filter(state => state === 'true')).toHaveLength(1);
    for (const device of ['desktop', 'tablet', 'mobile-lg']) {
      await expect(page.locator(`[data-device="${device}"]`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('the selected width is visible to the author', async ({ page }) => {
    await openComponent(page, 'Accordion');
    const label = page.locator('#preview-width-label');
    await page.locator('[data-device="tablet"]').click();
    // On a laptop-sized window the panel is narrower than a tablet, and the label now says so ("642px of 768px").
    await expect(label).toHaveText(/(^| of )768px$/);
    await page.locator('[data-device="mobile-lg"]').click();
    await expect(label).toHaveText('430px');
    await page.locator('[data-device="mobile"]').click();
    await expect(label).toHaveText('375px');
    await page.locator('[data-device="desktop"]').click();
    await expect(label).toContainText('740');
  });
});

test.describe('device mode persistence rules', () => {
  test('selected device mode survives a full page reload', async ({ page }) => {
    await openComponent(page, 'Accordion');
    await page.locator('[data-device="mobile"]').click();
    await page.reload();
    await expect(page.locator('#preview-viewport')).toHaveClass(/mobile/);
    await expect(page.locator('[data-device="mobile"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('selected device mode persists when switching to a different component', async ({ page }) => {
    await openComponent(page, 'Accordion');
    await page.locator('[data-device="tablet"]').click();
    // The editor's back control exits to the course workspace rather than the catalog
    // now, so re-entering the catalog goes through its ?catalog deep link. The selected
    // device mode lives in localStorage (js/storage.js KEYS.previewDevice), so it still
    // has to survive this.
    await page.goto('/?catalog');
    await page.locator('.component-select-card').filter({ hasText: 'Study Cards' }).click();
    await expect(page.locator('#preview-viewport')).toHaveClass(/tablet/);
    await expect(page.locator('[data-device="tablet"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('narrow application window remains usable', () => {
  test('a narrow window clamps the preview without page-level horizontal scroll or breaking the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openComponent(page, 'Accordion');
    await page.locator('[data-device="tablet"]').click();
    await expect.poll(() => noPageHorizontalScroll(page)).toBe(true);
    const viewportWidth = await page.locator('#preview-viewport').evaluate(el => el.getBoundingClientRect().width);
    expect(viewportWidth).toBeGreaterThan(0);
    await page.goto('/?catalog');
    await expect(page.locator('#catalog-state')).toBeVisible();
    await page.locator('.nav-item[data-category="knowledge"]').click();
    await expect(page.locator('.component-select-card').filter({ hasText: 'Multiple Choice' })).toBeVisible();
  });
});
