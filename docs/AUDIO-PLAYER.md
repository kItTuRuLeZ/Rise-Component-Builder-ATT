# Interactive Learning Audio

**Status: feature-complete against the brief that requested it, single-session build.** Not phased like `docs/INTERACTIVE-VIDEO.md` — everything below shipped and was tested together. Only claim what has actually shipped and been verified, per this project's own documentation conventions (`docs/KNOWN-ISSUES.md`, `docs/COMPLETION-INTEGRATION.md`).

## Instructional use cases (why this differs from Rise's native Audio block)

Rise's own Audio block plays a file with a title, a scrub bar, and (in some configurations) a transcript disclosure — the same fixed set every author gets, and nothing tracks where a learner left off. Interactive Learning Audio is meant for audio where the *audio itself* is the lesson content, not a supporting clip: a multi-part podcast episode with sections a learner may want to jump between, a narrated walkthrough with a transcript worth searching, a longer piece a learner reasonably expects to resume rather than restart. None of that is buildable with Rise's native block.

## What shipped

A single-track `<audio>` block (`components/audio-player.js`, `id: 'audio-player'`, unchanged — only the catalog display name changed to "Interactive Learning Audio") with:

- **Replay/Forward 10 seconds** — `AUD_SKIP_SECONDS` (10), clamped to `[0, duration]`, disabled until metadata loads.
- **Timestamped chapters** — an optional delimited-text field (`config.chapters`), rendered as small clickable markers on the scrub bar and a full chapter list below it; the current chapter's title is shown near the timeline in Learning/Podcast modes.
- **Synchronized transcript** — an inline, expandable panel (never a viewport-level modal — the component may run inside a constrained Rise iframe) with search, click-to-seek, and active-segment highlighting; falls back to the existing plain `transcript` (richtext) field when no synchronized segments are authored.
- **Resume and local progress** — `localStorage`-backed position/furthest-position/completion tracking, offering "Resume from M:SS" / "Start Over" when there's meaningful prior progress; entirely optional (`progressPersistence`) and never a substitute for or claim about Rise/LMS/SCORM completion.
- **Key takeaways** — an optional list, either always visible or revealed only once the component's own internal completion state is reached.
- **Three presentation modes** — Compact (short clips/pronunciations), Learning (default — the full feature set), Podcast (longer-form, larger artwork/eyebrow/description) — one shared `generateHTML`/`generateCSS`/`generateJS`, gated by `config.presentationMode`, not three separate implementations.
- Everything the component already had: title, uploaded/external audio, optional artwork, play/pause, seek, elapsed/total duration, playback speed (1x/1.25x/1.5x/2x), mute, AT&T theme tokens, responsive layout, keyboard accessibility, and the same export pipeline every component already goes through (`docs/EXPORT-CONTRACT.md`) — none of it removed or behaviorally changed.

## Data model

