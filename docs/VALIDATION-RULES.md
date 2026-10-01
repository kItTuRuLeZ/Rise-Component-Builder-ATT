# Validation & export-preflight rules

This is the full catalog of the schema-driven, component-specific validation engine (`js/validation.js`). It exists to replace ad hoc, inconsistent checks with one auditable rule set that has a clear, honest contract: **only genuine blocking failures prevent export.** Everything else is advisory.

## Severities

| Severity | Meaning | Blocks export? |
| --- | --- | --- |
| **Blocking error** | The output would be broken, empty, or fundamentally unusable — no correct answer, an empty component, a headline with no accessible name, a position that renders off-frame. | **Yes** |
| **Warning** | A real, demonstrable defect the author should know about — missing alt text, an insecure URL, insufficient color contrast, an oversized file. | No |
| **Recommendation** | A quality/best-practice suggestion, not a defect — a missing (optional) hotspot background image, empty per-option feedback text. | No |

`summarizePreflight(issues)` computes `canExport = blocking.length === 0` — this is the *only* thing gating the Export modal's copy/download buttons (`setExportActionsEnabled()`, `app.js`).

## Where results appear

1. **Existing inline field errors/warnings** (`.field-error`/`.field-warning`, `js/editor.js`) — unchanged: required-field, format (URL/number/color), and accessibility (alt-text/transcript) messages continue to appear directly under their field as the author types, exactly as before this system existed. These reuse the same underlying checks the new engine also calls (`js/field-validation.js`), so there is one source of truth, not two competing ones.
2. **Item-card issue badges** — a small count badge (red for blocking, amber for warning/recommendation) on each item's collapsed-card header, live-updated on every edit via `schemaItemEditor.refreshIssueBadges()` — a targeted DOM patch, not a full re-render, so typing never loses focus or collapsed state.
3. **The consolidated Preflight panel** (`#modal-preflight`, opened via the "Preflight" button in the editor header) — every issue from every rule, grouped by severity (Blocking first, both by section order and by a colored left-border accent on each individual issue — Requirement 3, P05), each with a "Go to field"/"Go to item" button that closes the panel, expands the item if it was collapsed, and scrolls/focuses the exact target (`jumpToPreflightField`, `app.js`).
4. **The Export modal** — runs the same full check (including the one async rule) every time it opens, shows the same grouped results above the compatibility report, and disables Copy/Download when blocking issues exist.

Both panel and Export modal also update a separate, visually-hidden `aria-live="polite"` region (`#preflight-announcement` / `#export-preflight-announcement`) with one short sentence — `summarizePreflightForAnnouncement()`, e.g. "2 issues: 1 blocking, 1 warning." or "No issues found." — instead of making the detailed issue list itself the live region (Requirement 5, P05). The full list re-reading itself aloud on every render was a real problem, not a hypothetical one: the Export modal's results container used to carry `aria-live="polite"` directly, so opening it with several issues present read every issue's full text aloud. The concise region is updated only from a full preflight run (panel open, export gate) — never from the per-keystroke inline-badge refresh path, so typing never triggers an announcement.

## Architecture

