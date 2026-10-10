import { expect, test } from '@playwright/test';

// UAT (Oct 2026) behaviour bugs, checked against the real exported markup running in a browser page.

async function exportedHtml(page, componentId, overrides = {}, itemsOverride = null) {
  await page.goto('/?editor');
  return page.evaluate(async ({ componentId, overrides, itemsOverride }) => {
    const { generateIframeContent } = await import('/js/preview.js');
    const { COMPONENT_REGISTRY, getComponentById, getDefaultConfig } = await import('/js/component-registry.js');
    const { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyThemeToConfig } = await import('/js/themes.js');
    const { toRgba } = await import('/js/utilities.js');
    const theme = BUILT_IN_THEMES.find(entry => entry.id === DEFAULT_THEME_ID);
    const registry = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, version: entry.version }]));
    const entry = getComponentById(COMPONENT_REGISTRY, componentId);
    const config = applyThemeToConfig({ blockTitle: 'Block', blockHeadline: 'Headline', blockDesc: 'Desc', completionMsg: 'Done', ...getDefaultConfig(entry), ...overrides }, theme);
    if (itemsOverride) config.items = itemsOverride;
    return generateIframeContent({ selectedComponent: { id: componentId }, activeTheme: theme, componentOverrides: {}, config, currentProjectId: 'p' }, registry, toRgba);
  }, { componentId, overrides, itemsOverride });
}

async function open(page, html) {
  await page.setContent(html);
  await page.waitForTimeout(300);
}

test.describe('Try again belongs to a missed question', () => {
  test('Multiple Choice: no Try again after a correct answer, Try again after a miss, and it restarts the question', async ({ page }) => {
    const html = await exportedHtml(page, 'multiple-choice', { mcAllowReset: true, mcMaxAttempts: 1 });
    await open(page, html);
    await page.locator('.quiz-option').first().click(); // Option A is the correct one
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-feedback')).toContainText('Correct');
    await expect(page.locator('.quiz-reset-btn')).toBeHidden();

    await open(page, html);
    await page.locator('.quiz-option').nth(1).click();
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-reset-btn')).toBeVisible();
    await page.locator('.quiz-reset-btn').click();
    await expect(page.locator('.quiz-reset-btn')).toBeHidden();
    await expect(page.locator('.quiz-option[aria-checked="true"]')).toHaveCount(0);
  });

  test('Multiple Select: no Try again after the right selection, Try again once the attempts are used', async ({ page }) => {
    const items = [{ label: 'A', correct: true, content: '' }, { label: 'B', correct: false, content: '' }, { label: 'C', correct: true, content: '' }];
    const html = await exportedHtml(page, 'multiple-select', { msAllowReset: true, msMaxAttempts: 1, msPartialScoring: true }, items);
    await open(page, html);
    await page.locator('.quiz-option').nth(0).click();
    await page.locator('.quiz-option').nth(2).click();
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-feedback')).toContainText('Correct');
    await expect(page.locator('.quiz-reset-btn')).toBeHidden();

    await open(page, html);
    await page.locator('.quiz-option').nth(1).click();
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-reset-btn')).toBeVisible();
    await page.locator('.quiz-reset-btn').click();
    await expect(page.locator('.quiz-reset-btn')).toBeHidden();
  });
});

