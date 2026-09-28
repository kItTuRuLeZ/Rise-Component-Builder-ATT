import { expect, test } from '@playwright/test';

// P12: explicit initial-selection state and export readiness. appState.selectedComponent is
// the single source of truth for whether Save/Export are meaningful actions right now — see
// docs/ARCHITECTURE.md "Initial selection state and export readiness (P12)".

async function selectAccordion(page) {
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

test('fresh launch: catalog shown, preview empty, Save/Export disabled and explained', async ({ page }) => {
  await page.goto('/?catalog');
  await expect(page.locator('#catalog-state')).toBeVisible();
  await expect(page.locator('#editor-state')).toBeHidden();
  await expect(page.locator('#preview-empty-state')).toBeVisible();
  await expect(page.locator('#live-preview-iframe')).toBeHidden();

  const btnSave = page.locator('#btn-save');
  const btnExport = page.locator('#btn-export');
  await expect(btnSave).toBeDisabled();
  await expect(btnExport).toBeDisabled();
  await expect(btnExport).toHaveAttribute('title', /select a component/i);
  await expect(btnExport).toHaveAttribute('aria-label', /select a component/i);
});

test('selecting a component enables Save/Export and shows the live preview', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  await expect(page.locator('#preview-empty-state')).toBeHidden();
  await expect(page.locator('#live-preview-iframe')).toBeVisible();
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#btn-export')).toBeEnabled();
});

test('deselection: leaving the editor clears the preview and disables Save/Export again', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  // The editor's back control exits to the course workspace rather than the catalog now,
  // and the preview panel is not mounted there — so the "nothing selected" assertions below
  // are made where they are still observable, back on the catalog screen.
  await page.locator('#btn-back-to-catalog').click();
  await expect(page.locator('#dashboard-workspace')).toBeVisible();
  await expect(page.locator('#editor-state')).toBeHidden();
  await page.goto('/?catalog');
  await expect(page.locator('#catalog-state')).toBeVisible();
  await expect(page.locator('#preview-empty-state')).toBeVisible();
  await expect(page.locator('#live-preview-iframe')).toBeHidden();
  await expect(page.locator('#btn-save')).toBeDisabled();
  await expect(page.locator('#btn-export')).toBeDisabled();
});

test('opening a saved project restores selection with Save/Export enabled', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  await page.locator('#btn-save').click();
  await page.locator('#save-component-name').fill('Reopen Me');
  await page.locator('#btn-confirm-save').click();
  await expect(page.locator('.toast')).toContainText('Saved');

  // #btn-open sits on the contextual authoring toolbar, which app.js only shows in the
  // editor state, so reopening starts from the editor deep link rather than the catalog.
  await page.goto('/?editor');
  await expect(page.locator('#editor-state')).toBeVisible();
  await page.locator('#btn-open').click();
  await page.locator('.saved-component-card').filter({ hasText: 'Reopen Me' }).getByRole('button', { name: 'Load' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#btn-export')).toBeEnabled();
});

test('a restored draft on reload also lands with Save/Export enabled', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  await page.waitForTimeout(800); // clears the 700ms draft-save debounce
  // Draft restoration is an explicit dashboard action now, not an automatic reload effect.
  await page.goto('/?dashboard');
  await page.locator('#btn-resume-draft').click();
  await expect(page.locator('#editor-state')).toBeVisible();
  await expect(page.locator('#btn-save')).toBeEnabled();
  await expect(page.locator('#btn-export')).toBeEnabled();
});

test('a Blocking issue disables the export actions inside the modal', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  await page.locator('.dynamic-item-card[data-index="0"]').locator('[data-field-id="title"]').fill('');

  await page.locator('#btn-export').click();
  await expect(page.locator('#export-preflight-results')).toContainText(/blocking/i);
  await expect(page.locator('#btn-copy-html')).toBeDisabled();
  await expect(page.locator('#btn-download-rise-zip')).toBeDisabled();
});

test('a Warning-only issue does not disable the export actions', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  // Completion tracking on with no export format chosen yet fires
  // general-completion-iframe-format — a Warning, not Blocking (js/validation.js).
  await page.locator('.editor-tab[data-tab="completion"]').click();
  await page.locator('#completion-mode-all-items').check();

  await page.locator('#btn-export').click();
  await expect(page.locator('#export-preflight-results')).not.toContainText(/blocking errors/i);
  await expect(page.locator('#btn-copy-html')).toBeEnabled();
});

test('a clean selection can export successfully', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);
  await page.locator('#btn-export').click();
  await expect(page.locator('#btn-copy-html')).toBeEnabled();

  // Web Package ZIP is the export dialog's only download path since the single-file HTML
  // download and the Advanced options disclosure were removed.
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-download-rise-zip').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

// Audit: the Export modal used to open showing its two cards already populated with "—"
// placeholder sizes and no compliance section at all, then fill in the compliance banner and
// real sizes a moment later once setupExportModalContent() (app.js) finished — a jarring
// half-populated-then-rich two-step reveal. It now shows a dedicated loading state instead and
// swaps straight to the fully-populated content in one step.
test('the Export modal shows a loading state, not a half-populated one, before settling on the full content', async ({ page }) => {
  await page.goto('/?catalog');
  await selectAccordion(page);

  // Dispatch the click and read the resulting DOM state in the same synchronous script — this
  // is the only way to reliably observe the state right after the click, since
  // setupExportModalContent()'s own async work can otherwise resolve before a separate
  // Playwright action/assertion round-trip gets a chance to check.
  const immediatelyAfterClick = await page.evaluate(() => {
    document.getElementById('btn-export').click();
    const loading = document.getElementById('export-modal-loading');
    const content = document.getElementById('export-modal-content');
    return { loadingHidden: loading.hidden, contentHidden: content.hidden };
  });
  expect(immediatelyAfterClick.loadingHidden).toBe(false);
  expect(immediatelyAfterClick.contentHidden).toBe(true);

  // Once ready, the swap is complete — never a partial state with the loading indicator still
  // showing alongside real content, or vice versa.
  await expect(page.locator('#btn-copy-html')).toBeEnabled();
  await expect(page.locator('#export-modal-content')).toBeVisible();
  await expect(page.locator('#export-modal-loading')).toBeHidden();
});
