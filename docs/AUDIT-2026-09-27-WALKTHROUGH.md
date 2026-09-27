# 27 September 2026 functional audit — implementation walkthrough (AT&T edition)

Source document: `ATT Design System/Claude Promts/Rise-Builder-ATT-PMI-Next-Fixes-Claude-Code.md`.
This records what was actually done in this repo against that document's four sections, with root
causes, the exact fix, the files touched, and the test evidence for each — so a claim here can be
checked against a commit and a test run, not just taken on faith. The equivalent PMI-edition work
is recorded separately in the PMI repo's own `docs/AUDIT-2026-09-27-WALKTHROUGH.md`; the two are
cross-referenced below wherever a fix was shared or ported.

**Read this alongside the final verdict at the bottom before treating any of it as a green light.**
Nothing here was checked against a real Rise 360 export — see "The Rise compatibility gate."

## Section 1 — Every starter block must export

**Symptom (from the audit):** Horizontal Timeline and Image Gallery failed to export from an
otherwise-untouched starter configuration; Comparison Slider was flagged for a blank title it
didn't have.

**Root cause, Horizontal Timeline / Image Gallery:** both components render a lightbox `<img>`
with a hardcoded empty `src=""` attribute in their markup, with the real image URL set later by
JS only when the lightbox is opened (`components/horizontal-timeline.js`, `components/image-gallery.js`).
The course-level exporter's broken-media-reference gate (`js/dashboard/project-export.js`'s
`buildCourseProjectZip`) scans compiled HTML for exactly this pattern — an empty `src=""` on any
`<img|source|video|audio>` — because that pattern is also what a silently-dropped `blob:` media
reference looks like after compilation. The lightbox markup was a false positive: a legitimate,
intentionally-empty placeholder tripping a check meant to catch a real defect.

**Fix:** removed the `src` attribute entirely from both lightbox `<img>` elements (an element with
no `src` never matches the empty-`src` pattern; the JS that sets it on open is unaffected).
- [components/horizontal-timeline.js](../components/horizontal-timeline.js)
- [components/image-gallery.js](../components/image-gallery.js)

**Root cause, Comparison Slider:** the QA blank-title check (`js/dashboard/project-qa.js`) used a
hardcoded list of field names (`item.title || item.label || item.text || ...`) to find each item's
identifying text. Comparison Slider's item schema doesn't use any of those field ids, so every item
read as blank regardless of its actual content.

**Fix:** the check now asks the component's own schema which field is the item's primary
identifier — `primaryField(schema)`, a small generalization of the schema engine's existing
`primaryFieldValue` (exported from `js/validation.js`) — instead of guessing from a fixed name
list. This is the same resolution logic the schema engine already uses elsewhere for duplicate-item
detection, so the QA check and the schema engine can no longer disagree about which field is a
title.
- [js/validation.js](../js/validation.js) — exported `primaryField(schema)`
- [js/dashboard/project-qa.js](../js/dashboard/project-qa.js) — blank-title check rewritten to use it

**Tests:** `tests/unit/all-starter-exports.test.js` (new) builds a course from all 26
`COMPONENT_REGISTRY` entries' untouched `getDefaultConfig()`, exports it through the real
`buildCourseProjectZip`, and asserts 26 entry pages, a valid manifest, and no empty-`src` markup
anywhere in the output; it separately exercises the Comparison Slider false-positive fix directly
against `auditCourseProject`. 5 tests; confirmed 4/5 fail when the fixes are reverted (the 5th,
covering an unrelated starter, was already passing).

**Commit:** `c2b1ba3` — *fix(export): all 26 starter blocks export in a course ZIP; Comparison
Slider's blank-title false positive*.

## Section 2 — Preflight, export review, and packaging must agree

**Investigation:** the architecture that connects the editor's own Preflight panel
(`js/validation.js#runPreflight`), the dashboard's readiness heuristics
(`js/dashboard/project-qa.js#auditCourseProject`, merged via
`js/dashboard/course-readiness.js#mergeReadiness`/`getCourseReadiness`), and the final exporter's
hard block (`CourseExportError` in `js/dashboard/project-export.js`) was already correctly aligned
once Section 1's fixes landed: `checkBrokenMediaReferences` in `js/validation.js` checks the real
media store (not a heuristic), `toReadinessIssue` already force-upgrades certain findings to
blockers rather than silently allowing a "Draft" status through, and every `CourseExportError`
already names the specific component and reason rather than a generic failure. No claim of "100%
Compliant" or similar exists anywhere in this pipeline's UI strings.

