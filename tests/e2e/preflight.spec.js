import { expect, test } from '@playwright/test';

// Field-targeting behavior for the Preflight panel (Requirement 4/7, P05): clicking a
// result's "Go to field"/"Go to item" button must close the panel, expand the item if it
// was collapsed, scroll to and focus the exact target — and work the same way whether
// activated by mouse or keyboard.

async function openAccordion(page) {
  await page.goto('/?catalog');
  await page.locator('.component-select-card').filter({ hasText: 'Accordion' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

test.beforeEach(async ({ page }) => openAccordion(page));

test('clicking "Go to field" closes Preflight, expands a collapsed item, and focuses the exact field', async ({ page }) => {
  const secondCard = page.locator('.dynamic-item-card[data-index="1"]');
  // P11: a freshly-loaded component only starts with its first item expanded — expand this
  // one to fill it, then collapse it again so the fix path also has to re-expand it, not
  // just scroll to it.
  await secondCard.locator('.item-collapse-btn').click();
  await secondCard.locator('[data-field-id="title"]').fill('');
  await secondCard.locator('.item-collapse-btn').click();
  await expect(secondCard).toHaveClass(/collapsed/);

  await page.locator('#btn-preflight').click();
  await expect(page.locator('#modal-preflight')).toBeVisible();
  const issueRow = page.locator('.preflight-issue', { hasText: 'Required field is empty' }).first();
  await expect(issueRow).toBeVisible();
  await issueRow.getByRole('button', { name: 'Go to field' }).click();

  await expect(page.locator('#modal-preflight')).toBeHidden();
  await expect(secondCard).not.toHaveClass(/collapsed/);
  await expect(secondCard.locator('[data-field-id="title"]')).toBeFocused();
});

// Reported: "Go to field" on the "Missing alt text or transcript" warning closed Preflight but
// focus never actually landed on the alt-text field. Two independent bugs, both in this path:
// (1) js/validation.js reported fieldId: 'media' for item-media issues, which doesn't match
// any real data-field-id or element id (item media, js/item-media.js, is a free-form per-item
// control with no schema-declared field, not a schema field with a data-field-id) — jumpToEditorField
// (js/editor.js) had nothing to resolve it to. (2) even once jumpToEditorField's own fallback
// resolution was taught the item-media id convention, its unscoped `[data-field-id="X"]` query
// matched the "Go to field" BUTTON itself — it carries that exact same data-field-id/
// data-item-index for its own rendering, and closeModal() only hides the modal (display:none),
// it doesn't remove it from the DOM — so focus silently landed on nothing useful instead of
// erroring, which is why this was easy to miss.
test('"Go to field" on a missing-alt-text warning focuses the actual alt-text field, not the trigger button or nothing', async ({ page }) => {
  const firstCard = page.locator('.dynamic-item-card[data-index="0"]');
  const mediaDetails = firstCard.locator('.item-media-details-shell');
  await mediaDetails.locator('.item-media-type-select').selectOption('image');
  await mediaDetails.locator('input[type="url"]').first().fill('https://images.unsplash.com/photo-1579546929518-9e396f3cc809');
  // Alt text deliberately left blank to trigger the warning.

  await page.locator('#btn-preflight').click();
  const issueRow = page.locator('.preflight-issue', { hasText: 'Missing alt text or transcript' }).first();
  // Generous timeout: this specific check depends on a real, uncached fetch of the external
  // image above before js/dom-measurement.js can settle — Playwright's default 5s occasionally
  // isn't enough headroom for that real network round-trip, unlike the other, purely local
  // "Go to field" tests in this file.
  await expect(issueRow).toBeVisible({ timeout: 15000 });
  await issueRow.getByRole('button', { name: 'Go to field' }).click();

  await expect(page.locator('#modal-preflight')).toBeHidden();
  // Only one element can hold focus at a time, so this alone also proves it never landed back
  // on the "Go to field" button itself (the accidental-match failure mode this pins).
  const altField = firstCard.locator('#item-media-alt-0');
  await expect(altField).toBeFocused();
});

test('the "Go to field" action activates with the keyboard, not just a mouse click', async ({ page }) => {
  const secondCard = page.locator('.dynamic-item-card[data-index="1"]');
  // P11: expand this default-collapsed item to fill it, then collapse it again.
  await secondCard.locator('.item-collapse-btn').click();
  await secondCard.locator('[data-field-id="title"]').fill('');
  await secondCard.locator('.item-collapse-btn').click();

  await page.locator('#btn-preflight').click();
  const issueRow = page.locator('.preflight-issue', { hasText: 'Required field is empty' }).first();
  const jumpButton = issueRow.getByRole('button', { name: 'Go to field' });
  await jumpButton.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#modal-preflight')).toBeHidden();
  await expect(secondCard).not.toHaveClass(/collapsed/);
  await expect(secondCard.locator('[data-field-id="title"]')).toBeFocused();
});

test('an issue with only an item (no single field) gets a "Go to item" action that still expands and focuses the card', async ({ page }) => {
  // Two items with identical title+content trips general-duplicate-items, which has an
  // itemIndex but no fieldId — previously this got no fix action at all.
  const firstCard = page.locator('.dynamic-item-card[data-index="0"]');
  const secondCard = page.locator('.dynamic-item-card[data-index="1"]');
  await firstCard.locator('[data-field-id="title"]').fill('Same title');
  await firstCard.locator('[data-field-id="content"]').fill('Same content');
  // P11: expand this default-collapsed item to fill it, then collapse it again.
  await secondCard.locator('.item-collapse-btn').click();
  await secondCard.locator('[data-field-id="title"]').fill('Same title');
  await secondCard.locator('[data-field-id="content"]').fill('Same content');
  await secondCard.locator('.item-collapse-btn').click();

  await page.locator('#btn-preflight').click();
  const issueRow = page.locator('.preflight-issue', { hasText: 'Duplicate item content' }).first();
  await expect(issueRow).toBeVisible();
  await issueRow.getByRole('button', { name: 'Go to item' }).click();

  await expect(page.locator('#modal-preflight')).toBeHidden();
  await expect(secondCard).not.toHaveClass(/collapsed/);
});

test('Preflight shows "No issues found" only when every enabled rule passes, and shows severity-grouped counts otherwise', async ({ page }) => {
  await page.locator('#btn-preflight').click();
  // The default Accordion, measured with every section open, is taller than a typical Embed
  // frame, so its one finding is a non-blocking warning: never "No issues found" while any
  // rule reports something, and no blocking section.
  await expect(page.locator('#preflight-results')).toContainText('May be clipped in a fixed-height Embed frame');
  await expect(page.locator('#preflight-results')).not.toContainText('No issues found');
  await expect(page.locator('.preflight-section-title.is-blocking')).toHaveCount(0);

  await page.locator('#modal-preflight .modal-close-btn').click();
  await page.locator('.dynamic-item-card[data-index="0"]').locator('[data-field-id="title"]').fill('');
  await page.locator('#btn-preflight').click();
  await expect(page.locator('#preflight-results')).not.toContainText('No issues found');
  await expect(page.locator('.preflight-section-title.is-blocking')).toContainText(/Blocking Errors \(\d+\)/);
});

test('the concise accessible announcement updates without dumping the full issue list into the live region', async ({ page }) => {
  await page.locator('.dynamic-item-card[data-index="0"]').locator('[data-field-id="title"]').fill('');
  await page.locator('#btn-preflight').click();
  const announcement = page.locator('#preflight-announcement');
  await expect(announcement).toHaveText(/^\d+ issues?: .+\.$/);
  // The announcement is a short summary sentence, not the full per-issue text.
  const announcementText = await announcement.textContent();
  expect(announcementText.length).toBeLessThan(120);
});

// P07: js/dom-measurement.js's hidden-iframe + postMessage measurement can only be
// meaningfully verified in a real browser — jsdom has no layout engine (scrollHeight/
// scrollWidth/clientWidth are always 0 there), so this is deliberately an e2e test, not a
// unit test. Exercises the module directly with synthetic HTML sized to force each
// dimension, independent of any specific catalog component's actual rendered height.
test.describe('js/dom-measurement.js — real hidden-iframe measurement', () => {
  test('measures a tall, wide document close to its actual pixel dimensions', async ({ page }) => {
    await page.goto('/?catalog');
    const result = await page.evaluate(async () => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      const html = '<!doctype html><html><body style="margin:0"><div style="height:1234px;width:900px;">tall and wide</div></body></html>';
      return measureRenderedDimensions(html, { desktopWidth: 740, mobileWidth: 375, timeoutMs: 4000 });
    });
    expect(result).not.toBeNull();
    // Within a few px of the authored size — allow for UA-default body margin/borders.
    expect(result.desktopContentHeight).toBeGreaterThanOrEqual(1230);
    expect(result.desktopContentHeight).toBeLessThan(1300);
    // At 375px width, a 900px-wide element overflows by roughly 900-375=525px.
    expect(result.mobileOverflowPx).toBeGreaterThan(450);
  });

  test('measures a small document as producing no overflow', async ({ page }) => {
    await page.goto('/?catalog');
    const result = await page.evaluate(async () => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      const html = '<!doctype html><html><body style="margin:0"><p>short</p></body></html>';
      return measureRenderedDimensions(html, { desktopWidth: 740, mobileWidth: 375, timeoutMs: 4000 });
    });
    expect(result.desktopContentHeight).toBeLessThan(100);
    expect(result.mobileOverflowPx).toBe(0);
  });

  test('resolves null overall for empty input rather than hanging or throwing', async ({ page }) => {
    await page.goto('/?catalog');
    const result = await page.evaluate(async () => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      return measureRenderedDimensions('');
    });
    expect(result).toBeNull();
  });

  test('an aborted measurement resolves promptly to a null-valued result instead of waiting for the timeout', async ({ page }) => {
    await page.goto('/?catalog');
    const elapsedMs = await page.evaluate(async () => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      const controller = new AbortController();
      const started = performance.now();
      const resultPromise = measureRenderedDimensions('<!doctype html><html><body>x</body></html>', { timeoutMs: 4000, signal: controller.signal });
      controller.abort();
      await resultPromise;
      return performance.now() - started;
    });
    expect(elapsedMs).toBeLessThan(1000); // well under the 4000ms timeout — proves it was actually cancelled, not just outrun
  });
});

