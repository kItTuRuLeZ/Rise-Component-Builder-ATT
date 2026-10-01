// The storyboard importer's reference documentation, generated from the importer's own mapping
// code instead of written by hand, so what authors read always matches what this build accepts.
//
//  - The supported-component list is SUPPORTED_COMPONENT_TYPES (the importer's real lookup table).
//  - Which fields exist, and which are filled once per block vs. once per item, come from
//    KNOWN_TEMPLATE_FIELDS / isSharedTemplateField (field-mapping.js).
//  - Which fields are *required* is derived by running each real mapper on an empty record and
//    reading the "required field is empty" findings it raises, so a mapper change cannot leave this
//    guide saying something the importer no longer does.
//
// The in-app import screen shows the component list and offers the guide as a Markdown download;
// the example storyboard it ships next to is checked against the same tables in
// tests/unit/storyboard-import/field-guide.test.js.

import {
  FIELD_MAPPING_VERSION,
  KNOWN_TEMPLATE_FIELDS,
  SUPPORTED_COMPONENT_TYPES,
  isSharedTemplateField,
  mapContentRecordToComponent
} from './field-mapping.js';

const SMALL_WORDS = new Set(['in', 'the', 'of', 'a', 'an', 'and', 'or', 'to']);

// Rules the mappers enforce that "this field is empty" cannot express (a value that must be one of
// a few words, a count, a field that depends on another). Written out because they cannot be
// derived by running a mapper on an empty record; field-guide.test.js checks these only name real
// component ids, and the importer's own findings remain the source of truth on the review screen.
export const COMPONENT_NOTES = {
  'multiple-choice': [
    'Exactly one choice must be marked correct. `Choice correct` accepts Yes, No, True, False or X.'
  ],
  'multiple-select': [
    'At least one choice row is required. `Choice correct` accepts Yes, No, True, False or X; a block with no correct choice imports with a warning.'
  ],
  'interactive-video': [
    '`Marker time` must be a valid `MM:SS` time (for example `01:10`).',
    '`Marker type` must be `Information` or `Multiple Choice`.',
    'An Information marker needs `Marker body`. A Multiple Choice marker needs `Question` and `Correct answer`.',
    'A Multiple Choice marker imports only its correct answer: add the wrong options in the Builder before publishing.'
  ],
  'dial-gauge': [
    '`Value`, `Minimum` and `Maximum` must be numbers.',
    'Add at least one operating tier. Each tier needs a `Tier title`, `Tier minimum`, `Tier maximum` and `Tier insight`.'
  ]
};

/** "fill in the blank" -> "Fill in the Blank"; "policy & alert cards" -> "Policy & Alert Cards". */
export function formatComponentName(templateKey) {
  return templateKey.split(' ').map((word, index) => (
    index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
  )).join(' ');
}

/**
 * Runs the real mapper over a synthetic, empty record and returns what it insists on.
 * @param {string} templateKey a key of SUPPORTED_COMPONENT_TYPES
 * @param {string} componentId
 */
function deriveRequirements(templateKey, componentId) {
  const known = KNOWN_TEMPLATE_FIELDS[componentId] || [];
  const emptyRecord = withItem => ({
    blockId: 'GUIDE',
    component: templateKey,
    fields: known
      .filter(label => withItem || isSharedTemplateField(componentId, label))
      .map(label => ({ field: label, item: isSharedTemplateField(componentId, label) ? null : 1, content: '' }))
  });

  const required = new Set();
  for (const finding of mapContentRecordToComponent(emptyRecord(true)).findings) {
    if (finding.code !== 'required-field-missing') continue;
    const match = /required field "([^"]+)"/.exec(finding.message);
    if (match) required.add(match[1]);
  }

  let minItems = 0;
  for (const finding of mapContentRecordToComponent(emptyRecord(false)).findings) {
    if (finding.code !== 'too-few-items') continue;
    const match = /at least (\d+)/.exec(finding.message);
    if (match) minItems = Math.max(minItems, Number(match[1]));
  }
  return { required, minItems };
}

/**
 * @returns {{ name: string, templateKey: string, builderId: string, minItems: number, notes: string[],
 *   fields: { label: string, scope: 'block' | 'item', required: boolean }[] }[]}
 *   Every component type this build can import, in the importer's own order.
 */
export function getSupportedComponents() {
  return Object.entries(SUPPORTED_COMPONENT_TYPES).map(([templateKey, builderId]) => {
    const { required, minItems } = deriveRequirements(templateKey, builderId);
    return {
      name: formatComponentName(templateKey),
      templateKey,
      builderId,
      minItems,
      notes: COMPONENT_NOTES[builderId] || [],
      fields: (KNOWN_TEMPLATE_FIELDS[builderId] || []).map(label => ({
        label,
        scope: isSharedTemplateField(builderId, label) ? 'block' : 'item',
        required: required.has(label)
      }))
    };
  });
}