**The one genuine defect found:** the dashboard's "Overall Readiness" badge appended a raw
`(${qa.overallScore}%)` percentage next to the status text. `course-readiness.js` already has
explicit design intent (in its own comments) to never collapse readiness to a single number,
because a course can be simultaneously "no blockers" and "several warnings" in a way one percentage
hides — the badge's own percentage suffix undermined that intent.

**Fix:** removed the percentage suffix; the badge now shows `qa.overallStatus` text only (e.g.
"Ready to Export", "Ready with warnings").
- [js/dashboard/project-overview.js](../js/dashboard/project-overview.js)

**Tests:** `tests/unit/readiness-no-percentage.test.js` (new) renders `ProjectOverviewView` for a
Ready component and asserts the inspector text contains "Ready to Export" but no `\(\d+%\)`
pattern anywhere. Confirmed it fails when the fix is reverted.

**Commit:** `c3f9d48` — *fix(qa): the outline's readiness badge no longer shows a percentage*.

## Section 3 — AT&T and PMI must not share local data

**Root cause:** both editions are deployed from `kittu-rulz.github.io` under different **paths**
(`/Rise-Component-Builder-ATT/`, `/Rise-Component-Builder-PMI/`) but the same **origin** — and
`localStorage` / IndexedDB are scoped per-origin, not per-path. Every unnamespaced storage key and
the shared media IndexedDB database were literally readable and writable by both deployed apps in
one browser profile: opening one edition, then the other, in the same browser could surface the
other edition's projects, drafts, favorites, and uploaded media as if they were your own.

**Design constraints (from the audit, all satisfied):**
- Never silently delete or mutate anything under a legacy (un-namespaced) key.
- Claim a legacy record as this edition's own only with real confidence — never a blanket
  "everything unclaimed becomes mine."
- Give an explicit, visible import path for records this edition can't confidently attribute.
- Keep this testable in one browser profile, including two editions' projects sharing a filename.

**Fix:**
- `js/client-isolation.js` (new): `EDITION = 'ATT'`; `CLIENT_LABEL_ALIASES = ['at&t', 'att']`
  (case-insensitive matching against a project's own `clientLabel`); `namespacedKey(base)`
  rewrites `rise-builder-*` keys to `rise-builder-att-*`.
- `js/storage.js`: all 9 persisted keys now namespaced. A one-time, idempotent
  `migrateLegacyStorage()` copies (never deletes) legacy records this edition can confidently claim
  — by `clientLabel` alias match — into the namespaced keys. It runs at the top of every `load*`
  function rather than at module-import time, specifically so it runs against real storage instead
  of whatever is initialized before a test's fixtures are seeded (an earlier top-level-call version
  was untestable for exactly this reason). `getUnclaimedLegacyProjects()` /
  `importLegacyProjectById()` give an explicit, user-initiated path for projects with a blank or
  unrecognized `clientLabel` — these are never auto-claimed.
- `js/media-storage.js`: the media IndexedDB database is now
  `rise-component-builder-att-media` (previously shared). A marker-guarded
  `migrateLegacyMediaForClaimedProjects()` copies only the media actually referenced by claimed
  projects from the legacy database, using independent raw `indexedDB.open()` connections rather
  than the store's own `open()`/`transact()` wrapper — reusing the wrapper here would deadlock,
  since the migration hook's own reads/writes would recursively await the very `open()` call that's
  running it.
- `js/dashboard/dashboard-view.js` + `design/dashboard.css`: a `dashboard-legacy-banner` lists
  every unclaimed legacy project with its name and (if present) client label, with an explicit
  "Import into this edition" action per project.
- `tests/fixtures/index.js`: the shared fake IndexedDB test fixture previously ignored its `name`
  argument and returned one shared in-memory store regardless of which database was opened, which
  would have made a migration-between-two-databases test pass even if the migration silently wrote
  to the wrong database. Rewritten to key by database name.

