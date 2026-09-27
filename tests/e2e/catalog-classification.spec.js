import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The 14 / 7 classification split is asserted structurally in
// tests/unit/component-registry.test.js; here we only check the catalog UI surfaces it —
// badge, "Why use it?", and a classification filter that composes with the category
// sidebar and the search box, in light and dark mode.

const CARD = '.component-select-card';
const FILTER = '.classification-filter-btn';
const CATEGORIES = ['interactive', 'navigation', 'knowledge', 'timelines', 'process', 'cards', 'media', 'advanced'];

async function catalog(page) {
  await page.goto('/?catalog');
  await expect(page.locator(CARD).first()).toBeVisible();
}

const cat = (page, dataCategory) => page.locator(`.nav-item[data-category="${dataCategory}"]`);

// "Why use it?" is deliberately not painted on the card any more (styles.css `.card-why
// { display: none }` — kept off the card for scannability), but it is still rendered into
// the DOM and still wired to the card through aria-describedby, so it reaches assistive
// technology and the details modal. That contract is what this asserts.
test('every template card carries a classification badge and a "Why use it?" description', async ({ page }) => {
  await catalog(page);
  let seen = 0;
  for (const category of CATEGORIES) {
    await cat(page, category).click();
    const cards = page.locator(`#components-grid ${CARD}`);
    const count = await cards.count();
    for (let i = 0; i < count; i += 1) {
      const card = cards.nth(i);
      const badge = card.locator('.card-classification-badge');
      await expect(badge).toHaveText(/Enhanced Rise Alternative|Advanced Custom Interaction/);
      await expect(card.locator('.card-why-label')).toHaveText('Why use it?');
      const why = card.locator('.card-why-text');
      await expect(why).toBeAttached();
      await expect(why).not.toBeEmpty();
      const describedby = await card.getAttribute('aria-describedby');
      expect(describedby).toContain(await badge.getAttribute('id'));
      expect(describedby).toContain(await why.getAttribute('id'));
      seen += 1;
    }
  }
  // Every registered component (catalog grows over time — assert "all of them", not a fixed count).
  expect(seen).toBeGreaterThanOrEqual(26);
});

test('classification filter narrows the grid, updates aria-pressed, and composes with category + search', async ({ page }) => {
  await catalog(page);
  const grid = page.locator(`#components-grid ${CARD}`);
  const all = page.locator(FILTER).filter({ hasText: 'All Components' });
  const enhanced = page.locator(FILTER).filter({ hasText: 'Enhanced Rise Alternatives' });
  const custom = page.locator(FILTER).filter({ hasText: 'Advanced Custom Interactions' });

  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(enhanced).toHaveAttribute('aria-pressed', 'false');

  // Use "Cards & Layouts" — it has both classifications.
  await cat(page, 'cards').click();
  const allCount = await grid.count();
  expect(allCount).toBeGreaterThan(0);

  await enhanced.click();
  await expect(enhanced).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(custom).toHaveAttribute('aria-pressed', 'false');
  const enhancedCount = await grid.count();
  for (const b of await page.locator('#components-grid .card-classification-badge').allTextContents()) {
    expect(b).toBe('Enhanced Rise Alternative');
  }

  await custom.click();
  await expect(custom).toHaveAttribute('aria-pressed', 'true');
  const customCount = await grid.count();
  for (const b of await page.locator('#components-grid .card-classification-badge').allTextContents()) {
    expect(b).toBe('Advanced Custom Interaction');
  }

  // The two facets partition the category.
  expect(enhancedCount + customCount).toBe(allCount);
  expect(enhancedCount).toBeGreaterThan(0);
  expect(customCount).toBeGreaterThan(0);

  // Search composes with the active classification facet.
  await page.locator('#search-components').fill('Comparison Matrix');
  await expect(grid).toHaveCount(1);
  await expect(page.locator(`#components-grid ${CARD} h3`)).toHaveText(/Comparison Matrix/i);

  // "All Components" restores the full (still category-scoped) grid.
  await page.locator('#search-components').fill('');
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toHaveCount(allCount);
});