- `collectSyncIssues(context)` — runs every *registered* rule except one (see "Rule registry" below), pure and synchronous. Safe to call on every keystroke (badges, the editor header's live badge) and is the bulk of the consolidated panel.
- `runPreflight(context)` — `collectSyncIssues` plus `checkBrokenMediaReferences` (the one rule needing an IndexedDB read). Used by the Preflight panel and the Export modal, where an async round-trip is acceptable.
- Reuses rather than re-implements: `validateSchemaField`/`getAccessibilityWarning` (`js/field-validation.js`, extracted from `js/editor.js` specifically so neither module has to import the other), `validateMediaAccessibility` (`js/media.js`), `resolveThemeTokens` + `contrastRatio` (`js/themes.js`).
- **Fails open.** If the preflight check itself throws (a bug in this engine), the Export modal logs it inline but does not disable export — a broken validator must never become a way to brick a working export.

## Result shape (P05)

Every issue that leaves this module — from `collectSyncIssues`, `runPreflight`, or `checkCompletionExportFormatIssue` — has this stable shape:

| Field | Meaning |
| --- | --- |
| `ruleId` | Stable machine identifier, e.g. `general-required-field`. One rule id can be emitted at different severities in different situations (`general-invalid-completion-config`) — see `RULE_TITLES` below for why title and explanation are separate. |
| `severity` | `SEVERITY.BLOCKING` / `WARNING` / `RECOMMENDATION`. |
| `category` | Internal grouping (`general`/`knowledge`/`media`/`hotspots`) — not currently surfaced in the UI, kept for potential future filtering. |
| `title` | Short, static, rule-level label (`RULE_TITLES[ruleId]`, e.g. "Required field is empty") — the same for every instance of that rule. |
| `explanation` | The detailed, instance-specific text — which field, which item, which count. This is what used to be called `message`. |
| `fieldId` / `itemIndex` | Kept at the top level (existing call sites read them directly) *and* mirrored into `target` below. |
| `target` | `{ componentId, itemIndex, fieldId }` — a single structured pointer to where in the config this issue lives. |
| `fix` | `{ type: 'goToField' \| 'goToItem', label }` when there's something to navigate to, else `null`. `itemIndex` alone (no `fieldId`) still gets a `goToItem` fix — `jumpToPreflightField` (`app.js`) falls back to focusing the item card itself when there's no more specific field. |

## Rule registry (P05) — adding a rule

Rules are **registered**, not hardcoded into a conditional chain. `collectSyncIssues(ctx)` runs every entry in the registry whose `appliesTo(ctx)` (if present) returns true, and enriches whatever issues each `check(ctx)` returns into the result shape above.

```js
import { registerValidationRule, SEVERITY } from './validation.js';

registerValidationRule({
  id: 'my-new-rule',                          // unique registry key — required
  appliesTo: ({ componentId }) => componentId === 'my-component', // omit to run for every component
  check: ({ config }) => {
    if (config.someField) return [];
    return [{
      ruleId: 'my-new-rule-issue',             // your own stable id — add it to RULE_TITLES for a custom title
      severity: SEVERITY.WARNING,
      category: 'general',
      explanation: 'Explain exactly what is wrong and why it matters.',
      fieldId: 'someField',                    // or null
      itemIndex: null                          // or the item's index
    }];
  }
});
```

- `ctx` is the same context object `collectSyncIssues`/`runPreflight` receive: `{ componentId, schema, config, theme, componentOverrides, settings }` (plus `mediaStore` for the one async rule).
- No edit to `collectSyncIssues` itself, and no `if (componentId !== 'x') return []` guard buried in a shared module — `appliesTo` is the whole mechanism (Requirement 2).
- A `ruleId` with no `RULE_TITLES` entry still gets a title — it falls back to the ruleId string itself, so a new rule never ships with a blank title.
- `unregisterValidationRule(id)` removes a registry entry (mainly for tests — register a rule, assert behavior, unregister it in `afterEach`). `listRegisteredRuleIds()` lists the current registry, in run order.
- This is deliberately not wired up for any component module to self-register today — the deliverable for this pass is the mechanism and migrating the existing rules onto it, not expanding the catalog.

## General rules

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `general-required-field` | Blocking | A schema field marked `required` is empty, or a `requiredOne` cross-item field (e.g. multiple-choice's radio-group "correct answer") has no item satisfying it. Reported once per collection for `requiredOne`, not once per item. |
| `general-empty-component` | Blocking | Fewer items exist than the component's schema `minItems`. |
| `general-excessive-length` | Warning (short fields) / Recommendation (long-form fields) | A `text`/`select` field with no explicit `maxLength` exceeds 200 characters (Warning); a `textarea`/`richtext` field exceeds 4000 characters (Recommendation). Fields **with** an explicit `maxLength` are already hard-capped by `general-required-field`'s reuse of `validateSchemaField` — this rule only covers the *un-capped* fields. |
| `general-unsupported-rich-html` | Warning | A `richtext` field's value differs from `sanitizeRichText(value)` — proof that something outside the supported tag allowlist was escaped or altered on save. |
| `general-invalid-url` | Blocking | A `url`-type field's value isn't a valid `http(s)` URL (checked via `sanitizeURL`, the same sanitizer the export pipeline itself uses). |
| `general-missing-accessible-name` | Blocking | `config.blockHeadline` is empty. This field is the `aria-labelledby` target for the whole exported document's `<main>` region (`js/export-shell.js`) — previously **unvalidated anywhere**, since it's a static top-level field outside the dynamic schema-item system. |
| `general-missing-alt-text` | Warning | Delegates entirely to `validateMediaAccessibility` (`js/media.js`) — missing alt text or a missing decorative flag on any image field, missing transcript on audio, missing captions/transcript on video. |
| `general-insufficient-contrast` | Warning | Checks the color pairs this specific component actually renders (body text/card background, muted text/card background, button text/primary), using the fully resolved theme + per-component-override colors, against the applicable WCAG AA threshold — 4.5:1 for normal text, 3:1 for "large" text (≥24px any weight, or ≥18.66px at 700+ weight — `requiredContrastRatio()`, P07). Each pair's actual rendered `fontSizePx`/`fontWeight` is tracked explicitly in `CONTRAST_PAIRS`, surveyed against the real catalog CSS — today none of the three qualify as large text (13-14px, none at 700+), so this always resolves to 4.5:1 in practice, but the math is correct by construction rather than hardcoded. |
| `general-duplicate-items` | Warning | Two items share the same normalized primary field (`title`/`label`) *and* the same `content` — see "Duplicate IDs", below, for why this is the rule's actual scope. |
| `general-duplicate-titles` | Warning | (P06) Two items share the same normalized `title`/`label` but *different* `content` — ambiguous to navigate by title alone, even though nothing renders incorrectly. Skipped for components already covered by a more specific duplicate-label rule (`knowledge-duplicate-options`, `hotspot-keyboard-accessibility`) so the same pair is never flagged under two rule ids at once. |
| `general-item-count-exceeded` | Warning | (P06) `items.length` exceeds the schema's `maxItems` (e.g. audio-player/video-frame's `maxItems: 1`). The editor UI already prevents authoring past this limit (`js/editor.js`, `app.js#updateAddItemButtonState`) — this rule exists for the case the UI can't prevent: a hand-edited or imported project file. The generator for these components only ever renders `items[0]`, so anything beyond the limit is silently dropped from the export with no other signal. |
| `general-heading-level-outline` | Warning | (P06) `config.blockHeadingLevel === 'h1'`. Rise 360 lesson pages already have their own h1 — an author-selected h1 here creates a second, competing h1 in the host page's heading outline, confusing for a screen-reader user navigating heading-by-heading. Heading 2 (the schema default) is the recommended level. |
| `general-non-descriptive-link-text` | Warning | (P06) `button-list` only: an item's visible label (`title`) matches a conservative, hardcoded phrase list ("click here", "read more", "more info", etc. — WCAG SC 2.4.4's own classic examples) while its destination (`content`) is filled in. Deliberately scoped to `button-list` specifically, since its items are a bare `{label, URL}` pair with no surrounding descriptive text — the label is the *only* thing telling an out-of-context screen-reader user where the link goes. A documented heuristic, not a certainty — see "Rules requiring manual judgment," below. |
| `general-external-url-destination` | Warning | (P06) Any `url`-type field (schema-driven, like `general-invalid-url`) holding a valid, non-media external URL. Not a defect — every genuinely external destination gets the same advisory, showing `sanitizeURL`'s own canonicalized value (never the raw authored string) so the author can double-check a mistyped domain or stale link before publishing. |
| `general-invalid-completion-config` | Blocking / Warning / Recommendation | Blocking: completion required with zero items (can never complete). Warning: completion required with an empty completion message. Recommendation: completion required with no configured parent origin (see `docs/COMPLETION-INTEGRATION.md`). |
| `general-completion-iframe-format` | Warning | Informational: completion tracking is on, but no export format has been selected yet (fires in the general Preflight panel, which runs before the Export modal). Tells the author only the "Copy for Rise" (HTML fragment) format is confirmed to report completion to Rise — the Iframe Snippet and Web Package ZIP formats are not (see `docs/COMPLETION-INTEGRATION.md` "Export-format caveat"). |
| `general-completion-export-incompatible` | Blocking | `js/validation.js#checkCompletionExportFormatIssue(config, exportFormat)` — a targeted check, called directly (not part of `collectSyncIssues`'s default aggregate) once a *specific* export format is actually in use: the Export modal's Advanced "Iframe Snippet" and "Web Package ZIP" panes each call it with their own format key, and disable their copy/download action with this message when it fires. Defers to `js/compatibility.js#isExportFormatCompletionCompatible` — the single central rule both this check and the Export modal's own guidance copy are built on, so they can never disagree. |
| `general-clipping-risk` | Warning | The component's rendered height, measured in a hidden offscreen iframe (`js/dom-measurement.js`) at desktop width **with every collapsed accordion/disclosure/tab opened in turn** (worst case reported), exceeds a typical 500px Embed frame. This matters only for the **Web Package ZIP** shown in a fixed-height Rise Embed block; the message gives a height to set (the measured height rounded up to 10px). **"Copy for Rise" (HTML fragment) expands with its content and is not affected.** The 500px figure is a rough bar (it was the retired Iframe Snippet's height), not a property of a current export format. |
| `general-clipping-risk-unmeasured` | Recommendation | The height measurement above didn't run or failed (timeout, aborted, no DOM) — a manual-check reminder instead of a silent pass. |
| `general-mobile-overflow` | Warning | The component overflows its container by more than 2px at 375px width with every collapsed section opened (matching `js/device-preview.js`'s `mobile` device mode). The message names the widest element (tag and first class) and how far it overflows. |
| `general-mobile-overflow-unmeasured` | Recommendation | The mobile-width measurement above didn't run or failed — a manual-check reminder instead of a silent pass. |

### DOM-measurement rules — the one case that can't be pure config validation

`general-clipping-risk`/`general-mobile-overflow` are architecturally different from every other rule in this file: they need to know the component's *actual rendered pixel dimensions*, which cannot be derived from config data alone. `js/dom-measurement.js#measureRenderedDimensions(html, options)` renders the compiled export HTML into a hidden, offscreen `<iframe>`, and reads back `scrollHeight`/`scrollWidth`/`clientWidth` — not via `iframe.contentDocument` (which cross-origin sandbox restrictions would block anyway, see the module's own header comment), but via a small measurement script injected into the HTML that reports its own dimensions to the parent with `postMessage`, the same cross-sandbox channel `js/completion.js` already uses.

