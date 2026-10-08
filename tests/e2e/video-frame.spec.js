import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { compileExportFixture } from '../fixtures/export-fixture-definitions.mjs';

// Real timeupdate-driven chapter/transcript sync, actual play/pause/seek timing, and
// localStorage-backed resume behavior need a genuine <video> element and real playback
// timing jsdom cannot provide (docs/ARCHITECTURE.md's testing strategy) — see
// tests/unit/video-frame.test.js for the structural/generator coverage this file doesn't
// duplicate. Mirrors tests/e2e/audio-player.spec.js's own structure closely — the two
// components share the same chapters/synchronized-transcript/resume/takeaways design.
//
// The video itself is a tiny (~26KB, 30s, synthetic test pattern, no audio) file generated
// with ffmpeg (tests/fixtures/media/tiny-test-video-30s.mp4) — a longer sibling of
// interactive-video.spec.js's existing 4s tiny-test-video.mp4, needed here because the
// resume-prompt tests require a duration comfortably past both AUD_RESUME_MIN_SECONDS(10)
// and AUD_COMPLETION_TAIL_SECONDS(3) at once (see components/audio-player.spec.js's own
// identical reasoning for its 30s audio fixture).

const TEST_VIDEO_URL = 'http://127.0.0.1:4173/tests/fixtures/media/tiny-test-video-30s.mp4';

function compileVideo(overrides = {}, itemOverrides = {}, projectId) {
  return compileExportFixture('video-frame', {
    projectId,
    configOverrides: {
      trackCompletion: true,
      chapters: '0:00 | Intro | The opening section\n0:03 | Middle | Halfway through',
      transcriptSegments: '0:00 | Narrator | Welcome to the video.\n0:03 | Narrator | Now the second half.',
      progressPersistence: true,
      ...overrides,
      items: [{ title: 'Test Clip', content: TEST_VIDEO_URL, ...itemOverrides }]
    }
  });
}

async function waitForMetadata(page) {
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.readyState >= 1;
  });
}

async function seekTo(page, seconds) {
  await waitForMetadata(page);
  await page.evaluate(t => { document.querySelector('video').currentTime = t; }, seconds);
  await page.waitForTimeout(150);
}

// page.setContent() loads into a document with no real http(s) origin, where some engines
// throw a SecurityError on any window.localStorage access at all — see
// tests/e2e/audio-player.spec.js's identical helper/comment for the full reasoning. Only
// the resume/progress tests below need real localStorage access.
let fixtureCounter = 0;
async function gotoCompiled(page, html) {
  const url = `http://127.0.0.1:4173/__video-fixture-${fixtureCounter++}__`;
  await page.route(url, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
}

// The Playwright-bundled WebKit engine's own native <video controls> shadow-DOM internals
// intermittently throw this during rapid programmatic play/pause/seek, reproduced even with
// a bare <video controls> element and zero component code involved — see
// tests/e2e/interactive-video.spec.js's identical filter/comment for the full reasoning.
const KNOWN_BENIGN_WEBKIT_ERRORS = ['Temporal.Duration properties must be finite and of consistent sign'];

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => {
    if (KNOWN_BENIGN_WEBKIT_ERRORS.includes(error.message)) return;
    errors.push(error.message);
  });
  return errors;
}

