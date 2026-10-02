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

- Imports **all 26 of this Builder's component types** (field mapping v2) — see the source-of-truth
  reference template, `SB Template/Rise_Storyboard_All_Components.docx`, and the field-mapping
  tables below. Any "Component" value that still doesn't match one of the 26 is an explicit, named
  "unsupported import mapping" finding — never a guessed or invented mapping.
- Never authors Rise blocks for you. Rows the storyboard marks `RISE` become reference-only
  outline entries — visible so the course structure is complete, excluded from this Builder's QA,
  Preflight, and course-ZIP export, because there is nothing here to check or export.
- Never invents approved content. A required field with no source value (Image Gallery's item
  title, which the template has no row for) is synthesized from what *is* there (the caption) and
  the synthesis is flagged as a finding, not silently treated as approved copy.
- Never silently drops content it doesn't recognize. A field name in a content record that the
  matched component type doesn't use is an explicit "unmapped-field" finding — its text stays in
  the source document for the author to review, not thrown away.
- Never produces a broken-looking "done" state. A pending image, audio, video, or captions file
  (the developer hasn't attached the real file yet) becomes a deliberately unresolvable media
  reference, which trips this Builder's existing broken-media Preflight check — the same blocking
  behavior a real missing file would produce, not a new "pending" concept to learn.

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
   `Block ID: <id>     Component: <one of the 26 supported types, e.g. "Accordion" or "Learning
   Video Player">`, immediately followed by its field table (`Field | Item | Approved content`).
4. The template's own bracketed placeholder text (`[Sxx-Bxx]`, `[Exact name from picker]`, an
   unfilled `[Enter course title]`) is recognized as a placeholder, not content — a section or
   content record heading with bracketed IDs is silently skipped, but a *real* ID with an
   unrecognized `Kind` value (including the template's own blank example row) is surfaced as a
   finding, since that could be a genuine typo.

### Field mapping (all 26 supported types)

Most components render the generic, non-schema-driven block header from the record's shared
`Title`/`Introduction` rows (Block Label/Main Headline/Instructional Subtext). Seven "advanced"
types define their own `Title`/`Introduction` fields instead and are marked **own header** below —
for those, the shared rows fill the component's own title/content, not the generic header.

| Template field | Real Builder field | Notes |
| --- | --- | --- |
| **Accordion** (`accordion`) — at least 1 item | | |
| Item title / Item body *(by item #)* | Item title / content | Both required |
| **Study Cards** (`flip-cards`) — at least 2 items, paired front/back | | |
| Item title / Item body *(by item #)* | Face title / content | Both required |
| **Horizontal Tabs** (`tab-blocks`) — at least 2 items | | |
| Item title / Item body *(by item #)* | Tab label / content | Both required |
| **Reference Explorer** (`menu-list`) — at least 1 item | | |
| Item title / Item body *(by item #)* | Topic name / definition | Both required |
| **Info Grid** (`info-grid`) — at least 1 item | | |
| Item title / Item body *(by item #)* | Card title / description | Both required |
| **Guided Vertical Timeline** (`vertical-timeline`) — at least 2 items | | |
| Step title / Step body *(by item #)* | Item title / content | Both required |
| **Horizontal Timeline** (`horizontal-timeline`) — at least 2 items | | |
| Step title / Step body *(by item #)* | Item title / content | Both required |
| **Guided Process** (`process-flow`) — at least 2 items | | |
| Step title / Step body *(by item #)* | Item title / content | Both required |
| Duration minutes *(by item #)* | Estimated duration | Optional, numeric |
| **Button List** (`button-list`) — at least 1 item | | |
| Item title / Destination URL *(by item #)* | Button label / URL | Both required |
| **Multiple Choice** (`multiple-choice`) — at least 2 items | | |
| Question (shared) | Main Headline | |
| Choice text / Choice feedback *(by item #)* | Answer option / feedback | Text required, feedback optional |
| Choice correct *(by item #)* | Correct answer | `Yes`/`No` — **exactly one** item must be `Yes` |
| **Multiple Select** (`multiple-select`) — at least 2 items | | |
| Question / Choice text / Choice feedback / Choice correct | Same as Multiple Choice | **Any number** (including zero, flagged) of items may be `Yes` |
| **Sorting Activity** (`sorting-activity`) — at least 2 items | | |
| Category *(one row per declared category, informational)* | — | Not imported; cross-checked against each item's own category |
| Item title / Item description *(by item #)* | Item label / description | Title required, description optional |
| Item category *(by item #)* | Correct category | Required — flagged if it doesn't match a declared "Category" row |
| **Fill in the Blank** (`fill-blank`) — at least 1 item | | |
| Sentence *(by item #)* | Sentence with `[blank]` | Required; warned if no `[blank]` token |
| Accepted answer *(by item #)* | Accepted answers | Required |
| Clue *(by item #)* | Hint | Optional |
| **Scenario** (`scenario`) — at least 2 items total | | |
| Prompt (shared) | The scene item's own content | Required; its title is synthesized from the block's Title (flagged) |
| Choice title / Choice outcome *(by item #)* | Choice item title / content | Both required |
| **Profile Cards** (`profile-cards`) — at least 1 item | | |
| Person name / Description *(by item #)* | Name / biography | Both required |
| Image source / Image alt text *(by item #)* | Photo | Optional — see "Pending media" below |
| **Comparison Matrix** (`pricing-comparison`) — at least 2 items | | |
| Option title / Option detail *(by item #)* | Option title / features | Both required |
| Highlighted option *(by item #)* | Highlight this option | `Yes`/`No`, optional |
| **Learning Audio Player** (`audio-player`) — exactly 1 item | | |
| Title (shared) | Also reused as the one item's own required title | |
| Audio source *(item 1)* | Audio file | Required — pending media |
| Description / Transcript *(item 1)* | Description / transcript | Optional |
| **Learning Video Player** (`video-frame`) — exactly 1 item | | |
| Title (shared) | Also reused as the one item's own required title | |
| Video source *(item 1)* | Video file | Required — pending media |
| Poster image / Poster alt text *(item 1)* | Poster image | Optional — pending media |
| Captions file *(item 1)* | Captions | Optional — pending media |
| Transcript *(item 1)* | Transcript | Optional |
| **Image Gallery** (`image-gallery`) — at least 1 item | | |
| Image source *(by item #)* | Image | Required — pending media, see below |
| Image alt text *(by item #)* | Alt text | Optional, warned on if missing |
| Image caption *(by item #)* | Caption | Optional — also synthesizes the item title (flagged), since the template has no "Image title" row |
| **Interactive Video** (`interactive-video`, **own header**) | | |
| Title / Introduction (shared) | Component's own title/introduction | Title required |
| Video source (shared) | Video | Required — pending media |
| Captions file (shared) | Captions | Optional — pending media |
| Marker time *(by item #)* | Marker timestamp | Required, `MM:SS` or `HH:MM:SS` |
| Marker type *(by item #)* | `Information` or `Multiple Choice` | Required, exact match |
| Marker title *(by item #)* | Marker title | Required for every marker |
| Marker body *(Information markers)* | Information body | Required for that marker |
| Question / Correct answer *(Multiple Choice markers)* | Question / answer 1 | Required; only one answer is imported — add distractors in the Builder (flagged) |
| **Comparison Slider** (`comparison-slider`, **own header**) — exactly 1 item | | |
| Before label / After label *(item 1)* | Before/after labels | Both required |
| Before image / Before alt text, After image / After alt text | Before/after images | Optional — pending media |
| **Interactive Gauge** (`dial-gauge`, **own header**) — at least 1 tier | | |
| Value / Minimum / Maximum (shared) | Initial value / scale min / scale max | All required, numeric |
| Tier title / Tier minimum / Tier maximum / Tier insight *(by item #)* | Operating tier | All required |
| **Policy & Alert Cards** (`callout-box`, **own header**) — at least 1 item | | |
| Card title / Card body *(by item #)* | Notice title / description | Both required |
| **Card Carousel** (`card-carousel`, **own header**) — at least 1 item | | |
| Card title / Card body *(by item #)* | Card title / content | Both required |
| Card image / Card image alt text *(by item #)* | Featured image | Optional — pending media |
| **Confidence Matrix** (`confidence-matrix`, **own header**) — at least 1 item | | |
| Item title / Item body *(by item #)* | Competency title / criteria | Both required |
| **Hotspots** (`hotspots`, **own header**) — at least 1 item | | |
| Background image / Background alt text (shared) | Background map image | Optional — pending media |
| Item title / Item body *(by item #)* | Hotspot title / content | Both required |
| Item position *(by item #)* | Marker `x`/`y` | `"N% x, M% y"` — left at the default center (flagged) if missing or unparseable |

**Pending media**: write `[filename.ext — attach in Builder]` (or similar) in an image/audio/
video/captions field's cell. The importer keeps the filename as a note and creates a placeholder
media reference of the right kind; the developer attaches the real file after import, and
Preflight blocks export until they do.

## Templates (downloaded from the import screen)

The **Import Storyboard** screen lists every supported component (generated from
`SUPPORTED_COMPONENT_TYPES`, so it is never out of date) and offers two downloads:

| Download | File | What it is |
| --- | --- | --- |
| Storyboard template with macro | `templates/storyboard/Rise_Component_Storyboard_Template.docm` | The working storyboard template. Its Word macro (`RiseStoryboardTools`) inserts new component records. Word blocks macros in a downloaded file ("Microsoft has blocked macros from running because the source of this file is untrusted"). Before opening it, right-click the file > **Properties** > tick **Unblock**; then choose **Enable Editing** and **Enable Content**. The macro is unsigned, so IT can alternatively sign it or place the file in a Trusted Location. The template imports without the macro. The importer accepts the saved `.docm` as well as a `.docx`. It reads with no blocking findings; its instruction headings and one blank-token marker are reported as warnings. |
| Example with all components | `templates/storyboard/Rise_Storyboard_All_Components_Example.docx` | A complete sample, one block for each of the 26 supported components plus 8 Rise references. It imports as-is: no blocking findings, one expected warning (an Interactive Video question marker imports only its correct answer). |

The import screen no longer offers a field-guide download. `js/storyboard-import/field-guide.js` still
generates one from the importer (it is **derived, not written by hand**) and drives the on-screen
component list: the component list is
`SUPPORTED_COMPONENT_TYPES`; the fields are `KNOWN_TEMPLATE_FIELDS`; once-versus-per-item is
`isSharedTemplateField`; and *required* fields and minimum item counts are found by running each real
mapper on an empty record and reading the findings it raises. A few rules that cannot be derived that
way (exactly one correct Multiple Choice answer, Interactive Video marker types) are written out in
`COMPONENT_NOTES`.

`templates/` is copied into `dist/` by `build.mjs`, and `tests/unit/storyboard-import/field-guide.test.js`
imports the shipped files through the real parser and validator, so the templates cannot drift away
from the importer.

**What changed from the original reference template** (`SB Template/Rise_Storyboard_All_Components.docx`,
which is left untouched): that file did not import. Its Interactive Gauge example had no operating tiers
(the Builder requires at least one), and its second Interactive Video marker had no `Marker title` (required).
Three fields the importer cannot use ("Metric label" and "Interpretation" on the gauge, "Axis label" on the
confidence matrix) only produced "not imported" warnings. The shipped example adds three gauge tiers
and the marker title and drops those three rows. If you keep editing the original, make the same changes.

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
  field-mapping.js     One content record -> a real component {type, config}, for all 26 supported
                        types. FIELD_MAPPING_VERSION is bumped if a mapping changes. Also flags any
                        recognized-but-unused field as an "unmapped-field" finding.
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
guards, and `all-components-field-mapping.test.js` for the 22 types added in field mapping v2) and
`tests/e2e/storyboard-import.spec.js` (the real `<input type="file">` upload path, which the unit
tests can't reach). Fixtures are in `tests/fixtures/storyboard/`: `valid-template.docx` is the
real, deliberately-still-unfilled 4-type template; `all-components-template.docx` is the real
reference template covering all 26 types (the source of truth for the field-naming convention
above — confirm any mapping question against it, not against guesswork from the schema alone); the
`e2e-*.docx` files are minimal synthetic documents built with `js/zip.js#createZip` for the parts
the real templates can't exercise (a fully-filled-in document with zero findings, and a
non-`.docx` file).

### Adding a 27th supported component type

Add its template field mapping to `field-mapping.js`'s `SUPPORTED_COMPONENT_TYPES`, `MAPPERS`, and
`KNOWN_TEMPLATE_FIELDS`, and a mapper function (following the existing 26 — `mapTitleBodyItems` and
`applySharedHeader` cover the common "shared header + per-item title/body" shape; write a bespoke
function only when the type is genuinely different, e.g. Hotspots' position parsing or Scenario's
prompt-becomes-item-0), bump `FIELD_MAPPING_VERSION`, and add its field-mapping table row to this
doc. Also add it to `SHARED_BY_COMPONENT` in `field-mapping.js` if it has once-per-block fields beyond
`Title`/`Introduction`, add a block for it to the example storyboard in `templates/storyboard/`, and
run `tests/unit/storyboard-import/field-guide.test.js`, which fails until the guide, the mapper and the
example agree. `storyboard-extract.js`, `validation.js`, and `build-project.js` need no changes — they're
already generic over "whatever field-mapping.js supports."

## Known limitations (stated plainly, not glossed over)

- The importer depends on exact heading text (`Section ID:`, `Block ID:`) and `Heading1`/`Heading2`
  paragraph styles. A hand-edited document that doesn't follow the template's own structure will
  produce findings, not a best-effort partial import.
- Interactive Video's Multiple Choice markers import only the correct answer as a single option —
  the template format has no place for distractor answers, so those must be added in the Builder
  before publishing (flagged as a warning on import).
- This does not automate authoring inside Rise itself. RISE rows and the build sheet exist so a
  human can do that work with the right information in front of them.