test.describe('Fill in the Blank', () => {
  const items = [
    { title: 'Rise uses [blank] blocks.', content: 'code', hint: 'Think of HTML' },
    { title: 'Keep builds [blank].', content: 'light', hint: '' }
  ];

  test('one correct sentence of two is partial progress, not 0%', async ({ page }) => {
    await open(page, await exportedHtml(page, 'fill-blank', { trackCompletion: true }, items));
    await page.locator('.blank-input').first().fill('code');
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('[id$="-completion-text"]')).toHaveText('50%');
  });

  test('answers lock once everything is right, but a wrong attempt can still be edited', async ({ page }) => {
    await open(page, await exportedHtml(page, 'fill-blank', { trackCompletion: true }, items));
    await page.locator('.blank-input').nth(0).fill('code');
    await page.locator('.blank-input').nth(1).fill('heavy');
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.blank-input').nth(1)).toBeEditable();
    await page.locator('.blank-input').nth(1).fill('light');
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.blank-input').nth(0)).not.toBeEditable();
    await expect(page.locator('.blank-input').nth(1)).not.toBeEditable();
    await expect(page.locator('[id$="-completion-text"]')).toHaveText('100%');
  });

  test('the failed-attempt message mentions clues only when clues exist', async ({ page }) => {
    await open(page, await exportedHtml(page, 'fill-blank', {}, [{ title: 'A [blank].', content: 'x', hint: '' }]));
    await page.locator('.blank-input').fill('nope');
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-feedback')).not.toContainText(/clue/i);

    await open(page, await exportedHtml(page, 'fill-blank', {}, [{ title: 'A [blank].', content: 'x', hint: 'a clue' }]));
    await page.locator('.blank-input').fill('nope');
    await page.locator('.quiz-submit-btn').click();
    await expect(page.locator('.quiz-feedback')).toContainText(/clue/i);
  });
});

test.describe('Hotspots', () => {
  const markers = [
    { title: 'Hub', content: '<p>Hub details go here.</p>', x: '30', y: '40', markerType: 'number', audioSourceType: 'url', audioUrl: 'https://example.org/narration.mp3', audioTranscript: '' },
    { title: 'Edge', content: '<p>Edge details.</p>', x: '60', y: '60', markerType: 'number', audioSourceType: 'url', audioUrl: '', audioTranscript: '' }
  ];

  // Count calls to play() so the test does not depend on a real network or on browser autoplay rules.
  async function openWithPlaySpy(page, html) {
    await open(page, html);
    await page.evaluate(() => {
      window.__plays = 0;
      HTMLMediaElement.prototype.play = function () { window.__plays += 1; return Promise.resolve(); };
    });
  }

  for (const mode of ['drawer', 'modal']) {
    test(`${mode} mode shows the marker's text and audio`, async ({ page }) => {
      await openWithPlaySpy(page, await exportedHtml(page, 'hotspots', { calloutMode: mode, autoplayAudio: false }, markers));
      await page.locator('.hotspot-pin').first().click();
      const body = page.locator(mode === 'drawer' ? '.hotspot-drawer-body' : '.hotspot-modal-body');
      await expect(body).toContainText('Hub details go here.');
      await expect(body.locator('audio')).toHaveCount(1);
      expect(await page.evaluate(() => window.__plays)).toBe(0);
    });
  }

  test('audio plays by itself only when Auto-play is on (tooltip mode)', async ({ page }) => {
    await openWithPlaySpy(page, await exportedHtml(page, 'hotspots', { calloutMode: 'tooltip', autoplayAudio: false }, markers));
    await page.locator('.hotspot-pin').first().click();
    expect(await page.evaluate(() => window.__plays)).toBe(0);

    await openWithPlaySpy(page, await exportedHtml(page, 'hotspots', { calloutMode: 'tooltip', autoplayAudio: true }, markers));
    await page.locator('.hotspot-pin').first().click();
    expect(await page.evaluate(() => window.__plays)).toBe(1);
  });
});

test.describe('"Allow learner to reset / restart after completion"', () => {
  test('a component without its own reset gets a Start over button once complete, and only then', async ({ page }) => {
    await open(page, await exportedHtml(page, 'accordion', { trackCompletion: true, allowReset: true, accordionMulti: true }));
    const reset = page.locator('[id$="-completion-reset"]');
    await expect(reset).toBeHidden();
    const triggers = page.locator('.accordion-trigger');
    const count = await triggers.count();
    for (let i = 0; i < count; i += 1) await triggers.nth(i).click();
    await expect(page.locator('[id$="-completion-text"]')).toHaveText('100%');
    await expect(reset).toBeVisible();
    await expect(reset).toHaveText('Start over');
  });

  test('no button when the option is off, and none duplicated on components that have their own reset', async ({ page }) => {
    await open(page, await exportedHtml(page, 'accordion', { trackCompletion: true, allowReset: false }));
    await expect(page.locator('[id$="-completion-reset"]')).toHaveCount(0);
    await open(page, await exportedHtml(page, 'sorting-activity', { trackCompletion: true, allowReset: true }));
    await expect(page.locator('[id$="-completion-reset"]')).toHaveCount(0);
    await expect(page.locator('.sorting-reset-btn')).toHaveCount(1);
  });
});

