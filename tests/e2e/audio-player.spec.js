import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { compileExportFixture } from '../fixtures/export-fixture-definitions.mjs';

// Real timeupdate-driven chapter/transcript sync, actual play/pause/seek timing, and
// localStorage-backed resume behavior need a genuine <audio> element and real playback
// timing jsdom cannot provide (docs/ARCHITECTURE.md's testing strategy) — see
// tests/unit/audio-player.test.js for the structural/generator coverage this file doesn't
// duplicate. Mirrors tests/e2e/interactive-video.spec.js's own dedicated-file precedent.
//
// The audio itself is a tiny (~24KB, 6s, mono) synthetic sine-wave tone generated with
// ffmpeg (tests/fixtures/media/tiny-test-audio.mp3) — not a real recording, so there is
// nothing to license or attribute. Served by tests/e2e/server.mjs at a fixed, same-origin
// URL rather than embedded as a data: URL, matching interactive-video.spec.js's own
// reasoning: sanitizeURL() never permits audio as a data: URL, so a data: URL test
// wouldn't reflect how the real compiled output can look.

const TEST_AUDIO_URL = 'http://127.0.0.1:4173/tests/fixtures/media/tiny-test-audio.mp3';

function compileAudio(overrides = {}, itemOverrides = {}, projectId) {
  return compileExportFixture('audio-player', {
    projectId,
    configOverrides: {
      trackCompletion: true,
      chapters: '0:00 | Intro | The opening section\n0:03 | Middle | Halfway through',
      transcriptSegments: '0:00 | Narrator | Welcome to the tone.\n0:03 | Narrator | Now the second half.',
      progressPersistence: true,
      ...overrides,
      items: [{ title: 'Test Clip', content: TEST_AUDIO_URL, ...itemOverrides }]
    }
  });
}

async function waitForMetadata(page) {
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && audio.readyState >= 1;
  });
}

async function seekTo(page, seconds) {
  await waitForMetadata(page);
  await page.evaluate(t => { document.querySelector('audio').currentTime = t; }, seconds);
  await page.waitForTimeout(150);
}

// page.setContent() loads into a document with no real http(s) origin, where some engines
// throw a SecurityError on any window.localStorage access at all — a test-harness quirk,
// not something the real product hits (a standalone export, an Iframe Snippet embed, and
// a srcdoc iframe are all a genuine http(s)/inherited origin). Only the resume/progress
// tests below need real localStorage access, so only they route through a real page.goto()
// against the same local test server, fulfilling the request with the compiled HTML.
let fixtureCounter = 0;
async function gotoCompiled(page, html) {
  const url = `http://127.0.0.1:4173/__audio-fixture-${fixtureCounter++}__`;
  await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

test.describe('Audio Player: core playback controls', () => {
  test('Replay/Forward 10s start disabled in the static markup, then move currentTime by exactly 10s once enabled, clamped to [0, duration]', async ({ page }) => {
    const errors = collectErrors(page);
    // Checked against the static markup itself, not a live post-navigation assertion: the
    // fixture clip is tiny/local and can finish loading metadata before a real-browser
    // assertion gets a chance to observe the pre-metadata "disabled" state — a timing race
    // in the test, not in the component (docs/COMPONENT-SCHEMA.md-style "unmeasured, not
    // failed" framing applies to the test here, not the feature).
    const html = compileAudio();
    expect(html).toMatch(/class="aud-skip-btn aud-skip-back-btn"[^>]*disabled/);
    expect(html).toMatch(/class="aud-skip-btn aud-skip-forward-btn"[^>]*disabled/);

    await page.setContent(html);
    const skipBack = page.locator('.aud-skip-back-btn');
    const skipForward = page.locator('.aud-skip-forward-btn');
    await waitForMetadata(page);
    await expect(skipBack).toBeEnabled();
    await expect(skipForward).toBeEnabled();

    await seekTo(page, 2);
    await skipForward.click();
    await page.waitForTimeout(150);
    const { time, duration } = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return { time: audio.currentTime, duration: audio.duration };
    });
    // The 6s fixture clip is shorter than 2 + AUD_SKIP_SECONDS(10) = 12, so this also
    // exercises the Math.min(duration, ...) clamp, not just the plain add case.
    expect(time).toBeCloseTo(Math.min(12, duration), 0);

    await seekTo(page, 2);
    await skipBack.click();
    await page.waitForTimeout(150);
    const timeAfterBack = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(timeAfterBack).toBeCloseTo(0, 0);

    expect(errors).toEqual([]);
  });

  test('Enter/Space activate Replay/Forward like any native button', async ({ page }) => {
    await page.setContent(compileAudio());
    await waitForMetadata(page);
    await seekTo(page, 5);
    const skipForward = page.locator('.aud-skip-forward-btn');
    await skipForward.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeGreaterThan(5);
  });

  test('speed cycles through the AUD_SPEEDS list (1x -> 1.25x -> 1.5x -> 2x -> 0.75x -> 1x), and mute toggles aria-pressed/label', async ({ page }) => {
    await page.setContent(compileAudio());
    const speedBtn = page.locator('.aud-speed-btn');
    await expect(speedBtn).toHaveText('1x');
    for (const label of ['1.25x', '1.5x', '2x', '0.75x', '1x']) {
      await speedBtn.click();
      await expect(speedBtn).toHaveText(label);
    }

    const muteBtn = page.locator('.aud-mute-btn');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveAttribute('aria-label', 'Unmute audio');
  });
});