Consequences of this being DOM-dependent, not pure computation:
- **Not part of the rule registry.** `collectSyncIssues` (the per-keystroke path) never runs these — rendering a real hidden iframe on every keystroke would freeze the editor on any non-trivial project (Requirement 6). They're appended directly inside `runPreflight`, gated on `ctx.domMeasurement` having been explicitly supplied.
- **`ctx.domMeasurement` is caller-supplied, not self-fetched.** `app.js#attachDomMeasurement()` compiles the current preview HTML and calls `measureRenderedDimensions()` before invoking `runPreflight` — only from the two full-preflight-run call sites (the Preflight panel, the Export modal's gate), never from the live per-keystroke badge refresh. A module-scoped `AbortController` (`domMeasurementAbort`) cancels a still-in-flight measurement the moment a newer one starts, so a stale result from a superseded run can never land.
- **`undefined` vs `null` vs a real value, precisely.** `undefined` means "not attempted" (silently skip both rules — used by any caller, like the sync-only paths, that doesn't supply this at all). `null` means "attempted and failed" (surfaces the `-unmeasured` Recommendation for each dimension that failed). A real `{ desktopContentHeight, mobileOverflowPx }` means "measured" — and either field can independently be `null` if only that half of the measurement failed.
- **Every result says final Rise verification is still required** — pass, fail, or unmeasured alike — because the measurement happens in this app's own hidden iframe, not inside Rise's real sandbox; font rendering, host-page zoom, and Rise's own surrounding chrome can all differ.

### "Duplicate IDs", precisely scoped

The task that produced this system asked for a "duplicate IDs" check. There is no author-facing "ID" field anywhere in this application's schemas — every DOM id in an export is deterministically instance-scoped and already structurally guaranteed unique (`docs/EXPORT-CONTRACT.md`, proven by `tests/unit/export-determinism.test.js`). Rather than invent a fictitious ID field to validate, `general-duplicate-items` covers the closest real, useful concern: two items in the same component that are near-verbatim duplicates of each other's content — a genuine authoring mistake (e.g. an item duplicated and never edited), just not literally an "ID."

## Knowledge-check rules

Scoped to `multiple-choice` and `multiple-select` — the two components with an item-level `correct` boolean. `sorting-activity` and `fill-blank` are also in the "knowledge" catalog category but have a structurally different correctness model (a category match / a typed answer) and are covered by the General rules plus their own `component.validate()`.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `knowledge-no-correct-answer` | Blocking | Zero items have `correct: true`. |
| `knowledge-impossible-passing` | Blocking | Same underlying condition as above (zero correct, ≥2 items) — a second, consequence-framed message: no possible learner selection can ever satisfy the quiz's pass condition. Deliberately fires alongside `knowledge-no-correct-answer` rather than replacing it — one explains the omission, the other explains the effect. |
| `knowledge-multiple-correct-single-allowed` | Blocking | `multiple-choice` only: more than one item has `correct: true`, contradicting its single-answer (radio-group) design. The editor UI itself prevents this through normal use (selecting one correct answer un-selects the others), so this mainly catches a hand-edited or imported project. |
| `knowledge-duplicate-options` | Warning | Two items share the same normalized `label` text. |
| `knowledge-empty-feedback` | Recommendation | An item's `content` (the "Answer Feedback" field) is empty — the learner sees no explanation when choosing it. |

## Media rules

Schema-driven: scans every field of type `image`, `audio`, or `video` across **every** component's schema (not a hardcoded per-component list) — a custom icon on Flip Cards gets the same scrutiny as an Audio Player's source file.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `media-unsupported-file-type` | Blocking | An uploaded media reference's `mimeType` isn't in the supported allowlist for its kind (defensive — normal uploads are already validated at upload time by `js/media.js`; this catches an imported/hand-edited project). |
| `media-oversized-file` | Warning | An uploaded reference's `size` exceeds the configured per-kind limit (Builder Settings, `js/media.js#resolveMediaLimits`). The message states both real numbers (P07) — the file's actual measured size and the configured threshold (`formatExportedFileSize`, `js/export.js`) — not just "too large." |
| `media-external-asset-dependency` | Recommendation | The field holds a plain external URL rather than an uploaded reference — it will need network access after export and won't travel with the file. |
| `media-insecure-http-url` | Warning | That external URL uses `http://` rather than `https://` — a browser may block it as mixed content on an https page. |
| `media-broken-reference` | Blocking (required field) / Warning (optional field) | The referenced upload no longer exists in local (IndexedDB) storage — the same condition the export pipeline already detects (`prepareMediaExport`, `docs/KNOWN-ISSUES.md`), now surfaced *before* export too. The only rule requiring an async I/O read. |

## Hotspot rules

Scoped to the `hotspots` component.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `hotspot-missing-image` | Recommendation | No background image is set. Not a defect — a generic schematic placeholder renders instead — hence Recommendation, not Warning. |
| `hotspot-out-of-range-position` | Blocking | An item's `x`/`y` is non-numeric or outside 0–100 — would render off-frame or with broken CSS. The editor's own range-slider UI cannot produce this; it defends against a corrupted or hand-edited import. |
| `hotspot-overlapping` | Warning | Two hotspots are within 3 percentage points of each other on both axes — likely to visually overlap and be hard to click independently. |
| `hotspot-keyboard-accessibility` | Warning | Two hotspots share the same label — see below for why this is the rule's scope. |

### "Keyboard-accessibility issue", precisely scoped

Hotspot keyboard behavior itself (Escape to close, native `<button>` Enter/Space activation, focus management) is baked unconditionally into the component's generator (`components/hotspots.js`) — it is identical for every export and not something an individual authoring decision can break. The genuine, author-controllable keyboard/screen-reader accessibility risk is **ambiguous naming**: a keyboard or screen-reader user tabbing between hotspot pins hears/reads each one's label as its only way to tell them apart (there's no visual position cue available non-visually). Two pins sharing the same label make that impossible. That is what this rule checks — distinct from `hotspot-overlapping`, which is about visual/spatial proximity, not naming.

## Interactive Video rules

Scoped to the `interactive-video` component. Unlike every other section here, these were added incrementally across that feature's own phased build (see `docs/INTERACTIVE-VIDEO.md`) rather than in one pass — listed here for the first time as a catalog entry, closing a documentation gap: the rules existed in `js/validation.js` since that feature's Phase 2/3 but were never added to this file.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `interactive-video-near-duplicate-timestamps` | Warning | Two markers within 1 second of each other — hard to trigger independently once playback-pausing crossing detection is in effect. |
| `interactive-video-marker-near-edge` | Warning | A marker within 2 seconds of `0:00` or of the video's own (runtime-measured) duration. |
| `interactive-video-marker-outside-duration` | Warning / Blocking | A marker's timestamp is past the video's known duration, so it can never trigger. Blocking when that marker is also Required, since the video could then never satisfy a required-marker-dependent completion rule. |
| `interactive-video-required-never-pauses` | Warning | A Required marker has `pauseVideo` off, so it never opens during normal playback. Not Blocking: the marker-nav list (Phase 5) can still open it via a deliberate click regardless of `pauseVideo` — this heuristic doesn't currently distinguish the narrower case where `showMarkerNavigation` is also off, which would make it genuinely unreachable. |
| `interactive-video-non-direct-video-url` | Blocking | (Phase 7) `videoSourceType: 'url'` and `videoUrl`'s hostname is a known video-hosting page (YouTube, `youtube-nocookie.com`, `youtu.be`, Vimeo including `player.vimeo.com`) rather than a direct media file. A native `<video>` element cannot play a hosting-page URL at all — the export would show no video whatsoever, meeting this file's own Blocking bar ("the output would be broken, empty, or fundamentally unusable"). Deliberately a short, explicit host list rather than an attempt to enumerate every video-hosting service that exists — see "Rules requiring manual judgment" below. Skipped entirely for `videoSourceType: 'upload'` and for a URL that fails to parse at all (`general-invalid-url` already covers a malformed URL for this same field). |
| `interactive-video-uploaded-media-export-format` | Warning | (Phase 7) An uploaded video (`videoSourceType: 'upload'`) and/or an uploaded captions file are present. `prepareMediaExport()` (`js/export.js`) never inlines video/audio/captions, so the Iframe Snippet and HTML Block Fragment export formats produce a dangling `assets/<filename>` reference that 404s once pasted into Rise (`docs/INTERACTIVE-VIDEO.md` "Media-storage and export behavior") — this rule surfaces that pre-existing limitation proactively, recommending Web Package ZIP, rather than leaving the author to discover it only after publishing. |

## Timestamps vs. media length (audit 2026-09-30, section 3)

Chapters, synchronized-transcript rows and Interactive Video markers are checked against the media file's recorded length (`duration` on its media reference; for Interactive Video the editor's live `videoDurationSeconds` wins when present). A timestamp is out of range only when it is **strictly greater** than the length. An unknown length is reported as unverified, never as a pass.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `audio-player-chapter-outside-duration` / `video-frame-chapter-outside-duration` | Warning | A chapter starts after the end of the attached file. Names the row, timestamp and permitted range; does not block export; nothing is rewritten. |
| `audio-player-transcript-segment-outside-duration` / `video-frame-transcript-segment-outside-duration` | Warning | A synchronized-transcript row starts after the end of the attached file. |
| `audio-player-timestamps-unverified` / `video-frame-timestamps-unverified` | Recommendation | Chapters or transcript rows exist but the file's length is unknown (external URL, or an upload whose metadata could not be read). |
| `interactive-video-duration-unknown` | Recommendation | Markers exist but the video's length is unknown (an external URL whose metadata has not loaded). Clears once the preview has measured the video. |

`interactive-video-marker-outside-duration` (above) now also uses an uploaded video's recorded length when the editor has not measured it, so a project checked from QA or export without opening the editor is still verified.

## AT&T Brand compliance rules (Prompt 8)

Enforces AT&T Design Standards across all generated component exports and prevents visual, typographical, or accessibility regressions.

| Rule ID | Severity | Trigger |
| --- | --- | --- |
| `brand-color-literal` | Blocking | Custom color overrides or config fields contain color hexes or color literals outside the official `att-tokens.css` design system palette. |
| `brand-font-family` | Blocking | Learner-facing copy is configured or styled with a font family other than AT&T Aleck (`var(--att-font-sans)`, `ATT Aleck Sans`, etc.). |
| `brand-font-size-floor` | Blocking | Learner-facing body copy or prose font size is configured below the 16px (`1rem`) brand floor. |
| `brand-icon-source` | Blocking | Text or header fields contain emoji characters or unapproved unicode glyphs instead of official AT&T SVG functional icons. |
| `brand-contrast-ratio` | Warning | Text/surface contrast ratio falls below WCAG AA thresholds, specifically flagging AT&T Blue (`#009FDB`) used for text under 24px on light surfaces. |
| `brand-focus-visible` | Warning | Interactive elements remove `:focus-visible` styling (`outline: none` without replacement) instead of the required 3px Cobalt (`#00388F`) focus ring. |

## P06: the first production rule set — request-by-request disposition

P06 asked for ten specific checks. Several already existed from earlier work; this is the full accounting, with rationale, of what each one actually became:

| # | Requested | Disposition | Severity |
| - | --- | --- | --- |
| 1 | Missing required content | Already existed (`general-required-field`, `general-empty-component`) — no change. | Blocking |
| 2 | Blank/duplicate item titles | Blank already Blocking via #1. Duplicate *title+content* already `general-duplicate-items`. Added `general-duplicate-titles` for duplicate title **alone** (different content), which nothing previously caught. | Warning (not Blocking — the output still renders correctly, just ambiguously) |
| 3 | Component-specific min/max item counts | Minimum already `general-empty-component` (Blocking). Added `general-item-count-exceeded` for `maxItems` — a real gap: the UI prevents authoring past it, but an imported/hand-edited project could exceed it, and the generator silently drops the extra items. | Warning, not Blocking — the rendered output is still correct, just incomplete relative to what was authored |
| 4 | Missing alt text for meaningful images + invalid decorative config | **Explicitly kept at Warning, not escalated to Blocking as the prompt literally requested** — confirmed with the user first, given how disruptive suddenly blocking export on every existing under-alt-texted component would be. No code change. | Warning (unchanged) |
| 5 | Heading-level/outline concern | New: `general-heading-level-outline`, `blockHeadingLevel === 'h1'`. | Warning |
| 6 | Excessive text length | Already existed and already at the requested severity (`general-excessive-length`) — no change. | Recommendation |
| 7 | Non-descriptive link text | New: `general-non-descriptive-link-text`, scoped to `button-list` (the one schema where a bare label is the only link-identifying text with no surrounding context). See "Rules requiring manual judgment" below. | Warning |
| 8 | Autoplay audio/video | **Does not apply to this project** — there is no autoplay attribute or config field anywhere in the codebase; audio/video only ever plays in response to an explicit user click (`components/audio-player.js`, `components/video-frame.js`). Nothing was added, since there is nothing to check. | — |
| 9 | External URLs shown safely | Media external-URL fields already covered (`media-external-asset-dependency`, `media-insecure-http-url`). Added `general-external-url-destination` for *non*-media `url`-type fields, which had zero advisory before. | Warning |
| 10 | Completion + incompatible export | Already existed, reusing the P02 central rule exactly as asked (`general-completion-export-incompatible`) — no change. | Blocking |

### Rules requiring manual judgment

- **`general-non-descriptive-link-text`** is a deliberately conservative, hardcoded phrase list (`NON_DESCRIPTIVE_LINK_PHRASES`, `js/validation.js`) — not a full natural-language judgment of whether a label is "descriptive enough." A label outside that list is never flagged even if it's genuinely vague, and the list itself is a documented editorial choice, not derived from a spec (Implementation note 2: avoid false certainty in heuristic checks).
- **`general-heading-level-outline`** only checks for `h1` specifically. It cannot detect a *skipped* level (e.g. jumping from h2 straight to h4 within a component's own content) — this project's schemas don't expose enough of a component's internal heading structure to check that generally, and inventing a heuristic for it risked more false positives than the signal was worth.
- **`general-external-url-destination`** is intentionally always-on advisory, not a defect detector — it cannot know whether a given external URL is the *right* one, only that it's external and worth a second look before publishing.
- **`interactive-video-non-direct-video-url`** (Phase 7) checks a short, explicit list of known video-hosting hostnames (YouTube, Vimeo, and their common variants) rather than attempting to detect "is this a direct video file" generally, which isn't derivable from a URL string alone. A URL from a hosting service not on the list still passes silently — the list can be extended if a real, recurring authoring mistake surfaces one.
- **`general-clipping-risk`/`general-mobile-overflow`** (P07) are the two most heuristic rules in the whole catalog. They measure this app's own hidden-iframe rendering, not Rise's actual sandbox — a genuinely different browser, host-page CSS, zoom level, or Rise's own future changes to how it frames a code block can all produce a different real-world result. Their message text says so explicitly every time, pass or fail. If the measurement itself can't run (see "Browser limitations" below), the rule reports a manual-check Recommendation rather than silently passing — Implementation note 5 ("if reliable automated detection is not feasible... add a manual-check item instead of a false pass").

### Browser limitations (P07 Requirement 7)

- **`measureRenderedDimensions()` needs a real browser layout engine.** jsdom (used by this project's other DOM-touching unit tests, e.g. `tests/unit/export.test.js`) has no layout engine — `scrollHeight`/`scrollWidth`/`clientWidth` are always `0` there, so a jsdom-based test of the actual measurement would be meaningless. `checkClippingRisk`/`checkMobileOverflow` in `js/validation.js` are unit-tested with synthetic, already-resolved `domMeasurement` values instead (exactly the shape a real measurement produces); the real hidden-iframe + `postMessage` plumbing is verified only in `tests/e2e/preflight.spec.js`, against actual Chromium.
- **Font/image loading can shift the measured height between runs.** The compiled document's brand font is self-hosted/embedded (P04), so it doesn't introduce a font-swap delay — but an author-supplied external image URL (as opposed to an uploaded file) can still load asynchronously after the `load` event this module waits on, in principle changing the final layout height. This is a known, accepted limitation of a synchronous-ish `load`-based measurement, not something this pass attempts to solve (it would require a `ResizeObserver`-based wait-for-stability loop, adding real latency to every Preflight run for a marginal accuracy gain).
- **Not tested against Firefox/WebKit's exact sandboxed-iframe/postMessage timing** — `tests/e2e/preflight.spec.js` runs against Chromium only, consistent with this project's existing Playwright default project setup; the underlying APIs (`iframe.sandbox`, `srcdoc`, `postMessage`) are standard and supported everywhere, but exact timing characteristics weren't independently re-verified per-browser for this feature.

## Testing

- `tests/unit/validation.test.js` — one or more tests per rule ID, both a triggering case and (for the less obvious rules) a non-triggering case, a sanity sweep asserting every component's *default* configuration produces zero blocking issues, and (P05) coverage of the result model (title/explanation/target/fix on every issue shape), the rule registry (`registerValidationRule`/`unregisterValidationRule`/`listRegisteredRuleIds`, `appliesTo` scoping), severity grouping/counts, and `summarizePreflightForAnnouncement`'s no-issue/singular/plural/mixed-severity output. All five Interactive Video rules are the one exception to "lives in this file" — their tests live alongside the rest of that component's own tests in `tests/unit/interactive-video.test.js` instead, since that component already has its own dedicated file (`docs/INTERACTIVE-VIDEO.md` "Testing status"). (P06) Each new rule additionally gets pass/fail/boundary/duplicate/empty cases per Implementation note 5 — e.g. `general-item-count-exceeded`'s boundary case (exactly at `maxItems`, not flagged) and empty case (`general-external-url-destination` with a blank URL field). (P07) `requiredContrastRatio()`'s large-text boundary (23.9px vs 24px, 700 vs 600 weight), the media-size message's real numbers, and `checkClippingRisk`/`checkMobileOverflow`'s pass/fail/boundary/unmeasured cases via synthetic `domMeasurement` values through `runPreflight`.
- `tests/e2e/preflight.spec.js` (P05) — real-browser field targeting: "Go to field"/"Go to item" closes the panel, expands a collapsed item, and focuses the live (not stale) target element, both by mouse and by keyboard; the no-issue state; the concise accessible announcement. (P07) `js/dom-measurement.js` exercised directly against synthetic HTML sized to force each dimension (a tall+wide document, a small document, empty input, an aborted in-flight measurement), plus an integration check that a normal component's real Preflight run reports no clipping/overflow issues and never falls back to the unmeasured/manual-check text.
- `tests/unit/completion.test.js` covers `general-invalid-completion-config`'s interaction with the completion adapter system (`docs/COMPLETION-INTEGRATION.md`) at the compiled-output level.

## Non-goals

- This is not a full accessibility audit. It catches specific, demonstrable defects (missing alt text, insufficient contrast, ambiguous hotspot labels) — it does not replace manual assistive-technology testing (`docs/KNOWN-ISSUES.md` "Accessibility gaps").
- It does not validate against Rise, Moodle, or SCORM-specific constraints — that's `docs/RISE-COMPATIBILITY-MATRIX.md`'s job, a separate concern from "is this component's own content well-formed."
- The excessive-length, duplicate-item, and contrast thresholds are pragmatic heuristics, not derived from a formal spec — they are documented here precisely so they can be tuned in one place if they prove too strict or too lax in practice.

## Measurement is deterministic (audit fix)

`js/dom-measurement.js` previously read dimensions at the iframe `load` event, so the same component could measure differently between runs (once 0px tall, once ~161px overflowing) and hidden content was never measured. It now waits for `load`, web fonts and every image (lazy images are forced eager, with a capped wait), polls until two consecutive readings are identical, opens each collapsed control in turn, and disables the frame's scrollbar so the layout width matches a phone. A reading that never stabilises is reported as *unmeasured* (a manual-check Recommendation), never as a warning or a pass. `tests/e2e/preflight.spec.js` asserts ten repeated measurements are identical and that content hidden behind a collapsed control is measured.

## Course QA uses the same rules

`js/dashboard/course-readiness.js` runs `runPreflight` over every component in a course and maps `blocking`/`warning`/`recommendation` to QA `blocker`/`warning`/`recommendation`. A missing uploaded file is always a QA blocker because the course exporter refuses to build without it. Course QA and the pre-export review report **technical checks** (`passed` / `warnings remain` / `blocked`), **editorial status** (Draft / In Review / Ready) and **export readiness** separately, never as one percentage, and technical checks never read "passed" while a warning exists. Every finding carries the export format it affects. `tests/unit/course-readiness.test.js` pins this.