test.describe('Tabs', () => {
  test('vertical tabs with Compare and Auto-play: the toolbar sits above the tab list and panel, the compare picker below, nothing overlaps', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await open(page, await exportedHtml(page, 'tab-blocks', { tabsOrientation: 'vertical', tabsAutoAdvance: true, tabsCompareMode: true, tabsShowProgress: true }));
    await page.locator('.tabs-compare-toggle-btn').click();
    const box = async selector => (await page.locator(selector).first().boundingBox());
    const toolbar = await box('.tabs-toolbar');
    const nav = await box('.tabs-nav-wrapper');
    const panel = await box('.tabs-content-wrapper');
    const compare = await box('.tabs-compare-panel');
    expect(nav.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 1);
    expect(panel.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 1);
    expect(panel.x).toBeGreaterThanOrEqual(nav.x + nav.width - 1); // beside the tab list, not under or over it
    expect(compare.y).toBeGreaterThanOrEqual(Math.max(nav.y + nav.height, panel.y + panel.height) - 1);
    expect(panel.width).toBeGreaterThan(300); // the text is no longer squeezed into a narrow column
  });

  test('a locked tab does not react to hover', async ({ page }) => {
    await open(page, await exportedHtml(page, 'tab-blocks', { tabsSequential: true }));
    const locked = page.locator('.tab-btn[aria-disabled="true"]').first();
    const style = () => locked.evaluate(el => { const cs = getComputedStyle(el); return `${cs.borderColor}|${cs.color}`; });
    const before = await style();
    await locked.hover({ force: true });
    expect(await style()).toBe(before);
  });
});

test.describe('Profile Cards', () => {
  const people = [
    { title: 'Ana Rivera', roleTag: 'Designer', content: '<p>' + 'A long biography sentence. '.repeat(30) + '</p>', quote: '', contactUrl: '', contactLabel: '' },
    { title: 'Bo Chen', roleTag: 'Engineer', content: '<p>Short bio.</p>', quote: '', contactUrl: '', contactLabel: '' }
  ];

  test('with the bio popup on, the card shows a short summary and the popup shows the whole bio', async ({ page }) => {
    await open(page, await exportedHtml(page, 'profile-cards', { profileEnableModal: true }, people));
    const cardText = page.locator('.profile-card-item').first().locator('.profile-card-bio');
    const clamped = await cardText.evaluate(el => ({ box: el.getBoundingClientRect().height, full: el.scrollHeight }));
    expect(clamped.full).toBeGreaterThan(clamped.box + 10); // the card cuts the bio short
    await expect(page.locator('.profile-view-bio-hint').first()).toHaveText('View full bio →');
    await page.locator('.profile-card-item').first().click();
    const modalBody = page.locator('.profile-modal-body');
    await expect(modalBody).toBeVisible();
    expect((await modalBody.innerText()).length).toBeGreaterThan(500); // the popup carries the entire bio
  });

  test('with the popup off and no tracking, a card is plain content: no pointer, no hover, not a tab stop', async ({ page }) => {
    await open(page, await exportedHtml(page, 'profile-cards', { profileEnableModal: false, trackCompletion: false }, people));
    const card = page.locator('.profile-card-item').first();
    expect(await card.evaluate(el => getComputedStyle(el).cursor)).not.toBe('pointer');
    expect(await card.getAttribute('tabindex')).toBeNull();
    const before = await card.evaluate(el => getComputedStyle(el).borderColor);
    await card.hover();
    expect(await card.evaluate(el => getComputedStyle(el).borderColor)).toBe(before);
  });

  test('with the popup off but completion tracking on, a card still records that it was explored', async ({ page }) => {
    await open(page, await exportedHtml(page, 'profile-cards', { profileEnableModal: false, trackCompletion: true }, people));
    const card = page.locator('.profile-card-item').first();
    expect(await card.evaluate(el => getComputedStyle(el).cursor)).toBe('pointer');
    await card.click();
    await expect(page.locator('[id$="-completion-text"]')).toHaveText('50%');
    await card.click(); // a second click must not undo it
    await expect(card).toHaveClass(/active/);
  });
});