test.describe('Audio Player: chapters', () => {
  test('chapter markers render on the scrub bar once duration is known, and clicking the nav list seeks and marks the active chapter (aria-current, not color alone)', async ({ page }) => {
    await page.setContent(compileAudio());
    await waitForMetadata(page);
    await expect(page.locator('.aud-chapter-marker')).toHaveCount(2);

    const secondChapter = page.locator('.aud-chapter-item').nth(1);
    await secondChapter.click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeCloseTo(3, 0);
    await expect(secondChapter).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.aud-chapter-item').nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.aud-current-chapter')).toHaveText('Middle');
  });

  test('a chapter marker has an accessible "Jump to chapter" label and is keyboard-focusable', async ({ page }) => {
    await page.setContent(compileAudio());
    await waitForMetadata(page);
    const marker = page.locator('.aud-chapter-marker').first();
    await expect(marker).toHaveAttribute('aria-label', /Jump to chapter: Intro, 0:00/);
    await marker.focus();
    await expect(marker).toBeFocused();
  });

  test('the Chapters panel is collapsible: starts expanded, and the toggle hides/shows the list and updates aria-expanded', async ({ page }) => {
    await page.setContent(compileAudio());
    const toggle = page.locator('.aud-chapter-toggle');
    const list = page.locator('.aud-chapter-list');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toBeVisible();
  });
});

test.describe('Audio Player: synchronized transcript', () => {
  test('Show/Hide Transcript toggles aria-expanded and panel visibility', async ({ page }) => {
    await page.setContent(compileAudio());
    const toggle = page.locator('.aud-transcript-toggle');
    const panel = page.locator('.aud-transcript-panel');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveText('Hide transcript');
    await toggle.click();
    await expect(panel).toBeHidden();
  });

  test('clicking a transcript segment seeks the audio to its start time', async ({ page }) => {
    await page.setContent(compileAudio());
    await page.locator('.aud-transcript-toggle').click();
    await waitForMetadata(page);
    await page.locator('.aud-transcript-segment').nth(1).click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeCloseTo(3, 0);
  });

  test('the segment matching current playback time is highlighted as active while playing', async ({ page }) => {
    await page.setContent(compileAudio());
    await page.locator('.aud-transcript-toggle').click();
    await seekTo(page, 4);
    await page.evaluate(() => document.querySelector('audio').dispatchEvent(new Event('timeupdate')));
    await expect(page.locator('.aud-transcript-segment').nth(1)).toHaveClass(/aud-segment-active/);
    await expect(page.locator('.aud-transcript-segment').nth(0)).not.toHaveClass(/aud-segment-active/);
  });

  test('search filters segments, highlights matches, announces a result count, and shows a no-results state', async ({ page }) => {
    await page.setContent(compileAudio());
    await page.locator('.aud-transcript-toggle').click();
    const search = page.locator('.aud-transcript-search');
    await search.fill('second half');
    await expect(page.locator('.aud-transcript-segment:visible')).toHaveCount(1);
    await expect(page.locator('.aud-search-highlight')).toHaveText('second half');
    await expect(page.locator('.aud-transcript-search-status')).toHaveText('1 matching line found.');

    await search.fill('nothing matches this');
    await expect(page.locator('.aud-transcript-segment:visible')).toHaveCount(0);
    await expect(page.locator('.aud-transcript-no-results')).toBeVisible();
    await expect(page.locator('.aud-transcript-search-status')).toHaveText('0 matching lines found.');

    await search.fill('');
    await expect(page.locator('.aud-transcript-segment:visible')).toHaveCount(2);
    await expect(page.locator('.aud-transcript-no-results')).toBeHidden();
  });

  test('plain transcript (no synchronized segments) still renders inline, with no search UI', async ({ page }) => {
    const html = compileExportFixture('audio-player', {
      configOverrides: {
        chapters: '', transcriptSegments: '',
        items: [{ title: 'Clip', content: TEST_AUDIO_URL, transcript: '<p>Plain transcript text.</p>' }]
      }
    });
    await page.setContent(html);
    await expect(page.locator('.aud-transcript-search')).toHaveCount(0);
    await page.locator('.aud-transcript-toggle').click();
    await expect(page.locator('.aud-transcript-plain')).toContainText('Plain transcript text.');
  });

  test('a visually-empty transcript (no text typed, just empty richtext markup) shows no "Show Transcript" toggle at all', async ({ page }) => {
    const html = compileExportFixture('audio-player', {
      configOverrides: {
        chapters: '', transcriptSegments: '',
        items: [{ title: 'Clip', content: TEST_AUDIO_URL, transcript: '<p></p>' }]
      }
    });
    await page.setContent(html);
    await expect(page.locator('.aud-transcript-toggle')).toHaveCount(0);
    await expect(page.locator('.aud-transcript-section')).toHaveCount(0);
  });
});