test.describe('Video Embed: core playback controls', () => {
  test('Replay/Forward 10s start disabled in the static markup, then move currentTime by exactly 10s once enabled, clamped to [0, duration]', async ({ page }) => {
    const errors = collectErrors(page);
    const html = compileVideo();
    expect(html).toMatch(/class="video-skip-btn video-skip-back-btn"[^>]*disabled/);
    expect(html).toMatch(/class="video-skip-btn video-skip-forward-btn"[^>]*disabled/);

    await page.setContent(html);
    const skipBack = page.locator('.video-skip-back-btn');
    const skipForward = page.locator('.video-skip-forward-btn');
    await waitForMetadata(page);
    await expect(skipBack).toBeEnabled();
    await expect(skipForward).toBeEnabled();

    await seekTo(page, 2);
    await skipForward.click();
    await page.waitForTimeout(150);
    const { time, duration } = await page.evaluate(() => {
      const video = document.querySelector('video');
      return { time: video.currentTime, duration: video.duration };
    });
    expect(time).toBeCloseTo(Math.min(12, duration), 0);

    await seekTo(page, 2);
    await skipBack.click();
    await page.waitForTimeout(150);
    const timeAfterBack = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(timeAfterBack).toBeCloseTo(0, 0);

    expect(errors).toEqual([]);
  });

  test('the overlay play button and the control-strip mini play button stay in sync (both toggle the same underlying video)', async ({ page }) => {
    await page.setContent(compileVideo());
    const overlay = page.locator('.video-overlay-play');
    const miniPlay = page.locator('.video-mini-play');
    await expect(overlay).toBeVisible();
    await miniPlay.click();
    await expect(overlay).toBeHidden();
    await expect(miniPlay).toHaveAttribute('aria-pressed', 'true');
    await miniPlay.click();
    await expect(overlay).toBeVisible();
    await expect(miniPlay).toHaveAttribute('aria-pressed', 'false');
  });

  test('speed cycles through 1x -> 1.25x -> 1.5x -> 2x -> 1x, and mute toggles aria-pressed/label', async ({ page }) => {
    await page.setContent(compileVideo());
    const speedBtn = page.locator('.video-speed-btn');
    await expect(speedBtn).toHaveText('1x');
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1.25x');
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1.5x');
    await speedBtn.click();
    await expect(speedBtn).toHaveText('2x');
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1x');

    const muteBtn = page.locator('.video-mute-btn');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveAttribute('aria-label', 'Unmute video');
  });
});

test.describe('Video Embed: chapters', () => {
  test('chapter markers render on the scrub bar once duration is known, and clicking the nav list seeks and marks the active chapter (aria-current, not color alone)', async ({ page }) => {
    await page.setContent(compileVideo());
    await waitForMetadata(page);
    await expect(page.locator('.video-chapter-marker')).toHaveCount(2);

    const secondChapter = page.locator('.video-chapter-item').nth(1);
    await secondChapter.click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(time).toBeCloseTo(3, 0);
    await expect(secondChapter).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.video-chapter-item').nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.video-current-chapter')).toHaveText('Middle');
  });

  test('the Chapters panel is collapsible: starts expanded, and the toggle hides/shows the list and updates aria-expanded', async ({ page }) => {
    await page.setContent(compileVideo());
    const toggle = page.locator('.video-chapter-toggle');
    const list = page.locator('.video-chapter-list');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
  });

  test('a chapter marker has an accessible "Jump to chapter" label and is keyboard-focusable', async ({ page }) => {
    await page.setContent(compileVideo());
    await waitForMetadata(page);
    const marker = page.locator('.video-chapter-marker').first();
    await expect(marker).toHaveAttribute('aria-label', /Jump to chapter: Intro, 0:00/);
    await marker.focus();
    await expect(marker).toBeFocused();
  });
});