/** Counts shown to authors: Builder components are importable, Rise references are not. */
export function describeStoryboardCounts(builderCount, riseCount) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const total = builderCount + riseCount;
  return `${plural(builderCount, 'Builder component', 'Builder components')} + ${plural(riseCount, 'Rise reference', 'Rise references')} (${plural(total, 'outline row', 'outline rows')})`;
}

/**
 * The field guide as Markdown, ready to download.
 * @param {{ editionLabel?: string }} [options]
 */
export function buildFieldGuideMarkdown({ editionLabel = '' } = {}) {
  const components = getSupportedComponents();
  const lines = [];
  const push = (...parts) => lines.push(...parts);

  push(
    `# Rise Component Builder${editionLabel ? ` (${editionLabel})` : ''}: storyboard field guide`,
    '',
    `Storyboard field mapping v${FIELD_MAPPING_VERSION}. This guide is generated from the importer's own mapping tables, so it describes exactly what this build accepts.`,
    '',
    '## What the importer does and does not do',
    '',
    '- It imports the content you supply into the matching Builder component. It does **not** write content for you: a missing required field is reported, never filled in.',
    '- It does **not** author native Rise blocks. Rows marked `RISE` become reference-only entries in the course outline.',
    '- Nothing is dropped silently. A field the importer does not use for that component is reported as "not imported" and stays in your document.',
    '- Review every warning before publishing. A warning is not an error, but it tells you something the importer could not do for you.',
    '',
    '## How the document must be laid out',
    '',
    'Start from the downloadable template. The importer depends on these conventions; a typo in a label or a missing table is reported on the review screen, never silently skipped.',
    '',
    '1. **Course metadata** is the first table: `Field | Value`. `Course title` becomes the project name.',
    '2. **Each section** is a Heading 2 reading `Section ID: <id>     Section title: <title>`, followed by its outline table: `Block ID | Kind | Block type | Title and build note`, one row per block.',
    '3. **Kind** is `BUILDER` (imported into a Builder component) or `RISE` (a reference to a block you build by hand in Rise 360).',
    '4. **Each BUILDER block** has a Heading 2 reading `Block ID: <id>     Component: <name>`, followed by its content table: `Field | Item | Approved content`.',
    '5. **Block IDs** (for example `S01-B02`) must be unique and must match between the outline and the content record.',
    '6. **The Item column** is `—` (blank) for fields filled once per block, and `1`, `2`, `3` ... for fields that repeat. Item numbers must start at 1 and have no gaps.',
    '7. Text in square brackets that is still the template\'s own placeholder (such as `[Enter course title]`) is treated as unfilled, not as content.',
    '',
    '## RISE references',
    '',
    'A `RISE` row is an instruction to build a native Rise 360 block by hand (Text, Image, Knowledge Check, and so on). It keeps its place in the outline, in order, with its build note. It is **excluded from the Builder\'s preview, QA and export**, because there is nothing here to render or check. Use **Rise Build Sheet** on the course to copy or download every reference row, in outline order, as a checklist for the Rise build.',
    '',
    '## Media files',
    '',
    'The importer cannot read a media file from a Word document. Write the file name in square brackets, for example `[site-walkthrough.mp4 — attach in Builder]`. The component imports with a placeholder for that file, and its Preflight reports the file as missing until you attach the real one in the Builder. Alternative text, captions and transcripts are text fields and import as written.',
    '',
    `## Supported Builder components (${components.length})`,
    '',
    'Write the component name exactly as shown in the first column (capitalisation is ignored).',
    '',
    '| Component name in the template | Builder component | Minimum items |',
    '| --- | --- | --- |',
    ...components.map(c => `| ${c.name} | \`${c.builderId}\` | ${c.minItems || 'none'} |`),
    '',
    '## Fields by component',
    '',
    '**Fill** is `once` for a field filled once per block (Item column `—`) or `per item` for a field that repeats (Item column `1`, `2`, ...). **Required** fields must not be empty.',
    ''
  );

  for (const component of components) {
    push(
      `### ${component.name}`,
      '',
      '| Field | Fill | Required |',
      '| --- | --- | --- |',
      ...component.fields.map(f => `| ${f.label} | ${f.scope === 'block' ? 'once' : 'per item'} | ${f.required ? 'yes' : 'no'} |`),
      ''
    );
    if (component.notes.length) push(...component.notes.map(note => `- ${note}`), '');
  }

  push(
    '## What the review screen reports',
    '',
    '- **Must be fixed (blocks the import):** an unknown component name, a required field that is empty, too few items, an invalid `Kind`, or a duplicate or mismatched Block ID. Fix it in the document and upload it again.',
    '- **To review (does not block):** a field the importer does not use, item numbers that skip, a number that is not a number, or a limitation. For example, an Interactive Video question marker imports only its correct answer; add the other options in the Builder before publishing.',
    ''
  );
  return lines.join('\n');
}