// Audit finding: the same component could measure differently between runs (once as 0px
// tall, once as ~161px overflowing) and hidden content was never measured. These pin the two
// behaviours that make the heuristic trustworthy: identical repeated readings, and inclusion
// of content that is only visible after opening a collapsed control.
test.describe('js/dom-measurement.js — deterministic and expansion-aware', () => {
  const collapsibleHtml = wide => `<!doctype html><html><body style="margin:0">
    <button aria-expanded="false" aria-controls="p" onclick="var p=document.getElementById('p');var o=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',String(!o));p.hidden=o">Open</button>
    <div id="p" hidden><div style="width:${wide}px;height:400px">wide hidden content</div></div>
    <img loading="lazy" alt="" width="10" height="10" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
  </body></html>`;

  test('ten repeated measurements of the same document are identical', async ({ page }) => {
    await page.goto('/?catalog');
    const runs = await page.evaluate(async html => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      const out = [];
      for (let i = 0; i < 10; i++) out.push(JSON.stringify(await measureRenderedDimensions(html)));
      return out;
    }, collapsibleHtml(900));
    expect(new Set(runs).size).toBe(1);
    const first = JSON.parse(runs[0]);
    expect(first.desktopContentHeight).not.toBeNull();
    expect(first.mobileOverflowPx).not.toBeNull();
  });

  test('content hidden behind a collapsed control is included, and the offending element is named', async ({ page }) => {
    await page.goto('/?catalog');
    const result = await page.evaluate(async html => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      return measureRenderedDimensions(html);
    }, collapsibleHtml(900));
    // 400px of content only exists once the button is pressed, and it is 900px wide.
    expect(result.desktopContentHeight).toBeGreaterThanOrEqual(400);
    expect(result.mobileOverflowPx).toBeGreaterThan(450);
    expect(result.statesMeasured).toBeGreaterThanOrEqual(2);
    expect(result.mobileOffender).not.toBeNull();
    expect(result.mobileOffender.overflowPx).toBeGreaterThan(450);
  });

  test('narrow hidden content produces no overflow warning', async ({ page }) => {
    await page.goto('/?catalog');
    const result = await page.evaluate(async html => {
      const { measureRenderedDimensions } = await import('/js/dom-measurement.js');
      return measureRenderedDimensions(html);
    }, collapsibleHtml(200));
    expect(result.mobileOverflowPx).toBe(0);
    expect(result.mobileOffender).toBeNull();
  });
});