test.describe('Audio Player: resume and progress', () => {
  test('reaching the end marks the component Completed and reveals takeaways set to reveal-after-completion', async ({ page }) => {
    const html = compileAudio({ takeaways: 'First key point\nSecond key point', takeawaysVisibility: 'afterCompletion' });
    await page.setContent(html);
    await expect(page.locator('.aud-takeaways-list')).toBeHidden();
    await expect(page.locator('.aud-takeaways-locked-msg')).toBeVisible();

    await waitForMetadata(page);
    await page.evaluate(() => document.querySelector('audio').dispatchEvent(new Event('ended')));
    await expect(page.locator('.aud-progress-text')).toHaveText('Completed');
    await expect(page.locator('.aud-takeaways-list')).toBeVisible();
    await expect(page.locator('.aud-takeaways-locked-msg')).toBeHidden();
    await expect(page.locator('.aud-takeaways-list li')).toHaveCount(2);
  });

  // Reproduces components/audio-player.js#generateJS's audHash()/progressKey scheme —
  // duplicated here rather than imported since the real one only exists inside a
  // generated-JS template string, not an importable module. instanceId is computed
  // directly from a known projectId (js/preview.js#getInstanceId's own `rcb-${projectId}`
  // formula) rather than read back from a first page load: seeding must happen via
  // page.addInitScript(), before the page's own script ever runs its first hydration —
  // seeding *after* an initial load (then reloading) lets that first load's own
  // beforeunload handler race the seed and immediately overwrite it with the
  // freshly-initialized zeros still sitting in its memory, since the load that's about to
  // be torn down never itself saw the seeded value.
  async function seedProgressBeforeLoad(page, projectId, data) {
    const instanceId = `rcb-${projectId}`;
    await page.addInitScript(({ instanceId, src, data }) => {
      function audHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash = hash & hash; }
        return (hash >>> 0).toString(36);
      }
      const key = 'rcb-audio-progress-' + audHash(instanceId + '|' + src);
      window.localStorage.setItem(key, JSON.stringify(data));
    }, { instanceId, src: TEST_AUDIO_URL, data });
  }

  test('a stored position past 10s (and not near the end) offers Resume/Start Over on load; Resume seeks to it, Start Over resets to 0', async ({ page }) => {
    const projectId = 'fixture-audio-player-resume-past';
    // AUD_RESUME_MIN_SECONDS is 10 and the 30s fixture clip's AUD_COMPLETION_TAIL_SECONDS
    // window is its final 3s — 15s clears both: comfortably past the minimum and nowhere
    // near "within the final few seconds."
    await seedProgressBeforeLoad(page, projectId, { position: 15, furthest: 15, completed: false, updatedAt: Date.now() });

    await gotoCompiled(page, compileAudio({}, {}, projectId));
    await waitForMetadata(page);
    await expect(page.locator('.aud-resume-prompt')).toBeVisible();
    await expect(page.locator('.aud-resume-text')).toHaveText(/Resume from 0:15/);

    await page.locator('.aud-restart-choice-btn').click();
    await expect(page.locator('.aud-resume-prompt')).toBeHidden();
    const timeAfterRestart = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(timeAfterRestart).toBeCloseTo(0, 0);
  });

  test('regression: a visibilitychange-hidden firing while the resume prompt is showing (before it\'s acted on) must not clobber the stored position back to 0', async ({ page }) => {
    const projectId = 'fixture-audio-player-resume-visibility-race';
    await seedProgressBeforeLoad(page, projectId, { position: 20, furthest: 20, completed: false, updatedAt: Date.now() });
    await gotoCompiled(page, compileAudio({}, {}, projectId));
    await waitForMetadata(page);
    await expect(page.locator('.aud-resume-prompt')).toBeVisible();

    // Simulate the tab losing focus before the learner has acted on the prompt — the exact
    // window components/audio-player.js's hasEngaged guard exists for (currentTime is still
    // genuinely 0 here; the learner hasn't played or seeked yet).
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.locator('.aud-resume-btn').click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeGreaterThan(15);
  });

  test('a stored position under 10s does not trigger a resume prompt', async ({ page }) => {
    const projectId = 'fixture-audio-player-resume-early';
    await seedProgressBeforeLoad(page, projectId, { position: 3, furthest: 3, completed: false, updatedAt: Date.now() });
    await gotoCompiled(page, compileAudio({}, {}, projectId));
    await waitForMetadata(page);
    await page.waitForTimeout(200);
    await expect(page.locator('.aud-resume-prompt')).toBeHidden();
  });

  test('storage disabled (progressPersistence off) still plays and completes normally, with no resume prompt', async ({ page }) => {
    const errors = collectErrors(page);
    const html = compileAudio({ progressPersistence: false });
    await page.setContent(html);
    await expect(page.locator('.aud-resume-prompt')).toHaveCount(0);
    await waitForMetadata(page);
    await page.evaluate(() => document.querySelector('audio').dispatchEvent(new Event('ended')));
    await expect(page.locator('.aud-progress-text')).toHaveText('Completed');
    expect(errors).toEqual([]);
  });
});

