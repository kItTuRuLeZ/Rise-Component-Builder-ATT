# Accessibility conformance

This documents what has actually been verified, automated, or is still manual-only for both surfaces this repository ships:

1. **The builder's own authoring interface** (`index.html`, `app.js`, `js/editor.js`, `styles.css`) — used only inside this tool, by whoever is authoring a block.
2. **Every exported component** (`components/*.js` via `js/export-shell.js`/`js/preview.js`) — the actual HTML/CSS/JS a learner interacts with once pasted into Rise, Moodle, or any other host page.

Following the same honesty rule as `docs/COMPLETION-INTEGRATION.md` and `docs/VALIDATION-RULES.md`: **nothing here is claimed as conformant unless it is backed by an automated test or an explicit, named manual check.** Where something is unverified, it says so.

## Target standard

**WCAG 2.2 Level AA**, evaluated against both surfaces above. WCAG 2.2 AA specifically adds several success criteria beyond 2.1 AA — the table below calls out the ones newly checked in this pass (2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size Minimum, 3.2.6 Consistent Help) alongside the established 2.1 AA criteria this repository already addressed.

This is **not** a Rise, Moodle, or SCORM conformance claim — LMS/host-specific behavior is out of scope here and lives in `docs/RISE-COMPATIBILITY-MATRIX.md`, `docs/RISE-TEST-CHECKLIST.md`, and `docs/MOODLE-SCORM-TEST-CHECKLIST.md`.

## Automated coverage

All of the following run in CI via `npm run test:e2e` (Playwright + `@axe-core/playwright`) and `npm run test:unit` (Vitest). None of this is a substitute for manual testing — automated tools (axe included) catch an estimated 30-50% of WCAG failures; see "Known limitations" below.

| File | What it verifies |
| --- | --- |
| `tests/e2e/accessibility.spec.js` | Builder UI: accessible names/labels (axe `button-name`/`label`/`aria-valid-attr*`), one `<main>` landmark + `region` (axe `landmark-one-main`/`region`), color contrast in **both** light and dark mode (axe `color-contrast`, scoped away from the live-preview iframe — see below), 320px reflow (no forced horizontal scroll on the app shell), WCAG 2.2 `target-size` (24×24px minimum) via axe, accordion ARIA state, tabs roles/`aria-selected`/arrow-key roving focus, full-editor Tab traversal doesn't trap, visible focus indicator + `prefers-reduced-motion` honored, missing-alt-text warnings surface in the editor, the theme contrast report, modal focus-trap, and focus-restoration-on-close. |
| `tests/e2e/exported-fixtures.spec.js` | Every exported fixture loads standalone with zero console/page errors, and is keyboard-operable with **no builder app involved** — Accordion (Enter/Space), Flip Cards (Enter/Space), Tabs (arrow keys + `aria-selected`), Multiple Choice (keyboard select + submit), Hotspots (Enter opens, Escape closes), Timeline (Enter selects), Audio Player (Enter/Space toggles `aria-pressed`), Video Player (Enter/Space toggles play, arrow keys move the scrub bar), Image Gallery lightbox (Enter opens, arrow keys navigate between images, Escape closes and restores focus to the trigger). Also verifies text stays visible via the sans-serif fallback when Google Fonts is blocked. |
| `tests/e2e/completion.spec.js` | Completion adapter behavior — not accessibility-specific, but its `announce()`/`aria-live` status region is exercised incidentally. |
| `tests/unit/validation.test.js` | `general-missing-accessible-name`, `general-missing-alt-text`, `general-insufficient-contrast`, and the hotspots `keyboard-accessibility` rule (duplicate hotspot labels) — author-time warnings, not the shipped output's own conformance, but they prevent an inaccessible component from being authored in the first place. |

### Why color-contrast is scoped away from the live-preview iframe

The axe scans in `accessibility.spec.js` `.exclude('#live-preview-iframe')`. The iframe renders the **author's own chosen theme colors** for the exported component — that is a different, separately-covered concern (`js/validation.js`'s `general-insufficient-contrast` rule, `js/themes.js#contrastRatio`, and the in-app "WCAG 2.2 AA Contrast Review" theme report), not a defect in this repository's own code. Scanning it here would conflate "the builder's chrome has a bug" with "an author picked bad colors."

## What was fixed in this pass

Running the tests above against the *pre-existing* implementation surfaced four genuine, previously-unverified defects, all fixed and now regression-tested:

1. **Insufficient color contrast** in the builder's own chrome: `--text-muted` (`#6B7280` on `#F3F4F6`, 4.39:1), `.avatar` (`#059669` on `#ECFDF5`, 3.57:1), `.badge-accent` ("Experimental" label, white on `#F59E0B`, 2.14:1), `.rise-badge` (`#64748B` on `#E2E8F0`, 3.86:1), and — dark mode only — `.editor-tab.active`/`.export-tab.active`/`.btn-text`/`.category-pill` all using `--primary` (`#2563EB`) as text color against the dark panel background (2.83–3.39:1). Fixed by darkening `--text-muted`/`.avatar`/`.rise-badge` foreground colors, giving `.badge-accent` its own darker background, and introducing a `--primary-text` token (`js/`-independent, `styles.css` only) that resolves to a lighter blue in dark mode specifically for text-on-panel usage, without touching `--primary` itself (which is still used correctly as a *background* for filled buttons, where a lighter shade would have broken *their* white-text contrast the other way).
2. **320px reflow failure** (WCAG 1.4.10): the toolbar's three control groups (brand, project actions, utilities) didn't fit in a 320px viewport even with labels already hidden, forcing the whole page to scroll horizontally. Fixed with a `max-width: 480px` rule that lets the toolbar wrap instead of overflow, and hides the two purely decorative elements (the "ID" avatar placeholder, the version-tag subtitle) that had no functional purpose at that width.
3. **Two undersized touch targets** (WCAG 2.2 2.5.8): `.back-link` ("Back to Templates") and `.item-collapse-btn` (each item card's header) were 18px tall. Fixed with `min-height: 24px`.
4. **Missing keyboard support**: the Image Gallery lightbox had no Arrow-key next/prev (only Escape); Hotspot tooltips stayed visibly open after Tab moved focus away from their pin. Both fixed — see the per-component table below.

## Per-component accessibility status (exported output)

| Component | Keyboard | Notes |
| --- | --- | --- |
| Accordion | ✅ Automated | Native `<button>` headers, Enter/Space native, `aria-expanded` verified. |
| Tabs | ✅ Automated | `role="tablist"`/`"tab"`, roving `tabindex`, arrow keys, `aria-selected` verified. |
| Flip Cards | ✅ Automated | `role="button"` + `keydown` handler, Enter/Space verified. |
| Hotspots | ✅ Automated | Native `<button>` pins (Tab order + Enter/Space free), Escape closes, and — new in this pass — a pin's tooltip now closes on `blur` so it doesn't stay visibly open once focus moves to an unrelated pin. Pins are independent buttons, not a single composite widget, so roving tabindex/arrow-key navigation between them is not required by WAI-ARIA APG and was not added. |
| Multiple Choice / Multiple Select | ✅ Automated | `role="radiogroup"`/`"radio"`, roving tabindex, arrow keys, keyboard submit verified. |
| Sorting Activity | ✅ Automated (see note) | Despite the name and its decorative "grab" cursor/handle icon, the shipped interaction is entirely button-based ("Move to *Category*"), not real drag-and-drop — there is no `dragstart`/`drop` handler in `components/sorting-activity.js`. It is fully keyboard-operable natively and has no WCAG 2.5.7 (Dragging Movements) exposure, since there is no dragging to begin with. The grab-cursor styling is a cosmetic mismatch with the actual interaction model, not an accessibility defect — left as-is; flagged here for visibility rather than fixed, since it's outside this pass's scope. |
| Vertical Timeline | ✅ Automated | `role="listitem" tabindex="0" aria-pressed`, with an existing Enter/Space `keydown` handler (confirmed present and correct — no fix was needed here despite this being flagged for investigation during scoping). |
| Horizontal Timeline | ✅ Automated | Full `role="tablist"`/`"tab"` pattern with roving tabindex, Arrow/Home/End — the most complete keyboard implementation of any component. |
| Interactive Learning Audio (`audio-player`) | ✅ Automated, own dedicated axe scans | Native `<button>` throughout (play/Replay/Forward/speed/mute/chapter markers/chapter list/transcript toggle/segments/resume); scrub bar is `role="slider" tabindex="0"` with Arrow/Home/End. First component with its own dedicated axe-core scans (`tests/e2e/audio-player.spec.js`, `docs/AUDIO-PLAYER.md` "Testing status") beyond this shared fixture list — found and fixed a real `nested-interactive` bug (chapter markers were children of the `role="slider"` element; now a sibling overlay). One documented, considered `target-size` trade-off remains — see `docs/AUDIO-PLAYER.md` "Accessibility." |
| Video Player (`video-frame`) | ✅ Automated, own dedicated axe scans | Same navigation/scrub/chapters/transcript/resume/takeaways pattern as Interactive Learning Audio, ported onto `<video>` (`tests/e2e/video-frame.spec.js`) — Replay/Forward/speed/mute/chapter markers/chapter list/transcript toggle/segments/resume are all native `<button>`s, scrub bar is `role="slider" tabindex="0"` with Arrow/Home/End, chapter markers are a sibling overlay (not nested inside the slider) for the same `nested-interactive` reason as audio-player. The pre-existing poster, captions track, and audio-description `<details>` disclosure are unchanged. Same documented `target-size` trade-off as `docs/AUDIO-PLAYER.md` "Accessibility" — the chapter list is the fully-conformant alternative path to the small scrub-bar markers. Chapters here are navigation-only (no branching/quiz-gating); that richer authoring path remains `interactive-video`'s alone. |
| Image Gallery | ✅ Automated | Native `<button>` cards; lightbox is `role="dialog"`, Escape closes and restores focus — and, new in this pass, ArrowLeft/ArrowRight now navigate between images without closing the lightbox. |
| Fill in the Blank, Process Flow, Branching Scenario, Profile Cards, Information Grid, Comparison Cards, Quick Link Buttons, Secondary Menu Drawer | ⚠️ Not covered by a dedicated keyboard test in this pass | These use native `<button>`/`<a>`/`<input>` elements throughout (no custom composite widgets), so native keyboard support is expected, but — unlike the components above — no automated test asserts this explicitly. Manual verification recommended before relying on this for a specific one of these components. |
| AI Scenario Generator, AI Quiz Generator | ⚠️ Experimental status (`docs/RISE-COMPATIBILITY-MATRIX.md`) | Placeholder/simulated generation; not evaluated here. |

Every component (regardless of row above) inherits, via `js/export-shell.js`, the same shared baseline: `prefers-reduced-motion` support, `forced-colors` support, an `aria-live` interaction-status region, and the author-configurable heading level described below.

## Structural fixes in this pass

- **Embedded component headline is always an `<h2>`.** Previously every export hardcoded `<h1 class="block-headline">` for the wrapping headline — forcing a *second* `<h1>` into a Rise lesson page that already has its own. It is now always `<h2>`. An author-selectable Heading Level (h1–h6) existed briefly and was removed after UAT (Oct 2026): it changed only the HTML tag, never the look, so authors read it as broken.
- **Landmarks**: the editor panel and live-preview panel now have `aria-label`s ("Component editor" / "Live preview") distinct from the existing sidebar/nav/main landmarks, and the editor's `.group-title` section headers (Header Details, Interactive Items, Visual Branding, etc.) are now real `<h3>` elements under the screen's `<h2>`, instead of unstructured `<div>`s — so a screen-reader user can navigate the editor form by heading, not just by tab order.
- **Missing label**: the sidebar search input (`#search-components`) had a placeholder only; it now has `aria-label="Search components"`.

## Known limitations (honest, not fixed here)

- **No automated screen-reader testing.** Axe and Playwright verify DOM structure, ARIA attributes, and keyboard behavior — they do not verify what NVDA, JAWS, or VoiceOver actually announce. Manual testing with at least one Windows screen reader (NVDA/JAWS) and VoiceOver (macOS/iOS) is required before any accessibility conformance claim can be made to an external party.
- **No automated 400% text-zoom test.** Only a 320px *viewport-width* reflow test exists (`tests/e2e/accessibility.spec.js`). WCAG 1.4.4 (Resize Text, AA) and the reflow-at-400%-zoom scenario specifically (as opposed to a narrow *device* viewport) have not been separately verified.
- **No automated 2.4.11 Focus Not Obscured check.** Nothing currently asserts that a focused element is never hidden behind a sticky header/toolbar; not exercised by any test here.
- **No automated 3.2.6 Consistent Help check.** Not applicable in the traditional sense (no persistent "help" mechanism exists across pages to be consistent or inconsistent), but not formally assessed either.
- **Six components have no dedicated keyboard test** (Fill in the Blank, Process Flow, Branching Scenario, Profile Cards, Information Grid, Comparison Cards, Quick Link Buttons, Secondary Menu Drawer) — see the table above.
- **`target-size` (axe) is a heuristic, not a full WCAG 2.5.8 audit.** It currently passes for both surfaces at the specific viewport/state tested, but 2.5.8 has additional exceptions and edge cases (inline-text, essential exceptions, equivalent-target availability) that a single automated rule cannot fully resolve.
- **Rise-specific assistive-technology behavior remains entirely manual** — see `docs/RISE-TEST-CHECKLIST.md`. A component passing every check in this document is not the same as it having been verified inside an actual Rise lesson with a screen reader. Moodle/SCORM assistive-technology testing is out of scope for this project (`docs/RISE-COMPATIBILITY-MATRIX.md` "Scope"); `docs/MOODLE-SCORM-TEST-CHECKLIST.md` is kept for reference only.
- **Captions/transcripts are author-supplied, not generated.** The Video Player's `<track kind="captions">` and both media components' transcript fields only produce accessible output if the author actually provides that content — there is no automatic captioning or transcription.

## Manual tests required before shipping to an external audience

1. NVDA + Chrome/Edge, JAWS + Chrome, VoiceOver + Safari — full pass through: catalog browse → component select → edit every field → export → open the exported file standalone.
2. 400% browser zoom (not just narrow viewport) on both the builder and an exported component, checking for lost content or functionality (WCAG 1.4.4 / 1.4.10).
3. `forced-colors` mode (Windows High Contrast) — visually verify both surfaces, not just that the CSS rule exists.
4. Real touch-device target-size and gesture check, particularly for the Image Gallery lightbox's arrow-key navigation (no touch equivalent currently exists for "next/previous image" — only Escape-to-close and tap-to-open have touch equivalents).
5. The six components listed under "Known limitations" — manual keyboard-only pass for each.
6. Rise-hosted screen-reader passes per `docs/RISE-TEST-CHECKLIST.md`. (Moodle-hosted passes are out of scope for this project — see "Known limitations" above.)
