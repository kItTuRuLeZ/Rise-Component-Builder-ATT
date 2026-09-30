# Storyboard `.docx` importer — data model inspection and mapping plan

Written before implementation, per the task's own "first inspect and summarize" instruction.
Feature branch: `feature/storyboard-docx-import`. Source spec:
`ATT Design System/../Claude Promts/Claude_Code_Rise_Storyboard_Importer.md` (repo-external at
`D:\projects\Rise Component Builder\Claude Promts\`), fixture:
`D:\projects\Rise Component Builder\SB Template\Rise_Storyboard_Import_Template_v1.docx`.

## Docs staleness note

`docs/ARCHITECTURE.md`, `docs/PROJECT.md`, and `docs/KNOWN-ISSUES.md` describe an **earlier**
version of this app: a single-project editor with `schemaVersion: 2` and no course/section
model, no dashboard, no client-isolation layer, no `js/dom-measurement.js`, none of
`js/dashboard/*.js`. The app has since grown a multi-project dashboard, `js/project-schema.js`
(`schemaVersion: 3`, sections + components), Post-Publish tools, and edition-isolated storage —
none of that is reflected in the canonical docs. This plan is based on **direct inspection of the
current code**, not the (stale) docs. Flagging this as a documentation-debt finding, not something
this task needs to fix.

## Current project data model (the real one, `js/project-schema.js`)

```
Project (schemaVersion: 3)
├── clientLabel: 'AT&T' | 'PMI'
├── sectionOrder: string[]                    — section ids, in course order
├── sections: { [sectionId]: Section }
│     Section { id, name, description, collapsed, componentOrder: string[] }
├── unsectionedComponentOrder: string[]        — component ids not in any section
├── components: { [componentId]: ComponentInstance }
│     ComponentInstance {
│       id, name, type,        ← `type` is a componentId, e.g. 'accordion'
│       config: {...},         ← the component's own schema-shaped config
│       styleOverrides, mediaRefs, qa, status: 'draft'|'in_review'|'ready',
│       createdAt, updatedAt
│     }
├── theme, componentOverrides, uiTheme, settings
└── projectQa: { overallStatus, lastAuditedAt, notes }
```

`createComponentInstance()` (the one place components are constructed) already normalizes every
field with a safe default when absent — e.g. `qa: isObject(qa) ? clone(qa) : { status: 'untested', notes: '' }`.
**This is the key finding for the mixed-row-kind requirement**: adding one more optional field the
same way (`kind: 'builder' | 'rise'`, defaulting to `'builder'`) needs **no `schemaVersion` bump
and no migration script**. Every existing v3 project already round-trips through
`createComponentInstance({...compData, id: compId})` on load (`buildProjectSchemaV3`) — an object
missing `kind` simply gets the default. This is materially simpler than the spec anticipated
("if the current schema cannot store mixed row kinds, add a backward-compatible migration") —
there's nothing to migrate; it's a pure additive field with a safe default, the same pattern every
other field in this constructor already uses.

**Design decision:** RISE rows are entries in the *same* `components` map and the *same*
`componentOrder`/`unsectionedComponentOrder` arrays as BUILDER rows — not a separate parallel
structure. This is deliberate: `componentOrder` already *is* "the ordered list of blocks in a
section," which is exactly what a mixed RISE/BUILDER outline needs; a parallel `riseRows` map
would force every piece of code that walks course order (outline rendering, QA, course-ZIP
export, the future build-sheet export) to merge two data sources instead of filtering one.

Proposed shape for a RISE-kind entry (reusing `createComponentInstance`'s existing fields, no new
top-level object type):
```
{
  id, name: <block title>, type: <Rise block type, e.g. "Text">, kind: 'rise',
  config: { blockId: 'S01-B01', notes: '<build note>' },
  status: 'draft' (unused for rise rows), qa: {} (unused for rise rows),
  createdAt, updatedAt
}
```
`kind: 'rise'` is the single flag every consumer (QA, course-ZIP export, the Preflight engine,
the compiler) needs to check to skip a row — see "Where RISE rows must be excluded" below.

## The four target components' real schemas (`js/editor-schemas.js`)

Every component also has the same **shared, non-schema-driven header fields**
(`blockTitle`/`blockHeadline`/`blockDesc` — "Block Label/Category", "Main Headline",
"Instructional Subtext"; static markup in `index.html`, not part of `editorSchemas`). The
template's "Title"/"Question" and "Introduction" fields map to these shared fields, not to
`itemFields`.

| Template field | Real schema field | Notes |
| --- | --- | --- |
| **Accordion** (`minItems: 1`) | | |
| Title | `config.blockHeadline` (shared) | |
| Introduction | `config.blockDesc` (shared) | |
| Item title *(by item #)* | `items[i].title` | required, text, max 120 |
| Item body *(by item #)* | `items[i].content` | required, richtext |
| **Multiple Choice** (`minItems: 2`) | | |
| Question | `config.blockHeadline` (shared) | |
| Choice text *(by item #)* | `items[i].label` | required, richtext |
| Choice correct *(by item #)* | `items[i].correct` | radio, `groupAcrossItems: true, requiredOne: true` — **exactly one** item may be `true`; confirms the spec's "single-answer schema" assumption is correct for this component |
| Choice feedback *(by item #)* | `items[i].content` | optional, textarea |
| **Image Gallery** (`minItems: 1`) | | |
| Title | `config.blockHeadline` (shared) | |
| Image source *(by item #)* | `items[i].content` | **required**, type `image` — see "Pending media" below, this is the field the spec's "never a working URL or file" warning is about |
| Image alt text *(by item #)* | `items[i].altText` | optional (but warned-on when content is set and not decorative) |
| Image caption *(by item #)* | `items[i].caption` | optional |
| *(no template field)* | `items[i].title` | **required, text** — the template has no "Image title" row; the importer must synthesize one (e.g. from caption, or `"Image {n}"`) or this is a genuine unmapped-required-field validation finding |
| **Horizontal Timeline** (`minItems: 2`) | | |
| Title | `config.blockHeadline` (shared) | |
| Step title *(by item #)* | `items[i].title` | required, text |
| Step body *(by item #)* | `items[i].content` | required, richtext |

**Found while mapping, not just anticipated by the spec:** Image Gallery's `title` item field is
*required* but has no corresponding row in the template's own "Image Gallery content record"
example. This is exactly the kind of "field has no safe mapping" case the spec says must be
flagged in preview, not silently invented — except here it's the reverse (a required target field
with no source), so the adapter needs an explicit, documented fallback (proposal: derive from
caption, else `"Image {item number}"`), and this must be called out to the user as a synthesized
value, not "approved content."

## Pending media — no working URL, no silent invention

Image Gallery's `content` item field is `type: 'image'` and `required: true` — an empty string
fails the existing required-field validation, so a "pending" image cannot be left blank without
either weakening validation (rejected — changes save-gate semantics for every other use of this
field) or storing a well-formed-but-unresolvable value.

**Design decision:** generate a synthetic *unresolvable* media reference — the same shape
`isMediaReference()` (`js/media.js`) already accepts (`{ mediaId, source: 'upload', kind: 'image',
name: '<filename from template>' }`) — with a `mediaId` that has no corresponding IndexedDB
record. This is not a new concept: it's the exact shape the app already produces when a media
record goes missing (a browser-profile switch, a cleared IndexedDB), and `checkBrokenMediaReferences`
(`js/validation.js`) already flags an unresolvable reference as a **blocking** Preflight issue —
which is exactly the desired behavior ("pending-media state," course-ZIP export blocked until the
developer attaches the real file, per the spec's own workflow step 6). No new validation code
path is needed for this; reusing the existing broken-reference machinery is more consistent than
inventing a parallel "pending" state that every downstream consumer (QA, export, course-ZIP) would
need to learn about separately.

## Where RISE rows must be excluded

Confirmed by reading the actual current implementations (not the stale docs):

- **`js/dashboard/project-qa.js`** (`auditCourseProject`) iterates `components` — needs a
  `kind === 'rise'` guard at the top of its per-component loop.
- **`js/dashboard/project-export.js`** (`buildCourseProjectZip`/`addComponentToArchive`) — same
  guard; a RISE row must never reach the compiler (`generateIframeContent`) at all, since it has
  no real `type`/`config` in the schema-driven sense.
- **`js/dashboard/course-readiness.js`** (`mergeReadiness`/`getCourseReadiness`) — reads QA output,
  should be unaffected once `project-qa.js` already skips RISE rows upstream.
- **Course outline rendering** (wherever `componentOrder` is walked to render the workspace list —
  needs to be located precisely during implementation, likely `js/dashboard/project-overview.js`)
  needs a distinct visual treatment for `kind: 'rise'` rows (per the spec: "visible in the course
  outline... excluded from custom component QA/export/ZIP generation").

## The docx parsing pipeline — no new dependency

Confirmed by extracting and reading the actual template file directly (not just the spec's
description of it):

- A `.docx` is a ZIP archive; `word/document.xml` is the document body as WordprocessingML XML.
  This project already has `js/zip.js#readZip(blob)` — a general-purpose ZIP reader already
  proven against arbitrary/untrusted uploads (Post-Publish's package detector uses it on
  user-supplied ZIPs). No new runtime dependency is needed to unzip a `.docx`.
- `word/document.xml` is plain XML, parseable with the browser's native `DOMParser` — no XML
  library needed either.
- This matters because the project has **zero runtime dependencies today**
  (`package.json` has no `"dependencies"` key) and `docs/ARCHITECTURE.md` states "npm exists only
  for pinned dev tooling" as an explicit architectural rule. A parsing approach that needs no new
  dependency avoids being the first exception to that rule, and avoids the license/bundle/security
  review the spec's own instructions ask for (moot if there's no dependency to review).

**Confirmed by extracting the real template**: it is clean, consistent, machine-generated
WordprocessingML — 7 tables, `Heading1`/`Heading2` paragraph styles, no revision-tracking markup,
no nested tables. A hand-rolled reader for *this template's* structure (not arbitrary Word
documents) is tractable.

**Fragility found, not called out in the spec**: Section ID/title and Block ID/Component are
**not** in separate structured cells — they're inline free text in one paragraph, following a
`"Section ID: S01     Section title: ..."` / `"Block ID: S01-B02     Component: Accordion"`
convention (label, colon, value, multiple spaces, next label). The parser must regex this out of
paragraph text, not just walk table structure. This is a real fragility point: a typo in the label
text ("Section Id:" vs "Section ID:") or different spacing breaks extraction silently unless
explicitly tested. Added as a required fixture case (see Tests below), not just a validation
finding category to define abstractly.

## Where the "Import Storyboard" entry point goes

`js/dashboard/dashboard-view.js`'s "Quick Action Starter Grid" has three top-level cards today
(3-Module Sample Course, Rise Post-Publish Toolkit, Import Project Package — the last one is
`.json`-only despite its "Restore project file" wording, confirmed by reading its actual file
input: `accept=".json"`). Per the spec's "keep existing JSON/ZIP import separate and intact" and
"the user chooses Import Storyboard (.docx) from the projects dashboard" (implying a
peer-level, discoverable entry point) — this will be a **fourth top-level starter card**, not a
new radio option inside the existing "New Project" modal's import branch. The existing modal's
one-shot "pick file → import & open" flow doesn't fit a multi-step parse → validate → review →
confirm flow anyway.

## Files this will touch (plan, subject to change during implementation)

New:
- `js/storyboard-import/docx-parser.js` — unzip + XML walk → raw table/paragraph structure
- `js/storyboard-import/storyboard-extract.js` — raw structure → metadata/sections/outline rows/content records
- `js/storyboard-import/field-mapping.js` — versioned per-component-type field adapters (4 types initially)
- `js/storyboard-import/validation.js` — the finding categories from the spec's "Validation and review" section
- `js/storyboard-import/build-project.js` — validated import data → a real `buildProjectSchemaV3()` project
- `js/dashboard/storyboard-import-view.js` (or similar) — the review/confirm screen
- `tests/unit/storyboard-import/*.test.js`, `tests/e2e/storyboard-import.spec.js`
- `tests/fixtures/storyboard/*.docx` (valid + malformed cases)

Edited:
- `js/dashboard/dashboard-view.js` — new starter card + wiring
- `js/dashboard/project-qa.js`, `js/dashboard/project-export.js` — skip `kind: 'rise'`
- Wherever the course outline is rendered — distinct RISE-row treatment
- `js/project-schema.js` — `kind` field on `createComponentInstance` (additive, no version bump)
- `docs/COMPONENT-SCHEMA.md`, `docs/PROJECT.md` (or their real current equivalents, to be
  re-confirmed since these two are among the stale docs noted above) — user-facing ID/developer
  instructions per the spec's delivery-order requirement

## Tests (acceptance criteria from the spec, restated as concrete targets)

- Parser unit tests against the real template fixture: metadata table, section/outline extraction
  (including the inline-label regex), all 4 content-record tables, multiline text, repeated items.
- A malformed fixture: duplicate block IDs, an orphan content record, a mismatched type, a second
  "correct" Multiple Choice answer, unresolved media — one assertion per validation finding
  category in the spec.
- Adapter unit tests: each of the 4 mappings above, including the Image Gallery synthesized-title
  case and the pending-media broken-reference case.
- E2E: full import → preview → confirm → reload → verify section order, all 4 populated types,
  RISE rows present and excluded from QA/export, no placeholder text in exported content.
- Regression: existing JSON/ZIP import, QA, export, and (AT&T) client-isolation suites all still
  pass unchanged.

## Open items to confirm before/while implementing

1. Exact location of course-outline rendering code (named above as "likely
   `js/dashboard/project-overview.js`," not yet confirmed) — first implementation step.
2. Whether `status`/`qa` should be entirely absent from RISE-kind entries or present-but-ignored;
   leaning present-but-ignored (matches the additive-field, safe-default pattern already used
   everywhere else in `createComponentInstance`).
3. The Rise build-sheet export (copy/download) — not yet designed; the spec asks for it but
   defers detail to implementation ("provide an accessible way to copy or download the ordered
   Rise build sheet").
