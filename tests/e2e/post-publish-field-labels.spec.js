import { expect, test } from '@playwright/test';

// The Post-Publish editors placed each <label> beside its control without associating them, so the
// Support Email, Phone, Hours and Department fields (and every glossary, resource and style field)
// had no programmatic label. getByLabel resolves through the browser's own label association.

async function reachAddContent(page) {
  await page.goto('/?post-publish');
  const base64 = await page.evaluate(async () => {
    const { createZip } = await import('/js/zip.js');
    const blob = createZip([{ path: 'index.html', data: '<html><body>Rise 360 course</body></html>' }, { path: 'lib/rise/main.js', data: '//' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  });
  await page.locator('#ppt-zip-input').setInputFiles({ name: 'course.zip', mimeType: 'application/zip', buffer: Buffer.from(base64, 'base64') });
  await expect(page.locator('.ppt-package-detected-card')).toHaveClass(/success/);
  await page.locator('#btn-ppt-next').click();
  await page.locator('#btn-ppt-next').click();
  await expect(page.locator('.ppt-subtab-btn').first()).toBeVisible();
}

const tab = (page, key) => page.locator(`.ppt-subtab-btn[data-tab="${key}"]`).click();

// A control with no label, no aria-label and no wrapping label: the thing that used to be everywhere.
const unlabelledCount = page => page.evaluate(() => {
  const controls = [...document.querySelectorAll('.ppt-step-panel input, .ppt-step-panel select, .ppt-step-panel textarea')]
    .filter(c => !['hidden', 'file', 'search'].includes(c.type) && !c.closest('.rich-text-editor-container'));
  return controls.filter(c => !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby') && !c.closest('label')
    && !(c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`))).length;
});

test('Help & Support: the contact fields are reachable by their visible labels', async ({ page }) => {
  await reachAddContent(page);
  await tab(page, 'help');
  for (const label of ['Support Email Address', 'Support Phone / Hotline', 'Support Portal URL', 'Support / Office Hours', 'Course Owner / Department']) {
    await expect(page.getByLabel(label, { exact: true }), label).toHaveCount(1);
  }
  await page.getByLabel('Support Email Address', { exact: true }).fill('help@acme-telecom.net');
  await expect(page.getByLabel('Support Email Address', { exact: true })).toHaveValue('help@acme-telecom.net');
  expect(await unlabelledCount(page)).toBe(0);
});

test('Glossary and Resources fields are labelled, a required field\'s asterisk is not read, and it is marked required', async ({ page }) => {
  await reachAddContent(page);
  await tab(page, 'glossary');
  await expect(page.getByRole('textbox', { name: 'Term', exact: true }).first()).toHaveAttribute('aria-required', 'true');
  await expect(page.getByLabel('Acronym / Abbreviation', { exact: true }).first()).toBeVisible();
  expect(await unlabelledCount(page)).toBe(0);
  await tab(page, 'resources');
  expect(await unlabelledCount(page)).toBe(0);
});

test('items added after load are labelled too (a new FAQ, a new glossary term)', async ({ page }) => {
  await reachAddContent(page);
  await tab(page, 'help');
  const before = await page.getByRole('textbox', { name: 'Question', exact: true }).count();
  await page.locator('#btn-add-faq').click();
  await expect(page.getByRole('textbox', { name: 'Question', exact: true })).toHaveCount(before + 1);
  expect(await unlabelledCount(page)).toBe(0);

  await tab(page, 'glossary');
  const terms = await page.getByRole('textbox', { name: 'Term', exact: true }).count();
  await page.locator('#btn-add-glossary-term').click();
  await expect(page.getByRole('textbox', { name: 'Term', exact: true })).toHaveCount(terms + 1);
  expect(await unlabelledCount(page)).toBe(0);
});

test('Style & Position: the launcher and theme fields, including the selects, are labelled', async ({ page }) => {
  await reachAddContent(page);
  await page.locator('#btn-ppt-next').click();
  for (const label of ['Launcher Button Label', 'Launcher Style', 'Screen Position', 'Default Active Tool Tab', 'Brand Theme Color']) {
    await expect(page.getByLabel(label, { exact: true }), label).toHaveCount(1);
  }
  expect(await unlabelledCount(page)).toBe(0);
});

test('every generated label points at exactly one control and ids are unique', async ({ page }) => {
  await reachAddContent(page);
  for (const key of ['glossary', 'resources', 'help']) {
    await tab(page, key);
    const problems = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.ppt-step-panel [id]')].map(e => e.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      const dangling = [...document.querySelectorAll('.ppt-step-panel label[for]')].filter(l => !document.getElementById(l.htmlFor)).map(l => l.textContent.trim());
      return { dupes, dangling };
    });
    expect(problems.dupes, `${key}: duplicate ids`).toEqual([]);
    expect(problems.dangling, `${key}: labels pointing nowhere`).toEqual([]);
  }
});
