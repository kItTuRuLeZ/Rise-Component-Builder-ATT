import { expect, test } from '@playwright/test';
import { compileExportFixture } from '../fixtures/export-fixture-definitions.mjs';

// A sentence can hold several [blank]s. The answer field then takes one line per blank, with
// commas separating synonyms on each line; a one-blank sentence works exactly as before.
const items = [
  { title: 'A project has a [blank], a [blank] and a [blank] constraint.', content: 'scope\ntime, schedule\ncost, budget' },
  { title: 'The [blank] path sets the earliest finish.', content: 'critical' }
];

async function open(page) {
  await page.setContent(compileExportFixture('fill-blank', { configOverrides: { items, fuzzyMatch: false } }));
}

test('every blank in a sentence gets its own labelled input', async ({ page }) => {
  await open(page);
  const inputs = page.locator('.blank-input');
  await expect(inputs).toHaveCount(4);
  await expect(inputs.nth(0)).toHaveAttribute('aria-label', 'Answer 1 of 3 for sentence 1');
  await expect(inputs.nth(2)).toHaveAttribute('aria-label', 'Answer 3 of 3 for sentence 1');
  await expect(inputs.nth(3)).toHaveAttribute('aria-label', 'Answer for sentence 2');
});

test('each blank is checked against its own answer line', async ({ page }) => {
  await open(page);
  const inputs = page.locator('.blank-input');
  await inputs.nth(0).fill('scope');
  await inputs.nth(1).fill('schedule');
  await inputs.nth(2).fill('quality');
  await inputs.nth(3).fill('critical');
  await page.locator('.quiz-submit-btn').click();

  await expect(inputs.nth(0)).toHaveClass(/is-correct/);
  await expect(inputs.nth(1)).toHaveClass(/is-correct/);
  await expect(inputs.nth(2)).toHaveClass(/is-incorrect/);
  await expect(inputs.nth(3)).toHaveClass(/is-correct/);
  await expect(page.locator('.blank-status-badge').first()).toContainText('2 of 3 correct');
  await expect(page.locator('.blank-status-badge').nth(1)).toContainText('Correct');
  await expect(page.locator('.quiz-feedback')).toContainText('need adjustment');

  await inputs.nth(2).fill('budget');
  await page.locator('.quiz-submit-btn').click();
  await expect(page.locator('.blank-status-badge').first()).toContainText('Correct');
  await expect(page.locator('.quiz-feedback')).toContainText('All answers are correct');
});

test('blanks answered in the wrong order are not accepted', async ({ page }) => {
  await open(page);
  const inputs = page.locator('.blank-input');
  await inputs.nth(0).fill('time');
  await inputs.nth(1).fill('scope');
  await inputs.nth(2).fill('cost');
  await inputs.nth(3).fill('critical');
  await page.locator('.quiz-submit-btn').click();
  await expect(inputs.nth(0)).toHaveClass(/is-incorrect/);
  await expect(inputs.nth(1)).toHaveClass(/is-incorrect/);
  await expect(inputs.nth(2)).toHaveClass(/is-correct/);
});