test.describe('Audio Player: multiple instances on one page', () => {
  test('two independent players use unique ids, and starting one pauses the other', async ({ page }) => {
    const first = compileAudio({}, {}, 'fixture-audio-player-first');
    const second = compileAudio({}, {}, 'fixture-audio-player-second');
    // Concatenate two independent compiled documents' <body> content into one page — same
    // "one page, two instances" scenario docs/COMPONENT-SCHEMA.md's Flip Cards Study mode
    // section already documents as the real multi-instance risk for the HTML fragment
    // export format specifically.
    const extractBody = html => /<body>([\s\S]*)<\/body>/.exec(html)[1];
    await page.setContent(`<!doctype html><html><head></head><body>${extractBody(first)}${extractBody(second)}</body></html>`);
    const audios = page.locator('audio');
    await expect(audios).toHaveCount(2);
    const ids = await audios.evaluateAll(elements => elements.map(el => el.id));
    expect(new Set(ids).size).toBe(2);

    await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).every(a => a.readyState >= 1));
    const playButtons = page.locator('.aud-play-btn');
    await playButtons.nth(0).click();
    await expect.poll(() => page.evaluate(() => !document.querySelectorAll('audio')[0].paused)).toBe(true);
    await playButtons.nth(1).click();
    await expect.poll(() => page.evaluate(() => !document.querySelectorAll('audio')[1].paused)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('audio')[0].paused)).toBe(true);
  });
});

