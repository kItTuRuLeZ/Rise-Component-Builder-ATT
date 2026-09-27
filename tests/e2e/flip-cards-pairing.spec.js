import { expect, test } from '@playwright/test';

// A flip card is one Front + one Back (components/flip-cards.js#generateHTML pairs items up
// positionally). Add/Move/Duplicate/Delete in the editor must act on the whole pair, never a
// lone face — see js/editor.js and js/utilities.js#formatItemLabel.

async function openStudyCards(page) {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: 'Study Cards' }).first().click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

function cardHeadings(page) {
  return page.locator('#dynamic-items-container .item-collapse-btn');
}

test('Add Item adds a Front and a Back together, not one lone face', async ({ page }) => {
  await openStudyCards(page);
  const startCount = await cardHeadings(page).count();
  await page.locator('#btn-add-item').click();
  await expect(cardHeadings(page)).toHaveCount(startCount + 2);
  const headings = await cardHeadings(page).allTextContents();
  expect(headings.at(-2)).toContain('(Front)');
  expect(headings.at(-1)).toContain('(Back)');
});

test('Delete on the Back face removes the whole card, not just the Back', async ({ page }) => {
  await openStudyCards(page);
  await page.locator('#btn-add-item').click(); // a fresh, known pair at the end
  const cardsBefore = await cardHeadings(page).count();
  const cards = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)');
  await cards.last().locator('[title="Delete card"]').click();
  await expect(cardHeadings(page)).toHaveCount(cardsBefore - 2);
});

test('Duplicate on the Front face duplicates both faces together', async ({ page }) => {
  await openStudyCards(page);
  const startCount = await cardHeadings(page).count();
  const cards = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)');
  await cards.first().locator('[title="Duplicate card"]').click();
  await expect(cardHeadings(page)).toHaveCount(startCount + 2);
});

test('Move up/down on a card moves the whole pair, keeping Front before Back', async ({ page }) => {
  await openStudyCards(page);
  const cards = page.locator('#dynamic-items-container > .dynamic-item-card:not(.component-fields-card)');
  const firstFrontBefore = await cards.first().locator('.item-collapse-btn').textContent();
  await cards.nth(2).locator('[title="Move card up"]').click(); // second card's Front, moves it above the first card
  const headings = await cardHeadings(page).allTextContents();
  expect(headings[0]).not.toBe(firstFrontBefore);
  expect(headings[0]).toContain('(Front)');
  expect(headings[1]).toContain('(Back)');
});
