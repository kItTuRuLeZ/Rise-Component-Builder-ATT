# Custom Video Embed — chapters, transcript, resume & takeaways

**Status: feature-complete against a scoped subset of a larger proposal, single-session build.** Not phased like `docs/INTERACTIVE-VIDEO.md` — everything below shipped and was tested together. The catalog display name is unchanged ("Custom Video Embed" — unlike `audio-player`'s rename to "Interactive Learning Audio," this component was not renamed). Only claim what has actually shipped and been verified, per this project's own documentation conventions (`docs/KNOWN-ISSUES.md`, `docs/COMPLETION-INTEGRATION.md`).

## Scope note

A 12-item enhancement list was proposed for this component; **items 1–7 were approved**: elapsed/total timer, Replay/Forward 10s, playback speed, resume/local progress, timestamped chapters (navigation-only), inline synchronized transcript, and key takeaways. Items 9–12 (a captions-on/off UI toggle, a load-error state, poster object-fit control, and multiple presentation modes) were not part of that approval and were not built. **Item 8, a dedicated volume/mute button (`.video-mute-btn`), was implemented ahead of approval** — added alongside the skip/speed controls for UI consistency without being separately requested at the time — **and was retroactively approved** ("Keep it") once flagged. It ships as a confirmed, intentional part of this feature, not an unresolved loose end.

## What this differs from Interactive Video

`interactive-video` already owns branching, quiz-gated markers, and required-checkpoint pauses (`docs/INTERACTIVE-VIDEO.md`) — a *required-interaction* model. `video-frame`'s chapters/transcript here are strictly *navigation-only*: click-to-seek, never a pause-and-answer gate. The two components are not competing implementations of the same feature; they serve different instructional needs, exactly as `docs/AUDIO-PLAYER.md` draws the same line against Interactive Video for audio.

## What shipped

A single video item (`components/video-frame.js`, `id: 'video-frame'`, `maxItems: 1`, unchanged) with:

- **Replay/Forward 10 seconds** — `VID_SKIP_SECONDS` (10), clamped to `[0, duration]`, disabled until metadata loads.
- **Elapsed/total timer** — `M:SS / M:SS`, updated on every `timeupdate`.
- **Playback speed** — 1x/1.25x/1.5x/2x, cycled by one button.
- **Timestamped chapters** — an optional delimited-text field (`config.chapters`), rendered as small clickable markers on the scrub bar and a collapsible chapter list below it; the current chapter's title is shown near the timeline.
- **Synchronized transcript** — an inline, expandable panel (never a viewport-level modal — the component may run inside a constrained Rise iframe) with search, click-to-seek, and active-segment highlighting; falls back to the existing plain `transcript` (richtext) field when no synchronized segments are authored. This is a separate system from — and fully independent of — the pre-existing `audioDescription` `<details>` disclosure, which is unchanged.
- **Resume and local progress** — `localStorage`-backed position/furthest-position/completion tracking, offering "Resume from M:SS" / "Start Over" when there's meaningful prior progress; entirely optional (`progressPersistence`) and never a substitute for or claim about Rise/LMS/SCORM completion.
- **Key takeaways** — an optional list, either always visible or revealed only once the component's own internal completion state is reached.
- Everything the component already had: title, uploaded/external video, poster image (with `posterAltText`/`posterDecorative`/`aria-describedby`, since `<video poster>` has no native alt-text mechanism), captions track (`captionsUrl`), the visual-description disclosure, play/pause, seek, AT&T theme tokens, responsive layout, keyboard accessibility, and the same export pipeline every component already goes through (`docs/EXPORT-CONTRACT.md`) — none of it removed or behaviorally changed.

## Data model

New fields are all additive/optional with schema `default` values (`js/editor-schemas.js`'s `video-frame` entry) — an old saved project loads exactly as before via the existing `applyMissingSchemaDefaults()`/`syncEditorControls()` undefined-safe fallback (`docs/ARCHITECTURE.md` "Component discovery," §2). No project-level or component-level schema migration was needed.

Component-level fields (`componentFields`, shown once per instance):

| Field | Type | Default | Purpose |
| --- | --- | --: | --- |
| `chapters` | delimited text | `''` | One per line: `timestamp \| Title \| Description (optional)` |
| `transcriptSegments` | delimited text | `''` | One per line: `timestamp \| Speaker (optional) \| Text`; a 2-part `timestamp \| Text` line is also accepted |
| `progressPersistence` | boolean | `true` | Enables/disables all `localStorage` reads/writes for this instance |
| `takeaways` | delimited text | `''` | One entry per line |
| `takeawaysVisibility` | select | `'always'` | `always` \| `afterCompletion` |

Item-level: the pre-existing `transcript` (plain richtext field) is now explicitly a **fallback** — a synchronized `transcriptSegments` value, when present, takes priority. All other item fields (`content`, `posterImage`, `posterAltText`, `posterDecorative`, `captionsUrl`, `audioDescription`) are unchanged.

Syntax, parsing tolerance (a malformed line is skipped, never throws), and the "why delimited text, not a nested repeatable list" reasoning are identical to `audio-player`'s — see `docs/AUDIO-PLAYER.md` "Data model" for the full explanation; `parseChapters`/`parseTranscriptSegments`/`parseTakeaways` in `components/video-frame.js` are a direct duplication of `audio-player`'s own parsers (small, pure functions — neither component imports the other).

**Timestamp format**: `MM:SS` or `HH:MM:SS`. Duplicate chapter timestamps are kept (never silently dropped) and flagged by Preflight (see below).

## Validation

`validate()` is unchanged (still only blocks on a missing video source). Two new Preflight rules (`js/validation.js`), scoped to `video-frame`, generalized from `audio-player`'s equivalent rules via a shared `checkMediaChapterAndTranscriptRules(componentId, config)` helper rather than a second copy-pasted implementation:

- **`video-frame-invalid-chapter-line` / `video-frame-duplicate-chapter-timestamps`** — a chapter row with a bad/missing timestamp or title, or two rows sharing one timestamp.
- **`video-frame-invalid-transcript-segment`** — a synchronized-transcript row with a bad/missing timestamp.

**Timestamps vs. the video's length (audit 2026-09-30, section 3).** The same checks as `audio-player` run against the uploaded video's recorded length (`items[0].content.duration`): `video-frame-chapter-outside-duration` and `video-frame-transcript-segment-outside-duration` (Warning, with the row, timestamp and permitted range), and `video-frame-timestamps-unverified` (Recommendation) when the length is unknown, for example an external URL. See `docs/AUDIO-PLAYER.md` "Validation" for the end-boundary rule and the correction path. The exported component also hides a chapter marker past the real `video.duration` (once `loadedmetadata` fires) from the scrub track.

## Resume and progress — what it is and isn't

Identical mechanism to `audio-player`'s — see `docs/AUDIO-PLAYER.md` "Resume and progress" for the full explanation of the storage key scheme, throttled writes, and the two hydration guards. Specific to `video-frame`:

- **Storage key**: `` `rcb-video-progress-${vidHash(instanceId + '|' + videoSrc)}` ``, reading the `<source>` element's `src` (falling back to the `<video>` element's own `src` attribute if present).
- Both guards — `progressHydrated` (no write before `localStorage` has been read once) and `hasEngaged` (no write before the learner has actually played or sought *this load*, set by the native `seeking`/`play` events) — were included **proactively from this component's first version**, not discovered reactively here. They port forward a real bug found and fixed for `audio-player` mid-session (see `docs/AUDIO-PLAYER.md` "Testing status," item 3) and were confirmed correct for `video-frame` by both a dedicated e2e regression test and a live manual reproduction of the exact race (see "Testing status" below) before ever shipping.
- **Completion threshold**: `VID_COMPLETION_THRESHOLD` (90%) **or** within `VID_COMPLETION_TAIL_SECONDS` (3s) of the end.
- **This is internal component progress only** — never Rise/SCORM/LMS completion; the existing shared `{ type: 'complete' }` signal (`docs/COMPLETION-INTEGRATION.md`) is untouched.

## Accessibility

- Native `<button>` elements throughout (Replay/Forward, speed, mute, chapter markers, chapter-list rows, transcript toggle/segments, resume/restart) — no custom key handling needed for activation, only for the existing scrub-bar slider (arrow/Home/End, unchanged).
- Chapter markers sit as a **sibling overlay** (`.video-chapter-markers`) next to `.video-timeline-scrub`, not as children of it — applied proactively from the start, since this is the same real `nested-interactive` bug already found and fixed for `audio-player`.
- The chapter list uses an explicit `list-style: none` reset on both the `<ul>` and its `<li>`s — applied proactively, since a bare list otherwise leaks a browser-default bullet even under `display: flex` (the same real bug already found and fixed for `audio-player`'s chapter list).
- Active chapter and active transcript segment are never color-only — the active chapter row also gets `aria-current="true"` and a `▸` marker; the active transcript segment also gets a left border and bolded weight.
- `hasTranscript` uses `isEmpty()` (`js/field-validation.js`), not a bare truthy check, so a visually-empty richtext transcript (e.g. `<p></p>`) correctly suppresses the "Show Transcript" toggle — applied proactively, since this is the same real bug already found and fixed for `audio-player`.
- Auto-scrolling the active transcript segment into view respects `prefers-reduced-motion` and only scrolls when the segment isn't already visible; a learner's own manual scroll suppresses further auto-scroll until they click a segment or chapter again.
- **Known, considered trade-off — not silently excluded**: chapter markers on the scrub bar do not reach a fully clean WCAG 2.2 `target-size` pass in every automated scan, for the identical reasons documented in `docs/AUDIO-PLAYER.md` "Accessibility." The fully WCAG-conformant path to every chapter is the chapter list. `tests/e2e/video-frame.spec.js` scopes its axe scan accordingly.
- The pre-existing poster `aria-describedby`, captions `<track>`, and audio-description `<details>` disclosure are all unchanged by this work.

## Export and multi-instance behavior

No new export pipeline — goes through the same `generateIframeContent()` compiler every other component uses. **Multiple instances on one page operate independently**, verified directly: every control is looked up via `document.getElementById('<instanceId>-...')`, and repeated elements (chapter markers, transcript segments) are found via `querySelectorAll` scoped to that instance's own container. **Starting one player pauses every other `<audio>`/`<video>` element already playing on the page** — plain DOM traversal (`document.querySelectorAll('audio, video')`), the same mechanism `audio-player` uses, confirmed to interoperate across both component types (an audio-player instance and a video-frame instance on the same page pause each other, since both traverse the same selector).

## Icons

Replay/Forward, volume-on/off, and transcript glyphs are the exact same real AT&T Brand Center icons already sourced and verified for `components/audio-player.js` — reused verbatim rather than sourcing a second, redundant set for the same meaning. The chevron is copied from `components/accordion.js`'s existing `.acc-arrow` path. See `docs/AUDIO-PLAYER.md` "Icons" for the sourcing method and why the "10" numeral is composited typography rather than the icon library's own "restart-15" glyph.

## Testing status

- `tests/unit/video-frame.test.js` — 55 tests: the delimited-text parsers (well-formed input, every malformed-line case, chronological sorting, duplicate timestamps kept not dropped), HTML output (chapters/transcript/takeaways/audio-description independence), the compiled script's syntactic validity, the multi-instance `getElementById` scoping, the named skip/completion constants, the toggle wiring, and a regression test for the dual hydration/engagement guard. `video-frame` also runs through `tests/unit/generators.test.js`'s shared hostile-input loop like the other components.
- `tests/unit/att-brand-compliance.test.js`, `tests/unit/validation.test.js` — extended with `video-frame`-specific coverage (Cobalt-outlined controls at rest; the 14 new chapter/transcript Preflight-rule tests, shared with `audio-player` via `describe.each`).
- `tests/e2e/video-frame.spec.js` — 19 real-browser Playwright tests, **passing on both chromium and webkit (19/19 each)**: Replay/Forward clamping and disabled-until-metadata state, overlay/mini-play sync, speed cycling, mute toggle, chapter markers + chapter-list seek + active-chapter `aria-current` + the collapsible toggle, an accessible chapter-marker label, transcript toggle/search/highlight/click-to-seek, the audio-description disclosure's independence from the transcript system, a blank-transcript hiding the toggle entirely, completion + reveal-after-completion takeaways, the resume prompt (both "should show" and "should not show, too early" cases), Start Over, a dedicated regression test for the `visibilitychange`-race resume-progress bug (the same class of bug found for `audio-player`, pre-empted here), `progressPersistence: false` still functioning normally, two genuinely independent instances on one page (unique ids, play-pauses-the-other), and axe-core scans (scoped per the `target-size` note above) on the default render and with the transcript panel expanded. Uses a new 30-second synthetic test fixture (`tests/fixtures/media/tiny-test-video-30s.mp4`) — the pre-existing `tiny-test-video.mp4` (4s) was too short for the resume-prompt tests' timing requirements, the same reason `audio-player`'s own test fixture needed to be longer than its original.
- One webkit-only false failure was diagnosed and filtered, not silently ignored: `Temporal.Duration properties must be finite and of consistent sign`, a pre-existing Playwright-bundled-WebKit `<video controls>` shadow-DOM engine quirk already documented and filtered in `tests/e2e/interactive-video.spec.js` — reproduced independently, confirmed unrelated to this component's code, and the same filter was applied here rather than treated as a new bug.
- **Live-verified against the running Builder app** (not just the automated suite): a real compiled fixture page was loaded through `http-server`, and genuine browser behavior was confirmed for the chapters collapse toggle, the resume prompt (seeded via a neutral same-origin page to avoid a seed/unload race, then a fresh navigation — Resume correctly seeks to the stored position), the `visibilitychange`-race regression fix (confirmed it does *not* reproduce), and takeaways reveal driven by a real `ended` event from genuine video playback to completion (not a synthetic `dispatchEvent`).
- Because this component's implementation closely mirrors `audio-player`'s already-debugged code, all four of `audio-player`'s real, testing-found bugs (progress-clobber-on-early-unload, nested-interactive chapter markers, the visibilitychange-race clobber, and the browser-default bullet leak) were pre-empted in `video-frame`'s first version rather than needing separate rediscovery — no new class of bug was found specific to `video-frame` during this pass.

**Not yet verified**: inside Rise's own authoring preview or a published Rise 360 course — every check above is automated or verified by hand in this Builder's own preview, none of it a substitute for `docs/RISE-TEST-CHECKLIST.md`'s manual pass.

## Known limitations

- No live-duration-capture authoring widget (unlike Interactive Video's Marker Timeline) — see "Validation" above.
- Chapter-marker `target-size` on the scrub track is a considered, documented trade-off — see "Accessibility" above.
- Delimited-text chapters/transcript segments/takeaways cannot themselves contain a literal `|` unambiguously — the same trade-off already documented in `docs/AUDIO-PLAYER.md` and `docs/COMPONENT-SCHEMA.md`.
- `localStorage`-backed resume is per-browser-profile — it does not follow a learner across devices or browsers.
- No captions-on/off UI toggle, load-error state, poster object-fit control, or multiple presentation modes (items 9–12 of the original proposal, not approved for this pass).