**Deliberately not closed:** the pre-existing schema-migration backup key
`rise-builder-projects-backup-v2` (written by `js/project-migration.js`, unrelated to this fix)
remains a shared, un-namespaced key. Noted here rather than silently left out of the inventory —
it is a backup copy of already-migrated data, not a source of the sharing problem this section
targets, but it is still, today, one un-namespaced key.

**Tests:** existing tests that hardcoded the old shared key literals were fixed to read the real
namespaced key from `js/storage.js#KEYS` (`tests/unit/device-preview.test.js`,
`tests/e2e/persistence-prompts.spec.js`) or updated to the new literal with an explanatory comment
where a dynamic import isn't possible (`tests/e2e/catalog-classification.spec.js`, which seeds via
`page.addInitScript`, which runs before the page's own JS). Two new end-to-end tests were added to
`tests/e2e/legacy-projects.spec.js` covering the ambiguous-project banner and the explicit-import
flow. **279/280** Playwright Chromium end-to-end tests passed (1 pre-existing unrelated skip);
**vitest unit suite passed in full**; `tsc --noEmit` clean; ESLint 0 errors.

**Commit:** `a570827` — *fix(isolation): AT&T and PMI no longer share localStorage or IndexedDB*.

## Section 4 — Post-Publish classification and PMI labels

This section's PMI-specific items (the `Aqua (#4F17A8)` mislabel) apply to the PMI edition only —
see the PMI repo's walkthrough for that fix. What follows is what was checked and changed here.

**Checked, already correct, no change made:**
- Builder-course ZIP rejection (`js/post-publish/package-detector.js`'s `looksLikeBuilderCourse`)
  was already intact and specific, with an explanation naming what was uploaded and what's
  expected instead.
- A generic ZIP (`kind: 'generic-web'`) was already never presented as a confirmed Rise export:
  `js/post-publish/workflow-shell.js` shows a distinct "⚠️ Accepted as a generic web page" heading
  (vs. "✓ Package detected" for a real match), and the detector's own label already reads "Generic
  web page (not identified as a Rise export)".
- AT&T's own brand-color pickers (`js/rich-text-editor.js`'s `ATT_BRAND_COLORS`, and the Post-Publish
  launcher theme dropdown in `js/post-publish/editors/settings-editor.js`) were checked against
  what the exported launcher CSS actually renders (`js/post-publish/runtime/rcb-ppt-styles.css`) —
  every label's hex is distinct and correctly named on both sides. No AT&T equivalent of the PMI
  mislabeling exists.

**Root cause found and fixed — SCORM 1.2 vs 2004 detection:** `detectRisePackage`
(`js/post-publish/package-detector.js`) treated the mere presence of the string
`adlcp:scormType` in `imsmanifest.xml` as a SCORM 2004 signal. That attribute marks a resource as
a "sco" and belongs to the Content Packaging extension **both** SCORM versions share — it appears
in nearly every valid manifest of either version, so its presence alone cannot distinguish them.
In practice this would have misclassified most real SCORM 1.2 packages (any with a normal SCO
resource) as 2004.