test.describe('Video Embed: synchronized transcript', () => {
  test('Show/Hide Transcript toggles aria-expanded and panel visibility', async ({ page }) => {
    await page.setContent(compileVideo());
    const toggle = page.locator('.video-transcript-toggle');
    const panel = page.locator('.video-transcript-panel');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveText('Hide transcript');
  });

  test('clicking a transcript segment seeks the video to its start time', async ({ page }) => {
    await page.setContent(compileVideo());
    await page.locator('.video-transcript-toggle').click();
    await waitForMetadata(page);
    await page.locator('.video-transcript-segment').nth(1).click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(time).toBeCloseTo(3, 0);
  });

  test('search filters segments, highlights matches, and shows a no-results state', async ({ page }) => {
    await page.setContent(compileVideo());
    await page.locator('.video-transcript-toggle').click();
    const search = page.locator('.video-transcript-search');
    await search.fill('second half');
    await expect(page.locator('.video-transcript-segment:visible')).toHaveCount(1);
    await expect(page.locator('.video-search-highlight')).toHaveText('second half');

    await search.fill('nothing matches this');
    await expect(page.locator('.video-transcript-segment:visible')).toHaveCount(0);
    await expect(page.locator('.video-transcript-no-results')).toBeVisible();
  });

  test('the audio description disclosure is unaffected by the transcript system — both can be present independently', async ({ page }) => {
    const html = compileExportFixture('video-frame', {
      configOverrides: {
        chapters: '', transcriptSegments: '',
        items: [{ title: 'Clip', content: TEST_VIDEO_URL, transcript: '<p>Dialogue transcript.</p>', audioDescription: '<p>Visual description of the scene.</p>' }]
      }
    });
    await page.setContent(html);
    await expect(page.locator('summary')).toHaveText('Visual description');
    await page.locator('.video-transcript-toggle').click();
    await expect(page.locator('.video-transcript-plain')).toContainText('Dialogue transcript.');
  });

  test('a visually-empty transcript (no text typed, just empty richtext markup) shows no "Show Transcript" toggle at all', async ({ page }) => {
    const html = compileExportFixture('video-frame', {
      configOverrides: {
        chapters: '', transcriptSegments: '',
        items: [{ title: 'Clip', content: TEST_VIDEO_URL, transcript: '<p></p>' }]
      }
    });
    await page.setContent(html);
    await expect(page.locator('.video-transcript-toggle')).toHaveCount(0);
    await expect(page.locator('.video-transcript-section')).toHaveCount(0);
  });
});

test.describe('Video Embed: resume, progress, and takeaways', () => {
  test('reaching the end marks the component Completed and reveals takeaways set to reveal-after-completion', async ({ page }) => {
    const html = compileVideo({ takeaways: 'First key point\nSecond key point', takeawaysVisibility: 'afterCompletion' });
    await page.setContent(html);
    await expect(page.locator('.video-takeaways-list')).toBeHidden();
    await expect(page.locator('.video-takeaways-locked-msg')).toBeVisible();

    await waitForMetadata(page);
    await page.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')));
    await expect(page.locator('.video-progress-text')).toHaveText('Completed');
    await expect(page.locator('.video-takeaways-list')).toBeVisible();
    await expect(page.locator('.video-takeaways-locked-msg')).toBeHidden();
    await expect(page.locator('.video-takeaways-list li')).toHaveCount(2);
  });

  // Reproduces components/video-frame.js#generateJS's vidHash()/progressKey scheme —
  // duplicated here rather than imported since it only exists inside a generated-JS
  // template string. instanceId is computed from a known projectId (js/preview.js's own
  // `rcb-${projectId}` formula). Seeding happens via page.addInitScript(), before the
  // page's own script ever runs its first hydration — seeding after an initial load then
  // reloading lets that first load's own beforeunload handler race the seed and
  // immediately overwrite it — see tests/e2e/audio-player.spec.js's identical comment.
  async function seedProgressBeforeLoad(page, projectId, data) {
    const instanceId = `rcb-${projectId}`;
    await page.addInitScript(({ instanceId, src, data }) => {
      function vidHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash = hash & hash; }
        return (hash >>> 0).toString(36);
      }
      const key = 'rcb-video-progress-' + vidHash(instanceId + '|' + src);
      window.localStorage.setItem(key, JSON.stringify(data));
    }, { instanceId, src: TEST_VIDEO_URL, data });
  }

  test('a stored position past 10s (and not near the end) offers Resume/Start Over on load; Resume seeks to it, Start Over resets to 0', async ({ page }) => {
    const projectId = 'fixture-video-frame-resume-past';
    await seedProgressBeforeLoad(page, projectId, { position: 15, furthest: 15, completed: false, updatedAt: Date.now() });
    await gotoCompiled(page, compileVideo({}, {}, projectId));
    await waitForMetadata(page);
    await expect(page.locator('.video-resume-prompt')).toBeVisible();
    await expect(page.locator('.video-resume-text')).toHaveText(/Resume from 0:15/);

    await page.locator('.video-restart-choice-btn').click();
    await expect(page.locator('.video-resume-prompt')).toBeHidden();
    const timeAfterRestart = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(timeAfterRestart).toBeCloseTo(0, 0);
  });

  test('regression: a visibilitychange-hidden firing while the resume prompt is showing (before it\'s acted on) must not clobber the stored position back to 0', async ({ page }) => {
    const projectId = 'fixture-video-frame-resume-visibility-race';
    await seedProgressBeforeLoad(page, projectId, { position: 20, furthest: 20, completed: false, updatedAt: Date.now() });
    await gotoCompiled(page, compileVideo({}, {}, projectId));
    await waitForMetadata(page);
    await expect(page.locator('.video-resume-prompt')).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.locator('.video-resume-btn').click();
    await page.waitForTimeout(150);
    const time = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(time).toBeGreaterThan(15);
  });

  test('a stored position under 10s does not trigger a resume prompt', async ({ page }) => {
    const projectId = 'fixture-video-frame-resume-early';
    await seedProgressBeforeLoad(page, projectId, { position: 3, furthest: 3, completed: false, updatedAt: Date.now() });
    await gotoCompiled(page, compileVideo({}, {}, projectId));
    await waitForMetadata(page);
    await page.waitForTimeout(200);
    await expect(page.locator('.video-resume-prompt')).toBeHidden();
  });

  test('storage disabled (progressPersistence off) still plays and completes normally, with no resume prompt', async ({ page }) => {
    const errors = collectErrors(page);
    const html = compileVideo({ progressPersistence: false });
    await page.setContent(html);
    await expect(page.locator('.video-resume-prompt')).toHaveCount(0);
    await waitForMetadata(page);
    await page.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')));
    await expect(page.locator('.video-progress-text')).toHaveText('Completed');
    expect(errors).toEqual([]);
  });
});

