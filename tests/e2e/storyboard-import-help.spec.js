import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Audit 2026-09-30, section 5, as a UAT tester experiences it: the import help names every
// supported component, the template and field guide can be downloaded, and the example that is
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

test('the template and field-guide actions are real, named controls reachable by keyboard', async ({ page }) => {
  await openImporter(page);
  const importer = page.locator('#storyboard-import-workspace');
  const blank = importer.getByRole('link', { name: /Download blank template/ });
  const example = importer.getByRole('link', { name: /Download example with all components/ });
  const guide = importer.getByRole('button', { name: /Download field guide/ });
  await expect(blank).toBeVisible();
  await expect(example).toBeVisible();
  await expect(guide).toBeVisible();
  await guide.focus();
  await expect(guide).toBeFocused();
  await expect(blank).toHaveAttribute('download', '');
});

test('the blank template downloads as a real .docx', async ({ page }) => {
  await openImporter(page);
  const { name, bytes } = await download(page, page.locator('#sbi-download-blank'));
  expect(name).toBe('Rise_Storyboard_Blank_Template.docx');
  expect(bytes.length).toBeGreaterThan(10000);
  expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a .docx is a ZIP
});

test('the field guide downloads, names every component and says what the importer does not do', async ({ page }) => {
  await openImporter(page);
  const { name, bytes } = await download(page, page.getByRole('button', { name: /Download field guide/ }));
  expect(name).toBe('Rise-Storyboard-Field-Guide.md');
  const text = bytes.toString('utf8');
  expect(text).toContain('storyboard field guide');
  expect(text).toContain('## Supported Builder components (26)');
  for (const component of ['### Accordion', '### Interactive Gauge', '### Interactive Video', '### Policy & Alert Cards']) expect(text).toContain(component);
  expect(text).toMatch(/does \*\*not\*\* author native Rise blocks/);
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