test('classification filter works within every category and the two facets partition the whole catalog', async ({ page }) => {
  await catalog(page);
  const enhanced = page.locator(FILTER).filter({ hasText: 'Enhanced Rise Alternatives' });
  const custom = page.locator(FILTER).filter({ hasText: 'Advanced Custom Interactions' });
  const titlesIn = () => page.locator(`#components-grid ${CARD} h3`).allTextContents();

  const enhancedTitles = new Set();
  const customTitles = new Set();
  for (const category of CATEGORIES) {
    await cat(page, category).click();
    await enhanced.click();
    for (const t of await titlesIn()) enhancedTitles.add(t);
    for (const badge of await page.locator('#components-grid .card-classification-badge').allTextContents()) {
      expect(badge).toBe('Enhanced Rise Alternative');
    }
    await custom.click();
    for (const t of await titlesIn()) customTitles.add(t);
    for (const badge of await page.locator('#components-grid .card-classification-badge').allTextContents()) {
      expect(badge).toBe('Advanced Custom Interaction');
    }
    await page.locator(FILTER).filter({ hasText: 'All Components' }).click();
  }
  // Every component is in exactly one facet; together they cover the full catalog.
  expect([...enhancedTitles].some(t => customTitles.has(t))).toBe(false);
  expect(enhancedTitles.size).toBeGreaterThan(0);
  expect(customTitles.size).toBeGreaterThan(0);
  expect(enhancedTitles.size + customTitles.size).toBeGreaterThanOrEqual(26);
});

test('text search matches the full classification label across categories (Favorites + Recent keep the metadata)', async ({ page }) => {
  // Seed favorites: one enhanced (accordion) + one custom (menu-list) from different categories.
  // Hardcoded to this edition's namespaced key (js/client-isolation.js) rather than fetched
  // from the live app: addInitScript runs before the page's own JS, so no import is possible.
  await page.addInitScript(() => {
    localStorage.setItem('rise-builder-att-favorites-v1', JSON.stringify(['accordion', 'menu-list']));
  });
  await catalog(page);

  await cat(page, 'favorites').click();
  await expect(page.locator(`#components-grid ${CARD}`)).toHaveCount(2);
  // Metadata is present on favorited cards.
  await expect(page.locator(`#components-grid ${CARD}`).first().locator('.card-classification-badge')).toBeVisible();
  await expect(page.locator(`#components-grid ${CARD}`).first().locator('.card-why-text')).not.toBeEmpty();

  await page.locator('#search-components').fill('Advanced Custom Interaction');
  await expect(page.locator(`#components-grid ${CARD}`)).toHaveCount(1);
  await expect(page.locator('#components-grid .card-classification-badge')).toHaveText('Advanced Custom Interaction');

  await page.locator('#search-components').fill('behaviour'); // only in accordion's differentiator
  await expect(page.locator(`#components-grid ${CARD}`)).toHaveCount(1);
  await expect(page.locator(`#components-grid ${CARD} h3`)).toHaveText(/Accordion/i);
});

test('catalog classification controls pass colour-contrast in light and dark mode, and re-theme', async ({ page }) => {
  await catalog(page);
  // Freeze CSS transitions so axe never samples a mid-theme-fade frame
  // (transition: all on .config-panel / .component-select-card / .classification-filter-btn).
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });

  const scan = () => new AxeBuilder({ page })
    .include('#catalog-state').exclude('#live-preview-iframe')
    .withRules(['color-contrast']).analyze();
  const idleBtnBg = () => page.locator(`${FILTER}:not(.active)`).first()
    .evaluate(el => getComputedStyle(el).backgroundColor);

  expect((await scan()).violations).toEqual([]);
  const lightBg = await idleBtnBg();

  await page.locator('#btn-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await scan()).violations).toEqual([]);
  // The idle filter buttons must actually re-theme, not stay stranded on the light surface.
  expect(await idleBtnBg()).not.toBe(lightBg);
});

for (const width of [768, 430, 375]) {
  test(`classification filter row does not overflow horizontally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await catalog(page);
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.classification-filter');
      return el ? el.scrollWidth > el.clientWidth + 1 : true;
    });
    expect(overflow).toBe(false);
  });
}
