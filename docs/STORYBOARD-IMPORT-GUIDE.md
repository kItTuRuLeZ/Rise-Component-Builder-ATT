# Storyboard `.docx` Importer — User & Developer Guide

The storyboard importer turns an instructional designer's filled-in `.docx` storyboard into a
real Builder course project: pick a file, review what it found, confirm, and the course opens in
the workspace ready to build on. It is a separate, additive entry point — the existing JSON/ZIP
"Import Project Package" flow is untouched.

For the reasoning behind the design decisions below (why no new dependency, why `kind` needed no
schema migration, why RISE rows share the same `components` map as BUILDER rows), see
[STORYBOARD-IMPORT-DESIGN.md](STORYBOARD-IMPORT-DESIGN.md), written before implementation. This
guide is the user-facing counterpart, written after.

## What it does, and does not, do

- Imports **exactly 4 component types**: Accordion, Multiple Choice, Image Gallery, and
  Horizontal Timeline. Any other "Component" value in the document is an explicit, named
  "unsupported import mapping" finding — never a guessed or invented mapping.
- Never authors Rise blocks for you. Rows the storyboard marks `RISE` become reference-only
  outline entries — visible so the course structure is complete, excluded from this Builder's QA,
  Preflight, and course-ZIP export, because there is nothing here to check or export.
- Never invents approved content. A required field with no source value (Image Gallery's item
  title, which the template has no row for) is synthesized from what *is* there (the caption) and
  the synthesis is flagged as a finding, not silently treated as approved copy.
- Never produces a broken-looking "done" state. A pending image (the developer hasn't attached the
  real file yet) becomes a deliberately unresolvable media reference, which trips this Builder's
  existing broken-media Preflight check — the same blocking behavior a real missing file would
  produce, not a new "pending" concept to learn.

## For document authors: the expected template format

Start from the team's storyboard template (a `.docx`). The importer depends on two literal
conventions in that document — deviating from them (a typo in a label, a missing table) surfaces
as a validation finding, not a silent miss:

1. **Course metadata** is the first table in the document — a `Field | Value` two-column table.
   `Course title` is used as the new project's default name.
2. **Each section** is a `Heading2` paragraph reading exactly
   `Section ID: <id>     Section title: <title>`, immediately followed by its outline table
   (`Block ID | Kind | Component | Title and note`, one row per block, `Kind` either `RISE` or
   `BUILDER`).
3. **Each Builder content record** is a `Heading2` paragraph reading exactly
   `Block ID: <id>     Component: <one of the 4 supported types>`, immediately followed by its
   field table (`Field | Item | Approved content`).
