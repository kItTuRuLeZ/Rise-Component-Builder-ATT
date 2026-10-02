import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Audit 2026-09-30, section 5, as a UAT tester experiences it: the import help names every
// supported component, the macro-enabled template and the example can be downloaded, and the example that is
// downloaded imports as-is, keeping all 34 rows (26 Builder components + 8 Rise references).

async function openImporter(page) {
  await page.goto('/?dashboard');
  await page.locator('#starter-action-storyboard').click();
  await expect(page.locator('#sbi-file-input')).toBeAttached();
}

async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

test('the import help lists all 26 supported components, not four, and explains Rise references', async ({ page }) => {
  await openImporter(page);
  const importer = page.locator('#storyboard-import-workspace');
  await expect(importer.getByRole('heading', { name: /Supported Builder components \(26\)/ })).toBeVisible();
  await expect(importer.locator('#sbi-supported-list li')).toHaveCount(26);
  for (const name of ['Accordion', 'Study Cards', 'Interactive Gauge', 'Interactive Video', 'Policy & Alert Cards', 'Fill in the Blank', 'Confidence Matrix']) {
    await expect(importer.locator('#sbi-supported-list').getByText(name, { exact: true })).toBeVisible();
  }
  // The stale four-type sentence is gone.
  await expect(importer).not.toContainText('Horizontal Timeline) is imported from its own');
  await expect(importer.locator('#sbi-rise-note')).toContainText('excluded from the Builder');
  await expect(importer.locator('#sbi-rise-note')).toContainText('Rise Build Sheet');
  await expect(importer).toContainText('does not create native Rise blocks');
});

test('the template and example actions are real, named links; there is no field-guide download', async ({ page }) => {
  await openImporter(page);
  const importer = page.locator('#storyboard-import-workspace');
  const template = importer.getByRole('link', { name: /Download storyboard template with macro \(\.docm\)/ });
  const example = importer.getByRole('link', { name: /Download example with all components/ });
  await expect(template).toBeVisible();
  await expect(example).toBeVisible();
  await template.focus();
  await expect(template).toBeFocused();
  await expect(template).toHaveAttribute('download', '');
  await expect(importer.getByRole('button', { name: /field guide/i })).toHaveCount(0);
  await expect(importer.getByRole('link', { name: /field guide/i })).toHaveCount(0);
  await expect(importer.getByRole('link', { name: /blank template \(\.docx\)/i })).toHaveCount(0);
  // The template says what Word will ask for before the macro can run.
  await expect(importer).toContainText('enable editing');
});

test('the storyboard template downloads as a real macro-enabled .docm (a ZIP with a VBA project)', async ({ page }) => {
  await openImporter(page);
  const { name, bytes } = await download(page, page.locator('#sbi-download-template'));
  expect(name).toBe('Rise_Component_Storyboard_Template.docm');
  expect(bytes.length).toBeGreaterThan(10000);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes(Buffer.from('vbaProject.bin'))).toBe(true);
});

test('the storyboard file picker accepts both .docx and .docm', async ({ page }) => {
  await openImporter(page);
  const accept = await page.locator('#sbi-file-input').getAttribute('accept');
  expect(accept.split(',').map(value => value.trim())).toEqual(expect.arrayContaining(['.docx', '.docm']));
});

test('the downloaded .docm is uploaded as-is and read without blocking findings', async ({ page }) => {
  await openImporter(page);
  const { name, bytes } = await download(page, page.locator('#sbi-download-template'));
  await page.locator('#sbi-file-input').setInputFiles({ name, mimeType: 'application/vnd.ms-word.document.macroEnabled.12', buffer: bytes });
  const importer = page.locator('#storyboard-import-workspace');
  await expect(importer.locator('#sbi-review-counts')).toBeVisible();
  await expect(importer.locator('#sbi-review-counts')).toContainText('Builder component');
  await expect(importer).not.toContainText('could not be read');
});

test('the example that is downloaded imports as-is: 26 Builder components + 8 Rise references, all 34 rows kept in order, build sheet keeps all 8', async ({ page }) => {
  await openImporter(page);
  const { name, bytes } = await download(page, page.locator('#sbi-download-example'));
  expect(name).toBe('Rise_Storyboard_All_Components_Example.docx');

  // Upload exactly what was downloaded.
  await page.locator('#sbi-file-input').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes });
  const importer = page.locator('#storyboard-import-workspace');
  await expect(importer.locator('#sbi-review-counts')).toContainText('26 Builder components + 8 Rise references (34 outline rows)');
  await expect(importer).toContainText('excluded from the Builder');
  await expect(importer).not.toContainText('must be fixed before this can be imported');
  await expect(page.locator('#sbi-confirm-btn')).toBeEnabled();

  await page.locator('#sbi-confirm-btn').click();
  const overview = page.locator('#project-overview-workspace');
  await expect(overview).toBeVisible();
  await expect(overview.locator('.component-row')).toHaveCount(34);

  await page.locator('#wp-rise-sheet-btn').click();
  const sheet = page.locator('[id$="rise-sheet-text"]');
  await expect(sheet).toBeVisible();
  const text = await sheet.inputValue();
  expect(text).toContain('8 Rise blocks');
  // All eight references, in outline order (S01-B01 ... S04-B08).
  const ids = [...text.matchAll(/^- (S\d{2}-B\d{2}) —/gm)].map(match => match[1]);
  expect(ids).toHaveLength(8);
  expect(ids).toEqual([...ids].sort());
});