test.describe('Video Embed: multiple instances on one page', () => {
  test('two independent players use unique ids, and starting one pauses the other', async ({ page }) => {
    const first = compileVideo({}, {}, 'fixture-video-frame-first');
    const second = compileVideo({}, {}, 'fixture-video-frame-second');
    const extractBody = html => /<body>([\s\S]*)<\/body>/.exec(html)[1];
    await page.setContent(`<!doctype html><html><head></head><body>${extractBody(first)}${extractBody(second)}</body></html>`);
    const videos = page.locator('video');
    await expect(videos).toHaveCount(2);
    const ids = await videos.evaluateAll(elements => elements.map(el => el.id));
    expect(new Set(ids).size).toBe(2);

    await page.waitForFunction(() => Array.from(document.querySelectorAll('video')).every(v => v.readyState >= 1));
    const playButtons = page.locator('.video-mini-play');
    await playButtons.nth(0).click();
    await expect.poll(() => page.evaluate(() => !document.querySelectorAll('video')[0].paused)).toBe(true);
    await playButtons.nth(1).click();
    await expect.poll(() => page.evaluate(() => !document.querySelectorAll('video')[1].paused)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('video')[0].paused)).toBe(true);
  });
});

test.describe('Video Embed: accessibility', () => {
  // Scoped to this component's own controls, matching audio-player.spec.js's own
  // established pattern — target-size is excluded for the same considered, documented
  // trade-off as the chapter markers there (docs/AUDIO-PLAYER.md "Accessibility").
  const A11Y_RULES = [
    'button-name', 'label', 'aria-valid-attr', 'aria-valid-attr-value',
    'color-contrast', 'heading-order', 'nested-interactive'
  ];
  function scan(page) {
    return new AxeBuilder({ page }).withRules(A11Y_RULES).analyze();
  }

  test('no automatic axe violations on the default render', async ({ page }) => {
    await page.setContent(compileVideo());
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('no automatic axe violations with the transcript panel expanded', async ({ page }) => {
    await page.setContent(compileVideo());
    await page.locator('.video-transcript-toggle').click();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});
