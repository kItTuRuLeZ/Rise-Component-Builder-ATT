import { expect, test } from '@playwright/test';

async function openAccordion(page) {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

async function saveNamedProject(page, name) {
  await page.locator('#btn-save').click();
  await page.locator('#save-component-name').fill(name);
  await page.locator('#btn-confirm-save').click();
  await expect(page.locator('.toast')).toContainText('Saved');
}

test('project save, reload, open, draft restore, and delete persist locally', async ({ page }) => {
  await openAccordion(page);
  await page.locator('#input-block-headline').fill('Persisted headline');
  await saveNamedProject(page, 'Persistence E2E');
  // An explicit save leaves nothing to recover, so the dashboard must not offer the saved
  // work back as an "unsaved working draft". Saved projects reopen through Open.
  await page.goto('/?dashboard');
  await expect(page.locator('#btn-resume-draft')).toHaveCount(0);
  await page.goto('/?editor');
  await expect(page.locator('#editor-state')).toBeVisible();
  await page.locator('#btn-open').click();
  const card = page.locator('.saved-component-card').filter({ hasText: 'Persistence E2E' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Load' }).click();
  await expect(page.locator('#input-block-headline')).toHaveText('Persisted headline');
  await page.locator('#btn-open').click();
  await page.locator('.saved-component-card').filter({ hasText: 'Persistence E2E' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#modal-confirm')).toBeVisible();
  await page.locator('#btn-confirm-dialog-action').click();
  await expect(page.locator('.saved-component-card').filter({ hasText: 'Persistence E2E' })).toHaveCount(0);
});

test('favorites persist after browser reload', async ({ page }) => {
  await openAccordion(page);
  await page.locator('#btn-favorite-toggle').click();
  await page.reload();
  await page.getByText('Favorites', { exact: true }).click();
  await expect(page.locator('.component-select-card').filter({ hasText: 'Accordion' })).toBeVisible();
});

test('export contains selected content and theme, excludes unsafe executable markup, and downloads runnable HTML', async ({ page, context }) => {
  const errors = [];
  await openAccordion(page);
  await page.locator('#input-block-headline').fill('Exported <script>globalThis.bad=true</script> content');
  await page.locator('#btn-export').click();
  const code = page.locator('#export-html-code');
  await expect(code).toContainText('Exported');
  // This build is locked to a single AT&T theme (js/themes.js) — no Theme Manager exists
  // to switch themes, so the export always carries the AT&T Cobalt primary color.
  await expect(code).toContainText('--primary: #00388F');
  const exported = await code.textContent();
  expect(exported).not.toContain('<script>globalThis.bad=true</script>');

  // Modular export pipeline: an Accordion export must not ship quiz, gallery, audio,
  // video, or AI code (docs/EXPORT-CONTRACT.md).
  ['quiz-option', 'gallery-item-card', 'aud-player', 'video-wrapper', 'ai-generator-preview']
    .forEach(marker => expect(exported).not.toContain(marker));

  // The export dialog is now two cards — "Copy for Rise" and "Web Package ZIP". Its
  // Advanced options disclosure, the single-file #btn-download-html download and
  // #export-file-size all went away with the redesign, so the self-contained fragment is
  // taken from #export-html-code (exactly what the Copy button puts on the clipboard) and
  // the remaining download path is asserted through the ZIP card.
  await expect(page.locator('#export-html-size')).toContainText(/\d+(\.\d+)?\s*(B|KB|MB)/);
  const html = exported;
  expect(html).toContain('Exported');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-download-rise-zip').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(html).toContain('--primary: #00388F');
  const exportedPage = await context.newPage();
  exportedPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  exportedPage.on('pageerror', error => errors.push(error.message));
  await exportedPage.setContent(html);
  await expect(exportedPage.locator('.accordion-group')).toBeVisible();
  expect(errors).toEqual([]);

  // Requirement 3/8: the downloaded file works standalone (no builder app), and keyboard
  // interaction + ARIA state still function correctly post-refactor.
  const trigger = exportedPage.locator('.accordion-trigger').first();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await exportedPage.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

// The iframe-snippet export (#export-advanced-options / #export-iframe-code /
// #btn-copy-iframe) was removed from the dialog in the two-card redesign; "Copy for Rise"
// is the only copy path left, so that is what this now confirms.
test('export copy button copies the Rise code and shows visible confirmation', async ({ page, context, browserName }) => {
  // Firefox/WebKit don't support granting the 'clipboard-read'/'clipboard-write'
  // permissions through Playwright (Chromium-only CDP permissions), but the
  // app's own execCommand fallback (js/utilities.js) copies without needing
  // them, so the copy still works there — only the clipboard-content readback
  // below is Chromium-only.
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  }
  await openAccordion(page);
  await page.locator('#btn-export').click();

  const riseInstructions = page.locator('.instructions-alert').filter({ hasText: 'Steps to add in Articulate Rise' });
  await expect(riseInstructions).toContainText('Code');
  await expect(riseInstructions).toContainText('Add code');

  // The modal's HTML markup ships #export-html-code pre-seeded with a static placeholder
  // ("Customized component styles"); setupExportModalContent() only overwrites it once the
  // async preflight gate and export-preparation have finished. Wait for the real content —
  // reading textContent() the instant the modal opens can still catch that placeholder.
  const codeElement = page.locator('#export-html-code');
  await expect(codeElement).toContainText('--primary: #00388F');
  const expectedCode = await codeElement.textContent();
  const copyButton = page.locator('#btn-copy-html');
  await copyButton.click();

  await expect(copyButton).toHaveText('Copied!');
  await expect(copyButton).toHaveClass(/copy-success/);
  await expect(page.locator('.toast')).toContainText('Code copied to the clipboard.');

  if (browserName === 'chromium') {
    // The Windows clipboard round-trips line endings as CRLF, so every line of the export
    // comes back differing from the DOM's textContent unless endings are normalised first.
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'))
      .toBe(expectedCode);
  }
});

test('Export modal shows a compact size summary with code collapsed by default, and copy works without expanding it', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  }
  await openAccordion(page);
  await page.locator('#btn-export').click();

  // Compact summary (size + description) is visible without expanding anything.
  await expect(page.locator('#export-html-size')).toContainText(/\d+(\.\d+)?\s*(B|KB|MB)/);
  await expect(page.locator('#export-primary-code-box')).toContainText('Self-contained HTML, CSS & JavaScript');

  // The full code is collapsed behind a "Technical preview" disclosure, not always-expanded.
  const technicalPreview = page.locator('#export-primary-code-box .code-technical-preview');
  await expect(technicalPreview).not.toHaveAttribute('open', '');
  await expect(page.locator('#export-html-code')).toBeHidden();

  // Copying works without opening the technical preview.
  const expectedCode = await page.locator('#export-html-code').textContent();
  const copyButton = page.locator('#btn-copy-html');
  await copyButton.click();
  await expect(copyButton).toHaveText('Copied!');
  if (browserName === 'chromium') {
    // Windows normalizes \n -> \r\n on the system clipboard round-trip — irrelevant to
    // pasting into Rise's editor, so compare with line endings normalized rather than
    // asserting exact byte equality.
    const normalize = value => value.replace(/\r\n/g, '\n');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())
      .then(normalize)).toBe(normalize(expectedCode));
  }

  // Expanding the disclosure reveals the same code, unhidden.
  await technicalPreview.locator('summary').click();
  await expect(page.locator('#export-html-code')).toBeVisible();
});

test('completion tracking blocks Web Package ZIP export and guides back to Copy for Rise', async ({ page }) => {
  await openAccordion(page);
  await page.locator('.editor-tab[data-tab="completion"]').click();
  await page.locator('#completion-mode-all-items').check();
  await page.locator('#btn-export').click();

  // The primary "Copy for Rise" action is always the completion-compatible format —
  // never blocked by this gate.
  await expect(page.locator('#export-primary-title')).toHaveText('Rise Code Block with completion');
  await expect(page.locator('#btn-copy-html')).toBeEnabled();

  const zipButton = page.locator('#btn-download-rise-zip');
  await expect(zipButton).toBeDisabled();
  await expect(page.locator('#export-card-zip .completion-export-block')).toContainText('Copy for Rise');

  // Turning completion off releases the block.
  await page.locator('#modal-export .modal-close-btn').click();
  await page.locator('#completion-mode-none').check();
  await page.locator('#btn-export').click();
  await expect(page.locator('#btn-download-rise-zip')).toBeEnabled();
  await expect(page.locator('#export-card-zip .completion-export-block')).toHaveCount(0);
});