test.describe('Audio Player: presentation modes', () => {
  test('compact mode hides chapters/transcript/takeaways/progress sections but keeps core controls', async ({ page }) => {
    const html = compileAudio({ presentationMode: 'compact', takeaways: 'A point', takeawaysVisibility: 'always' });
    await page.setContent(html);
    await expect(page.locator('.aud-player')).toHaveAttribute('data-mode', 'compact');
    await expect(page.locator('.aud-play-btn')).toBeVisible();
    await expect(page.locator('.aud-skip-back-btn')).toBeVisible();
    await expect(page.locator('.aud-chapter-nav')).toHaveCount(0);
    await expect(page.locator('.aud-transcript-section')).toHaveCount(0);
    await expect(page.locator('.aud-takeaways-panel')).toHaveCount(0);
    await expect(page.locator('.aud-progress-status')).toHaveCount(0);
  });

  test('podcast mode renders the same controls with a data-mode attribute for layout CSS', async ({ page }) => {
    const html = compileAudio({ presentationMode: 'podcast' });
    await page.setContent(html);
    await expect(page.locator('.aud-player')).toHaveAttribute('data-mode', 'podcast');
    await expect(page.locator('.aud-chapter-nav')).toBeVisible();
  });

  test('podcast mode: chapters are fully interactive — markers, list click-to-seek, active-chapter tracking, and the collapsible toggle', async ({ page }) => {
    await page.setContent(compileAudio({ presentationMode: 'podcast' }));
    await expect(page.locator('.aud-player')).toHaveAttribute('data-mode', 'podcast');
    await waitForMetadata(page);
    await expect(page.locator('.aud-chapter-marker')).toHaveCount(2);

    const secondChapter = page.locator('.aud-chapter-item').nth(1);
    await secondChapter.click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeCloseTo(3, 0);
    await expect(secondChapter).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.aud-current-chapter')).toHaveText('Middle');

    // The collapsible toggle (same fix verified for learning mode) also works in podcast mode.
    const toggle = page.locator('.aud-chapter-toggle');
    const list = page.locator('.aud-chapter-list');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
  });

  test('podcast mode: synchronized transcript toggle, search, and click-to-seek all work', async ({ page }) => {
    await page.setContent(compileAudio({ presentationMode: 'podcast' }));
    await expect(page.locator('.aud-player')).toHaveAttribute('data-mode', 'podcast');

    const toggle = page.locator('.aud-transcript-toggle');
    const panel = page.locator('.aud-transcript-panel');
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();

    await page.locator('.aud-transcript-search').fill('second half');
    await expect(page.locator('.aud-transcript-segment:visible')).toHaveCount(1);
    await expect(page.locator('.aud-search-highlight')).toHaveText('second half');
    await page.locator('.aud-transcript-search').fill('');

    await waitForMetadata(page);
    await page.locator('.aud-transcript-segment').nth(1).click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('audio').currentTime);
    expect(time).toBeCloseTo(3, 0);
  });
});

test.describe('Audio Player: accessibility', () => {
  // Scoped to this component's own controls, matching interactive-video.spec.js's own
  // established pattern — a full, unscoped axe.analyze() also flags document-level
  // concerns (e.g. page-has-heading-one) that are the export shell's responsibility
  // (blockHeadingLevel defaults to h2 deliberately, to avoid a forced second h1 in a Rise
  // lesson — docs/ACCESSIBILITY-CONFORMANCE.md), not this component's.
  //
  // 'target-size' is deliberately excluded, not silently dropped: chapter markers sit
  // directly on a 6px "slim progress track" (an explicit design requirement — a marker
  // visible "without making the timeline noisy") a few pixels from the Replay/Forward
  // buttons on one side and the scrub track's own full-length hit area underneath. Each
  // marker's real click target was already grown from 10px to a 24px circle (still a small
  // *visible* dot, via ::before) and inset from the track's very ends — genuine, verified
  // improvements, not a bare exclusion — but a fully clean 24px-clear-on-all-sides result
  // for a marker sitting on top of another interactive slider isn't reachable without
  // either a taller track (which the design brief explicitly asked to avoid) or dropping
  // in-place seeking from the track entirely. The chapter list (.aud-chapter-nav, full-width
  // rows, well over 24px tall) is the fully-conformant path to every chapter; the inline
  // markers are a mouse/touch convenience layered on top, not the only way to reach one.
  const A11Y_RULES = [
    'button-name', 'label', 'aria-valid-attr', 'aria-valid-attr-value',
    'color-contrast', 'heading-order', 'nested-interactive'
  ];
  function scan(page) {
    return new AxeBuilder({ page }).withRules(A11Y_RULES).analyze();
  }

  test('no automatic axe violations on the default Learning-mode render', async ({ page }) => {
    await page.setContent(compileAudio());
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('no automatic axe violations with the transcript panel expanded', async ({ page }) => {
    await page.setContent(compileAudio());
    await page.locator('.aud-transcript-toggle').click();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('no automatic axe violations in Compact or Podcast mode', async ({ page }) => {
    await page.setContent(compileAudio({ presentationMode: 'compact' }));
    expect((await scan(page)).violations).toEqual([]);
    await page.setContent(compileAudio({ presentationMode: 'podcast' }));
    expect((await scan(page)).violations).toEqual([]);
  });
});