4. The template's own bracketed placeholder text (`[Sxx-Bxx]`, `[Exact name from picker]`, an
   unfilled `[Enter course title]`) is recognized as a placeholder, not content — a section or
   content record heading with bracketed IDs is silently skipped, but a *real* ID with an
   unrecognized `Kind` value (including the template's own blank example row) is surfaced as a
   finding, since that could be a genuine typo.

### Field mapping (the 4 supported types)

Every component also has three shared fields, filled from the outline heading and the content
record's own `Title`/`Question`/`Introduction` rows (not part of the tables below): Block Label,
Main Headline, Instructional Subtext.

| Template field | Real Builder field | Notes |
| --- | --- | --- |
| **Accordion** — at least 1 item | | |
| Item title *(by item #)* | Item title | Required |
| Item body *(by item #)* | Item content | Required |
| **Multiple Choice** — at least 2 items | | |
| Choice text *(by item #)* | Answer option | Required |
| Choice feedback *(by item #)* | Answer feedback | Optional |
| Choice correct *(by item #)* | Correct answer | `Yes`/`No` — **exactly one** item must be `Yes` |
| **Image Gallery** — at least 1 item | | |
| Image source *(by item #)* | Image | Required — see "Pending media" below |
| Image alt text *(by item #)* | Alt text | Optional, warned on if missing |
| Image caption *(by item #)* | Caption | Optional — also used to synthesize the item title, since the template has no "Image title" row |
| **Horizontal Timeline** — at least 2 items | | |
| Step title *(by item #)* | Item title | Required |
| Step body *(by item #)* | Item content | Required |

**Pending media**: write `[filename.ext — attach in Builder]` (or similar) in an Image Gallery's
"Image source" cell. The importer keeps the filename as a note and creates a placeholder image
reference; the developer attaches the real file after import, and Preflight blocks export until
they do.

## The import workflow

1. From the Projects Dashboard, choose **Import Storyboard (.docx)**.
2. Pick the file. It's parsed and validated immediately — nothing is written yet.
3. **Review**: the outline (every section's rows, each tagged RISE or BUILDER, with whether a
   BUILDER row actually mapped), and every finding.
   - **Issues that must be fixed** (fatal) block the Confirm button entirely. Nothing here can be
     edited in-app — fix the `.docx` itself and re-upload. This is deliberate: the review screen
     shows what the document says, not a place to patch around what it's missing.
   - **Items to review before publishing** (warnings — a synthesized value, non-sequential item
     numbering, an orphaned content record) don't block import but are worth a look.
4. Set the project name (defaults to the document's course title) and **Create Project**. The
   course opens in the workspace.
5. If the course has any RISE rows, a **Rise Build Sheet** button appears in the workspace header
   — copy or download the ordered list of every Rise-authored block (with its build note) for
   whoever is authoring those blocks directly in Rise.

## For developers: where this lives

```
js/storyboard-import/
  docx-parser.js       .docx (a ZIP) -> word/document.xml -> flat {paragraph|table} block list.
                        No storyboard-specific knowledge; js/zip.js#readZip + native DOMParser,
                        no new runtime dependency (see the design doc for why).
  storyboard-extract.js Flat blocks -> {metadata, sections, contentRecords, findings}. The one
                        place that knows the template's own conventions (inline heading labels,
                        placeholder brackets).
  field-mapping.js     One content record -> a real component {type, config}, for exactly the 4
                        supported types. FIELD_MAPPING_VERSION is bumped if a mapping changes.
  validation.js        Cross-references the outline against the content records (missing/orphan
                        records, type mismatches, unknown kinds) and merges in field-mapping's
                        own per-record findings.
  build-project.js     Validated storyboard -> a real buildProjectSchemaV3() project. Refuses to
                        build while any fatal finding remains.
  build-sheet.js        project -> the Rise build sheet text, plus its copy/download dialog.
js/dashboard/
  storyboard-import-view.js   The parse -> review -> confirm screen (a 4th dashboard starter card).
  project-overview.js         renderComponentRow/renderCentralCanvas/renderContextualInspector
                               each branch on comp.kind === 'rise' for distinct, editor-less
                               rendering.
  project-qa.js, course-readiness.js, project-export.js
                               Each filters out kind: 'rise' components independently — they are
                               NOT a shared upstream filter, since project-qa.js's own audit and
                               course-readiness.js's Preflight pass walk project.components
                               separately. A RISE row left unfiltered anywhere is a blocking
                               "Unknown component type" false positive, not a silent no-op.
js/project-schema.js
  createComponentInstance()'s `kind` field ('builder' | 'rise', defaulting to 'builder') — purely
  additive, no schemaVersion bump, no migration (every v3 project already round-trips through
  this constructor on load).
```

Tests live under `tests/unit/storyboard-import/` (one file per module above, plus
`rise-kind-exclusion.test.js` and `rise-row-rendering.test.js` for the cross-cutting QA/export/UI
guards) and `tests/e2e/storyboard-import.spec.js` (the real `<input type="file">` upload path,
which the unit tests can't reach). Fixtures are in `tests/fixtures/storyboard/`:
`valid-template.docx` is the real, deliberately-still-unfilled template; the `e2e-*.docx` files
are minimal synthetic documents built with `js/zip.js#createZip` for the parts the real template
can't exercise (a fully-filled-in document with zero findings, and a non-`.docx` file).

### Adding a 5th supported component type

Add its template field mapping to `field-mapping.js`'s `SUPPORTED_COMPONENT_TYPES` and a mapper
function (following the existing 4), bump `FIELD_MAPPING_VERSION`, and add its field-mapping table
to this doc. `storyboard-extract.js`, `validation.js`, and `build-project.js` need no changes —
they're already generic over "whatever field-mapping.js supports."

## Known limitations (stated plainly, not glossed over)

- Only 4 of this app's ~26 component types can be imported from a storyboard. Everything else is
  a RISE row or an explicit unsupported-mapping finding — never a guess.
- The importer depends on exact heading text (`Section ID:`, `Block ID:`) and `Heading1`/`Heading2`
  paragraph styles. A hand-edited document that doesn't follow the template's own structure will
  produce findings, not a best-effort partial import.
- This does not automate authoring inside Rise itself. RISE rows and the build sheet exist so a
  human can do that work with the right information in front of them.