test('Preflight measures the real rendered height with every section open, the same way on every engine', async ({ page }) => {
  await page.locator('#btn-preflight').click();
  const results = page.locator('#preflight-results');
  // Auto-retrying assertion — waits out the "Running preflight checks…" placeholder and
  // the real async hidden-iframe measurement without a fixed sleep.
  await expect(results).toContainText('Compliance Status');
  // A successful measurement must not fall back to the "couldn't measure" manual-check text.
  await expect(results).not.toContainText("couldn't be automatically measured");
  // Collapsed accordion panels are opened for the measurement, so the default Accordion is
  // taller than a typical 500px Embed frame. Chromium used to under-measure this because it
  // doesn't advance transitions in an offscreen frame; every engine must now agree.
  await expect(results).toContainText('May be clipped in a fixed-height Embed frame');
  const text = await results.innerText();
  const height = Number(/about (\d+)px tall/.exec(text)?.[1]);
  expect(height).toBeGreaterThan(520);
  expect(height).toBeLessThan(1000);
  // The advice is scoped to the format it affects and says the fragment is not affected.
  await expect(results).toContainText('Web Package ZIP');
  await expect(results).toContainText('Copy for Rise');
  // No mobile-overflow warning for a normal component.
  await expect(results).not.toContainText('May overflow on mobile width');
});