test.describe('Hotspots drawer, landscape preview and background-image header', () => {
  const markers = [
    { title: 'Hub', content: '<p>Hub details.</p>', x: '30', y: '40', markerType: 'number', audioSourceType: 'url', audioUrl: '', audioTranscript: '' },
    { title: 'Edge', content: '<p>Edge details.</p>', x: '60', y: '60', markerType: 'number', audioSourceType: 'url', audioUrl: '', audioTranscript: '' }
  ];

  test('a closed drawer is not visible beside the block, and opens and closes properly', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 }); // wider than the block, where the closed drawer used to show
    await open(page, await exportedHtml(page, 'hotspots', { calloutMode: 'drawer' }, markers));
    const drawer = page.locator('.hotspot-drawer');
    await expect(drawer).toBeHidden();
    await page.locator('.hotspot-pin').first().click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Hub details.');
    await page.locator('.hotspot-drawer-close').click();
    await expect(drawer).toBeHidden();
  });

  test('Landscape changes the simulated device: wider and shorter, and the width label follows', async ({ page }) => {
    await page.setViewportSize({ width: 2600, height: 1200 }); // wide enough that the preview panel does not clamp the device
    await page.goto('/?catalog');
    await page.locator('.nav-item[data-category="interactive"]').click();
    await page.locator('.component-select-card').filter({ hasText: 'Hotspots' }).click();
    await expect(page.locator('#editor-state')).toBeVisible();
    await page.locator('[data-device="tablet"]').click();
    const box = async () => page.locator('#preview-viewport').boundingBox();
    const portrait = await box();
    expect(Math.round(portrait.width)).toBe(768);
    await page.locator('#btn-preview-orientation').click();
    const landscape = await box();
    expect(Math.round(landscape.width)).toBe(1024);
    expect(landscape.height).toBeLessThan(portrait.height);
    await expect(page.locator('#preview-width-label')).toHaveText('1024px');
    await page.locator('#btn-preview-orientation').click();
    expect(Math.round((await box()).width)).toBe(768);
    await expect(page.locator('#preview-width-label')).toHaveText('768px');
  });

  test('with a background image the label, headline and text sit on a solid card; without one nothing changes', async ({ page }) => {
    await open(page, await exportedHtml(page, 'accordion', { blockBackgroundImage: 'https://example.org/photo.jpg' }));
    const header = page.locator('.block-header');
    await expect(header).toHaveClass(/has-backing/);
    expect(await header.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await header.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(10);

    await open(page, await exportedHtml(page, 'accordion', {}));
    await expect(page.locator('.block-header')).not.toHaveClass(/has-backing/);
  });
});


test('the width label says so when the preview panel is narrower than the chosen device', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 }); // a laptop-sized window: the panel is narrower than a tablet
  await page.goto('/?catalog');
  await page.locator('.nav-item[data-category="interactive"]').click();
  await page.locator('.component-select-card').filter({ hasText: 'Hotspots' }).click();
  await expect(page.locator('#editor-state')).toBeVisible();
  await page.locator('[data-device="tablet"]').click();
  const label = page.locator('#preview-width-label');
  await expect(label).toHaveText(/^\d+px of 768px$/);
  await expect(label).toHaveClass(/is-clamped/);
  await expect(label).toHaveAttribute('title', /narrower than this tablet/);
  await page.locator('#btn-preview-orientation').click();
  await expect(label).toHaveText(/^\d+px of 1024px$/);
  await page.locator('[data-device="desktop"]').click();
  await expect(label).not.toHaveClass(/is-clamped/);
});