New, all additive/optional with schema `default` values (`js/editor-schemas.js`'s `audio-player` entry) — an old saved project loads exactly as before via the existing `applyMissingSchemaDefaults()`/`syncEditorControls()` undefined-safe fallback (`docs/ARCHITECTURE.md` "Component discovery," §2), the same mechanism Flip Cards Study mode and every other additive feature in this codebase already relies on. No project-level or component-level schema migration was needed.

Component-level fields (`componentFields`, shown once per instance — see `js/editor-schemas.js`'s own comment for the "why a card here, not per-item" reasoning):

| Field | Type | Default | Purpose |
| --- | --- | --: | --- |
| `presentationMode` | select | `'learning'` | `compact` \| `learning` \| `podcast` |
| `chapters` | delimited text | `''` | One per line: `timestamp \| Title \| Description (optional)` |
| `transcriptSegments` | delimited text | `''` | One per line: `timestamp \| Speaker (optional) \| Text`; a 2-part `timestamp \| Text` line is also accepted |
| `progressPersistence` | boolean | `true` | Enables/disables all `localStorage` reads/writes for this instance |
| `takeaways` | delimited text | `''` | One entry per line |
| `takeawaysVisibility` | select | `'always'` | `always` \| `afterCompletion` |

Item-level additions (the single audio track item, `maxItems: 1`, unchanged): `seriesLabel` (optional eyebrow, Podcast mode), `description` (optional, Learning/Podcast modes). `transcript` (existing plain richtext field) is now explicitly a **fallback** — a synchronized `transcriptSegments` value, when present, takes priority.

### Why delimited text, not a nested repeatable list

`js/editor.js`'s schema-driven item editor has no field type for a nested, repeatable sub-list within an item (`docs/COMPONENT-SCHEMA.md` "Recommended schema improvements" — still true as of this feature). Interactive Video hit the same wall for its multiple-choice markers' answer options and chose 4 fixed flat slots; that option doesn't fit here (chapters/transcript segments are genuinely unbounded). The established, lower-risk alternative already shipped elsewhere in this codebase — `pricing-comparison.js`'s `•`-split feature list — is a single delimited-text field, parsed at render time. `parseChapters`/`parseTranscriptSegments`/`parseTakeaways` (`components/audio-player.js`) implement that here: each tolerates a malformed line by skipping it, never throwing, so a typo in one chapter row can never break preview or export. A new schema field type for real nested repeatable lists remains a larger, cross-component change explicitly out of this feature's scope — see "Recommended schema improvements" in `docs/COMPONENT-SCHEMA.md`.

**Timestamp format**: `MM:SS` or `HH:MM:SS` (`parseTimestampToSeconds`). Duplicate chapter timestamps are kept (never silently dropped) and flagged by Preflight (see below) — an authoring mistake worth a Warning, not a reason to lose authored content.

## Validation

`validate()` is unchanged (still only blocks on a missing audio source, matching every other component's "fast, defaults-obvious authoring correctness" convention — `docs/INTERACTIVE-VIDEO.md`'s own reasoning for the same split). Two new Preflight rules (`js/validation.js`, Warning severity, `docs/VALIDATION-RULES.md`-style registration), scoped to `audio-player`:

- **`audio-player-invalid-chapter-line` / `audio-player-duplicate-chapter-timestamps`** — a chapter row with a bad/missing timestamp or title, or two rows sharing one timestamp.
- **`audio-player-invalid-transcript-segment`** — a synchronized-transcript row with a bad/missing timestamp.

**Timestamps vs. the audio's length (audit 2026-09-30, section 3).** Chapters and synchronized-transcript rows are checked against the length recorded on the uploaded file's media reference (`items[0].content.duration`, read from the file's own metadata at upload time by `js/media-upload.js`). No live-measurement widget is needed, and replacing the file replaces the length, so the next Preflight re-checks every row automatically.

- **`audio-player-chapter-outside-duration` / `audio-player-transcript-segment-outside-duration`** (Warning) — a row starts after the end of the file. The message names the row, its timestamp and the permitted range (`0:00 to 0:12`), says that export is not blocked and that nothing was changed, and offers the correction path: fix the timestamp or attach the right file. Nothing is deleted or rewritten.
- **`audio-player-timestamps-unverified`** (Recommendation) — the length is not known (an external URL, or an upload whose metadata could not be read), so the timestamps have not been checked. It is reported as unverified rather than left to read as a pass; re-uploading the file lets the Builder read its length.
- **End boundary:** a timestamp is out of range only when it is strictly greater than the length. A timestamp equal to the length sits on the final instant and is not flagged. The same predicate is used for video chapters and Interactive Video markers.

The exported player also degrades gracefully at runtime: a chapter marker past the real `audio.duration` (once `loadedmetadata` fires) is not rendered on the scrub track, so preview and export never draw a marker at an invalid position. The Preflight warning is what tells the author it happened.

## Resume and progress — what it is and isn't

- **Storage key**: `` `rcb-audio-progress-${audHash(instanceId + '|' + audioSrc)}` `` — a small djb2-style hash, collision-resistant enough for this purpose and stable per component instance + audio source. Changing the audio source changes the key, so old progress for a different clip is naturally orphaned rather than misapplied — no explicit "reset on source change" step was needed.
- **Never stores the audio itself** — only `{ position, furthest, completed, updatedAt }`.
- **Throttled writes** — at most once every 5 seconds during playback (`timeupdate`), plus an immediate (`force`) write on `pause`, `visibilitychange` (tab hidden), and `beforeunload`.
- **Hydration guard** (`progressHydrated`) — `saveProgress()` is a no-op until the component's own `loadedmetadata` handler has actually read `localStorage` once. Without this, a `beforeunload`/`visibilitychange` save firing before that read completes would write the freshly-initialized zeros still sitting in memory and silently erase real prior progress — found and fixed during this session's own e2e testing (see "Testing status").
- **Storage unavailable or blocked** (private browsing, disabled storage, or `progressPersistence: false`) never breaks playback — every read/write is wrapped in `try/catch`, and `completed`/the progress-status text are computed live from `audio.currentTime`/`duration` in memory regardless, so within-session functionality (including takeaways reveal-after-completion) never depends on storage succeeding.
- **Completion threshold**: `AUD_COMPLETION_THRESHOLD` (90%) **or** within `AUD_COMPLETION_TAIL_SECONDS` (3s) of the end — named constants, not magic numbers.
- **This is internal component progress only.** It is never described as, and never sets, Rise course completion, SCORM completion, or LMS completion — the existing shared `{ type: 'complete' }` completion signal (`docs/COMPLETION-INTEGRATION.md`) is untouched and fires on the same shared `viewedItems`/`updateProgress()` mechanism every component already uses, via `markCompleted()`.

## Accessibility

- Native `<button>` elements throughout (Replay/Forward, speed, mute, chapter markers, chapter-list rows, transcript toggle/segments, resume/restart) — no custom key handling needed for activation, only for the existing scrub-bar slider (arrow/Home/End, unchanged).
- Chapter markers sit as a **sibling overlay** next to `.aud-scrub-bar`, not as children of it — `.aud-scrub-bar` carries `role="slider"`, and axe's `nested-interactive` rule correctly flags real, focusable `<button>` markers living inside a slider's content model. Found and fixed during this session's own accessibility scan (see "Testing status").
- The component title moved from a legacy `<h5>` to a genuine `<h3>` (the shared block header above every component is `<h2>` by default — `blockHeadingLevel`) once this component gained a real accessibility scan for the first time; `<h4>` is used for the Chapters/Key Takeaways section headings beneath it, so the sequence never skips a level.
- Active chapter and active transcript segment are never color-only — the active chapter list row also gets `aria-current="true"` and a `▸` marker; the active transcript segment also gets a left border and bolded weight.
- Search results are announced once per search (a `role="status"` region updated only on input change), not on every keystroke's intermediate DOM update beyond that single text change, and never on every `timeupdate` — this component's shared `aria-live="polite"` status region (`.aud-status-region`) is only ever touched by discrete state changes (play, pause, completion), matching the "no continuous announcements during every timeupdate" requirement this feature was built against.
- Auto-scrolling the active transcript segment into view respects `prefers-reduced-motion` (`behavior: 'auto'` instead of `'smooth'`) and only scrolls when the segment isn't already visible; a learner's own manual scroll inside the transcript panel suppresses further auto-scroll until they click a segment or chapter again (a deliberate re-engagement signal, not a timeout).
- **Known, considered trade-off — not silently excluded**: chapter markers on the scrub bar do not reach a fully clean WCAG 2.2 `target-size` pass in every automated scan. Each marker's real click target was grown from a bare 10px dot to a 24px circle (via a `::before` pseudo-element keeping the *visible* dot small) and inset from the track's very ends, but a marker sitting on top of another interactive slider, on an intentionally slim (6px) "not noisy" track, can still register as spatially close to the slider's own hit area or a neighboring control under axe's `target-size`/`target-offset` sub-checks. The fully WCAG-conformant path to every chapter is the chapter list (`.aud-chapter-nav`, full-width rows, well over 24px tall) — the inline scrub-bar markers are a mouse/touch convenience layered on top, not the only way to reach a chapter. `tests/e2e/audio-player.spec.js` scopes its axe scan accordingly (with a comment explaining why), matching the existing precedent of excluding `.block-label`'s shared-chrome contrast issue from `interactive-video.spec.js`'s own scan scope.

## Export and multi-instance behavior

No new export pipeline — this component goes through the exact same `generateIframeContent()` compiler every other component uses (`docs/ARCHITECTURE.md` §4), so Iframe Snippet, HTML Block Fragment, and Web Package ZIP all support it automatically. No external JS/icon dependency, no dynamically imported modules, no new CSP relaxation, no SCORM/Rise API calls beyond the existing shared `{ type: 'complete' }` signal.

**Multiple instances on one page operate independently**, verified directly (not just assumed): every singleton control (play/skip/speed/mute buttons, scrub bar, chapter list, transcript panel/search, resume prompt, takeaways) is looked up via `document.getElementById('<instanceId>-...')`, scoped by the same per-project `instanceId` every component already uses (`js/preview.js#getInstanceId`) — not the bare, unscoped `document.querySelector('.class-name')` pattern this component's own pre-existing code (and several other components, per `docs/COMPONENT-SCHEMA.md`'s Flip Cards Study mode note) still uses for its non-uniquely-identified elements. Repeated elements within one instance (chapter markers, transcript segments) are found via `querySelectorAll` scoped to that instance's own container, never `document.querySelectorAll`. **Starting one player pauses every other `<audio>`/`<video>` element already playing on the page** — plain DOM traversal (`document.querySelectorAll('audio, video')`) on the `play` event, not a shared global object or cross-component signaling channel.

## Icons

Replay/Forward glyphs are real AT&T Brand Center icons (Navigation & Controls "restart," a matched counterclockwise/clockwise pair), verified by rasterizing the source library and inspecting the result — the same method already used and documented for this component's volume/mute/document icons. The "10" numeral is ordinary typography composited over the real icon path, not an invented pictogram; the icon library's own "restart-15" glyphs (with a literal "15" baked into the path) were deliberately not reused, since presenting "15" for a 10-second skip would be factually wrong, not just a style mismatch.

## Sample configuration

`docs/examples/audio-player/podcast-episode.json` — a ready-to-import project demonstrating Podcast mode, 5 chapters, a synchronized transcript, `progressPersistence: true`, and `takeawaysVisibility: 'afterCompletion'`. Import it via the Builder's existing **Import Project File** button (Open Project modal), exactly as any shared/exported project — there is no new "load sample" feature. Uses the same sample audio clip `components/audio-player.js`'s own `defaultConfig` already ships with (SoundHelix's freely-usable demo track) — replace it with your own uploaded or hosted audio before publishing. Generated by `scripts/generate-audio-player-samples.mjs` from `tests/fixtures/audio-player-sample-definitions.mjs`; re-run and commit if the schema/defaultConfig ever changes in a way that would make the committed sample stale. `tests/unit/audio-player-samples.test.js` is the drift detector plus a genuine-validity check.

## Testing status

- `tests/unit/audio-player.test.js` — the delimited-text parsers (well-formed input, every malformed-line case, chronological sorting, duplicate timestamps kept not dropped), mode-gated HTML output (Compact omits chapters/transcript/takeaways/progress/resume entirely; Learning/Podcast render all of them), the compiled script's syntactic validity across every mode, the multi-instance `getElementById` scoping, the named skip/completion constants, and a regression test for the hydration-guard fix. `audio-player` also runs through `tests/unit/generators.test.js`'s shared hostile-input loop (XSS/escaping/unsafe-URL fixtures) like 20 of the other 21 components.
- `tests/unit/audio-player-samples.test.js` — drift detector plus genuine-validity check for the sample project.
- `tests/unit/att-brand-compliance.test.js`, `tests/unit/export-isolation.test.js`, `tests/unit/export-determinism.test.js`, `tests/unit/validation.test.js`, `tests/accessibility.test.mjs` — all extended for the new controls/markers/rules.
- `tests/e2e/audio-player.spec.js` — 25 real-browser Playwright tests (chromium 25/25; firefox not separately re-verified in this session, see `docs/KNOWN-ISSUES.md`'s existing, already-documented sandbox flake) covering: Replay/Forward clamping and disabled-until-metadata state, speed cycling, mute, chapter markers + chapter-list seek + active-chapter `aria-current` + the collapsible toggle, transcript toggle/search/highlight/click-to-seek/active-segment sync, plain-transcript fallback, a blank-transcript hiding the toggle entirely, completion + reveal-after-completion takeaways, the resume prompt (both "should show" and "should not show, too early" cases), Start Over, a dedicated regression test for the visibilitychange-race bug below, `progressPersistence: false` still functioning normally, two genuinely independent instances on one page (unique ids, play-pauses-the-other), all three presentation modes — including full chapters/transcript interaction depth in Podcast mode specifically, not just structural presence — and axe-core scans (scoped per the target-size note above) on Learning/transcript-expanded/Compact/Podcast.

**Real bugs found and fixed by this testing, not just asserted away:**
1. **`saveProgress()` could clobber real prior progress with zeros** if a `beforeunload`/`visibilitychange` save fired before the component's own `loadedmetadata` handler had read `localStorage` at least once — found via the resume-prompt e2e test, fixed with the `progressHydrated` guard described above.
2. **Chapter markers nested inside `role="slider"`** — found via this component's first-ever automated axe scan (audio-player, unlike Accordion/Tabs/Grid Photo Gallery/Interactive Video, had no dedicated scan before this feature), fixed by restructuring markers as a sibling overlay instead of a child of the slider element.
3. **`saveProgress()` could clobber a real stored position back to 0 even *after* hydration**, if `visibilitychange`/`beforeunload` fired while the resume prompt was showing but not yet acted on — `audio.currentTime` is still genuinely 0 at that point (the learner hasn't played or sought yet), so the save would overwrite a real `position: 20` with `position: 0`; the *next* Resume click would then read that clobbered 0 back out and seek to the wrong place. Found by manually reproducing the resume flow live against the running Builder, not by the original automated suite — fixed with a second `hasEngaged` guard (set by the native `seeking`/`play` events, so a save is never written before the learner has actually done something this load) and now covered by a dedicated e2e regression test.
4. **The chapter list showed plain browser-default bullets** (`<ul>`'s `list-style: disc` — `display: flex` on the list container doesn't reset each `<li>`'s own default `display: list-item`, which the bullet actually depends on) — found from a user screenshot, fixed with an explicit `list-style`/margin/padding reset.
5. **"Show Transcript" could appear with nothing to show** — a richtext field's "empty" value from the contentEditable editor is often not literally `''` but a visually-empty fragment like `<p></p>`/`<br>`; `hasTranscript` now uses the same `isEmpty()` (`js/field-validation.js`) every other required/warning check on this field type already uses, instead of a bare truthy check.

**Not yet verified**: inside Rise's own authoring preview or a published Rise 360 course — every check above is automated or verified by hand in this Builder's own preview, none of it a substitute for `docs/RISE-TEST-CHECKLIST.md`'s manual pass. Until that runs, describe this component's real-Rise compatibility the same way every other Confirmed-pipeline component is described in `docs/RISE-COMPATIBILITY-MATRIX.md`: "expected, following the same shared export pipeline every Confirmed component already uses," not "Confirmed" on its own.

## Known limitations

- No live-duration-capture authoring widget (unlike Interactive Video's Marker Timeline) — see "Validation" above for exactly what this does and doesn't affect.
- Chapter-marker `target-size` on the scrub track is a considered, documented trade-off, not a defect silently ignored — see "Accessibility" above.
- Delimited-text chapters/transcript segments/takeaways cannot themselves contain a literal `|` in a way that's unambiguous with column separation (a title/text containing `|` degrades to *something* parseable, never throws, but the pipe itself will be read as a column boundary) — the same trade-off `docs/COMPONENT-SCHEMA.md` already documents for `pricing-comparison.js`'s `•`-split feature list.
- `localStorage`-backed resume is per-browser-profile, like every other piece of local persistence in this application (`docs/KNOWN-ISSUES.md` "Persistence and validation") — it does not follow a learner across devices or browsers.
