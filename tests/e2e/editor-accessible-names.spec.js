import { expect, test } from '@playwright/test';

// The editor's rich-text fields are <div contenteditable role="textbox">. A <label for> cannot name
// a div, so a screen reader used to announce them with no name at all. These tests use the
// browser's own accessibility tree (getByRole / ariaSnapshot), not the attributes we set.

async function openFromCatalog(page, name) {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: name }).first().click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

test('the block header fields are exposed with their visible labels as names', async ({ page }) => {
  await openFromCatalog(page, 'Accordion');
  const editor = page.locator('#editor-state');
  for (const name of ['Block Label / Category', 'Main Headline', 'Instructional Subtext']) {
    await expect(editor.getByRole('textbox', { name, exact: true })).toBeVisible();
  }
  // Only shown once completion tracking is on, but named all the same.
  await expect(editor.getByRole('textbox', { name: 'Completion Success Message', exact: true, includeHidden: true })).toBeAttached();
});

test('a repeated item\'s rich-text fields are named, and a required field\'s asterisk is not read as part of the name', async ({ page }) => {
  await openFromCatalog(page, 'Horizontal Tabs');
  const editor = page.locator('#editor-state');
  await expect(editor.getByRole('textbox', { name: 'Tab Label', exact: true })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Tab Content', exact: true })).toBeVisible();
});

test('clicking a field label moves focus into its rich-text editor', async ({ page }) => {
  await openFromCatalog(page, 'Accordion');
  await page.locator('label', { hasText: 'Main Headline' }).click();
  await expect(page.locator('#input-block-headline')).toBeFocused();
  // Typing lands in that field, i.e. the label really reached the editor.
  await page.keyboard.type('x');
  await expect(page.locator('#input-block-headline')).toContainText('x');
});

for (const component of ['Accordion', 'Horizontal Tabs', 'Study Cards', 'Hotspots', 'Interactive Gauge', 'Comparison Slider']) {
  test(`no rich-text or text editor in ${component} is left without an accessible name`, async ({ page }) => {
    await openFromCatalog(page, component);
    // Open every collapsed item so its fields are in the accessibility tree.
    await page.evaluate(() => document.querySelectorAll('.dynamic-item-card.collapsed .item-collapse-btn').forEach(button => button.click()));
    const snapshot = await page.locator('#editor-state').ariaSnapshot();
    // A named textbox renders as `- textbox "Name"`; an unnamed one as a bare `- textbox`.
    const unnamed = snapshot.split('\n').map(line => line.trim()).filter(line => /^- textbox(?!\s+")/.test(line));
    expect(unnamed).toEqual([]);
    expect(await page.locator('#editor-state [contenteditable="true"][role="textbox"]').count()).toBeGreaterThan(0);
  });
}