**Fix:** replaced that condition with two signals that are genuinely exclusive to 2004: its Content
Aggregation Model version string ("CAM 1.3", vs. 1.2's "CAM 1.2" — kept from before), and its
Simple Sequencing & Navigation extension namespaces (`adlseq`/`adlnav`/`imsss`), a capability that
does not exist in SCORM 1.2 at all. The literal substring `"2004"` is also kept, unchanged.
- [js/post-publish/package-detector.js](../js/post-publish/package-detector.js)

**Tests:** `tests/unit/post-publish-contract.test.js` — the pre-existing generic SCORM fixture
(which happens to include `adlcp:scormType`) now asserts it classifies as `scorm12`, not
`scorm2004`; a new test builds representative 1.2 and 2004 manifest fragments (a schema-version
string, `CAM 1.3`, and Simple Sequencing namespaces) and asserts each classifies correctly.
Confirmed both new assertions fail against the pre-fix source. Full unit suite: **1936/1936**
passed; `tsc --noEmit` clean; ESLint 0 errors.

**Commit:** `39714ca` — *fix(post-publish): SCORM 1.2 vs 2004 detection no longer keys off a
signal both versions share*. The identical defect and fix were ported to the PMI edition
(`js/post-publish/package-detector.js` is shared, brand-agnostic logic between editions).

## Verification performed beyond unit/e2e tests

- Desktop smoke check of the dashboard (hero panel, AT&T wordmark, animated gradient, Globe
  watermark) at default viewport: renders correctly, no console errors.
- Mobile-width (375px) smoke check of the dashboard's own new surfaces from this audit
  (`.dashboard-hero-section`, `.hero-att-logo`, `.hero-att-globe-pattern`, and the legacy-project
  banner): none overflow the viewport; the Globe watermark correctly disappears below 1200px per
  its own CSS rule.
- Live end-to-end check of the legacy-project import flow: seeded an ambiguous
  (`clientLabel: ''`) legacy project via `localStorage`, confirmed the banner rendered with the
  project's name and "No client label", clicked "Import into this edition", confirmed the success
  toast and that the project then appeared as a normal, directly-openable project card.
- **Not in scope:** the authoring tool's own chrome (dashboard, toolbar, editor) targets desktop
  use and is not required to be mobile-responsive — only the *exported components themselves*
  (what an end learner sees inside Rise/an LMS) need to work across device sizes, and that
  responsiveness is already covered by the existing `tests/e2e/preview-device-modes.spec.js` suite
  per component.

## The Rise compatibility gate

**No real Rise 360 export was available to this audit or this implementation pass.** Every export-
and package-detection fix above (Sections 1 and 4) was verified against:
- Synthetic fixtures built by this project's own test helpers (`createZip`, hand-written
  `imsmanifest.xml` fragments, the starter/default config for all 26 components).
- The existing, pre-established honesty disclosures already in this codebase
  (`js/post-publish/package-detector.js`'s own file-level comment: "Detection is by file structure
  only... has not been verified against a live Rise export in this repository"; `docs/RISE-COMPATIBILITY-MATRIX.md`'s
  four-tier "Confirmed vs. Preview" framework).

This is **not** the same evidence as running the fixed code against a real Rise-published Web or
SCORM export, or a real Rise-generated `imsmanifest.xml`. The SCORM 1.2/2004 fix in particular
replaces one *unverified-against-real-files* heuristic with another that is more defensible on
spec-reading grounds but is **still unverified against a real Rise-generated manifest of either
version**. Treat this fix as "more likely correct," not "confirmed correct," until it's checked
against real files.

## Final verdict

**Verified fixes** (root-caused, fixed, and covered by a test that demonstrably fails on the
pre-fix code, plus a full green run of the existing suite):
- Section 1: Horizontal Timeline / Image Gallery export failures; Comparison Slider blank-title
  false positive.
- Section 2: readiness badge percentage removal.
- Section 3: full localStorage/IndexedDB isolation between editions, with non-destructive
  migration and an explicit ambiguous-project import path.
- Section 4: SCORM 1.2/2004 detection signal correction.

**Investigated and found already correct** (no code change, but explicitly checked against the
audit's specific concern, not assumed): Section 2's preflight/export/QA alignment architecture;
Section 4's builder-ZIP rejection and generic-ZIP labeling; AT&T's own brand-color pickers.

**Incomplete / explicitly out of this pass's scope:**
- No independent accessibility audit (screen reader, keyboard-only pass) was run specifically for
  this audit's changes beyond what the existing Playwright a11y suites (axe-core, focus-order
  tests) already cover for the touched components.
- The authoring tool's own UI was not audited for mobile responsiveness, per explicit scope
  clarification — it targets desktop only.

**Requires a genuine Rise export to actually close** (currently resting on synthetic-fixture
evidence only, per "The Rise compatibility gate" above):
- Whether a real Rise Web export is correctly identified as `kind: 'rise-web'` by
  `detectRisePackage`'s structural heuristics.
- Whether a real Rise-generated SCORM 1.2 manifest and a real SCORM 2004 manifest are each
  classified correctly by the corrected heuristic.
- Whether the 26-starter-block export fix (Section 1) produces a ZIP that, once actually published
  through Rise's own re-import/hosting path (not just unzipped and inspected locally), behaves
  identically to what the local test asserts.

This is a 4-of-4-sections-addressed implementation pass with genuine before/after regression
evidence for every code change, not a 10/10 or "fully verified" claim — the items in the section
directly above remain open until checked against real Rise output.
