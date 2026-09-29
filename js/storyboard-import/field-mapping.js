// Versioned field mapping from a storyboard-extract.js content record (raw Field/Item/Content
// rows) to a real project-schema.js component config, for exactly the 4 component types the
// storyboard template supports (docs/STORYBOARD-IMPORT-DESIGN.md). Every other "Component" value
// is an explicit "unsupported import mapping" finding — this never invents a plausible-looking
// mapping for a type it hasn't been taught. Mappings are keyed off the real schemas in
// js/editor-schemas.js, not the spec's proposed field labels.

export const FIELD_MAPPING_VERSION = 1;

// Template "Component" text (case-insensitive) -> the real js/editor-schemas.js component id.
export const SUPPORTED_COMPONENT_TYPES = {
  accordion: 'accordion',
  'multiple choice': 'multiple-choice',
  'image gallery': 'image-gallery',
  'horizontal timeline': 'horizontal-timeline'
};

/** @param {'fatal'|'warning'} severity @param {string} code @param {string} message */
function finding(severity, code, message) {
  return { severity, code, message };
}

/**
 * @param {Array<{field:string,item:number|null,content:string}>} fields
 * @returns {{ shared: Record<string,string>, itemRows: Map<number, Record<string,string>>, itemNumbers: number[] }}
 */
function splitFields(fields) {
  /** @type {Record<string,string>} */
  const shared = {};
  /** @type {Map<number, Record<string,string>>} */
  const itemRows = new Map();
  for (const { field, item, content } of fields) {
    if (item === null) {
      shared[field] = content;
    } else {
      if (!itemRows.has(item)) itemRows.set(item, {});
      // @ts-ignore itemRows.has(item) just confirmed the entry exists
      itemRows.get(item)[field] = content;
    }
  }
  const itemNumbers = [...itemRows.keys()].sort((a, b) => a - b);
  return { shared, itemRows, itemNumbers };
}

/**
 * @param {Record<string,string>} row @param {string} templateField @param {string} blockId
 * @param {number} itemNumber @param {ReturnType<typeof finding>[]} findings
 */
function requireField(row, templateField, blockId, itemNumber, findings) {
  const value = (row[templateField] || '').trim();
  if (!value) {
    findings.push(finding('fatal', 'required-field-missing', `Block "${blockId}" item ${itemNumber}: required field "${templateField}" is empty.`));
  }
  return value;
}

/** @param {number[]} itemNumbers @param {string} blockId @param {ReturnType<typeof finding>[]} findings */
function checkSequentialItemNumbers(itemNumbers, blockId, findings) {
  for (let i = 0; i < itemNumbers.length; i++) {
    if (itemNumbers[i] !== i + 1) {
      findings.push(finding('warning', 'non-sequential-item-numbering', `Block "${blockId}": item numbers are ${itemNumbers.join(', ')} — expected 1..${itemNumbers.length} with no gaps or repeats.`));
      break;
    }
  }
}

function mapAccordion(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = {
    blockHeadline: (shared.Title || '').trim(),
    blockDesc: (shared.Introduction || '').trim(),
    items: itemNumbers.map(n => {
      const row = itemRows.get(n) || {};
      return {
        title: requireField(row, 'Item title', blockId, n, findings),
        content: requireField(row, 'Item body', blockId, n, findings)
      };
    })
  };
  if (config.items.length === 0) findings.push(finding('fatal', 'no-items', `Block "${blockId}" (Accordion) has no item rows.`));
  return config;
}

function mapMultipleChoice(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  let correctCount = 0;
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const correctRaw = (row['Choice correct'] || '').trim().toLowerCase();
    const correct = correctRaw === 'yes' || correctRaw === 'true' || correctRaw === 'x';
    if (correct) correctCount += 1;
    if (correctRaw && !['yes', 'no', 'true', 'false', 'x'].includes(correctRaw)) {
      findings.push(finding('warning', 'ambiguous-correct-value', `Block "${blockId}" item ${n}: "Choice correct" value "${row['Choice correct']}" is not Yes/No — treated as ${correct ? 'correct' : 'not correct'}.`));
    }
    return {
      label: requireField(row, 'Choice text', blockId, n, findings),
      content: (row['Choice feedback'] || '').trim(),
      correct
    };
  });
  if (items.length === 0) {
    findings.push(finding('fatal', 'no-items', `Block "${blockId}" (Multiple Choice) has no item rows.`));
  } else if (correctCount !== 1) {
    findings.push(finding('fatal', 'wrong-correct-count', `Block "${blockId}" (Multiple Choice) has ${correctCount} choice(s) marked correct; exactly 1 is required.`));
  }
  return { blockHeadline: (shared.Question || '').trim(), items };
}

// The template marks a pending image as "[filename — attach in Builder]"; this keeps the
// filename as a human-readable hint while never producing a value that could pass as a real,
// resolvable media reference.
const MEDIA_FILENAME_RE = /\[([^\]]+?)(?:\s*—\s*[^[\]]*)?\]/;

/**
 * A synthetic, intentionally-unresolvable media reference matching isMediaReference()'s shape
 * (js/media.js) with no corresponding IndexedDB record — reuses the app's existing broken-media
 * detection (checkBrokenMediaReferences, js/validation.js) as the "pending media" blocking
 * Preflight issue, rather than inventing a parallel "pending" concept (docs/STORYBOARD-IMPORT-DESIGN.md).
 */
function pendingMediaReference(blockId, itemNumber, rawContent) {
  const match = MEDIA_FILENAME_RE.exec(rawContent || '');
  const name = (match ? match[1] : rawContent || `image-${itemNumber}`).trim();
  return {
    mediaId: `pending-${blockId}-${itemNumber}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    source: 'upload',
    kind: 'image',
    name
  };
}

function mapImageGallery(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const sourceNote = requireField(row, 'Image source', blockId, n, findings);
    const caption = (row['Image caption'] || '').trim();
    // The template has no "Image title" row but the schema requires items[i].title — this is a
    // synthesized value, not approved content, and must be surfaced as such (docs/STORYBOARD-IMPORT-DESIGN.md).
    const title = caption || `Image ${n}`;
    if (!caption) {
      findings.push(finding('warning', 'synthesized-image-title', `Block "${blockId}" item ${n}: the template has no "Image title" field; used "${title}" as a placeholder — review before publishing.`));
    }
    return {
      content: pendingMediaReference(blockId, n, sourceNote),
      title,
      caption,
      altText: (row['Image alt text'] || '').trim()
    };
  });
  if (items.length === 0) findings.push(finding('fatal', 'no-items', `Block "${blockId}" (Image Gallery) has no item rows.`));
  return { blockHeadline: (shared.Title || '').trim(), items };
}

function mapHorizontalTimeline(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Step title', blockId, n, findings),
      content: requireField(row, 'Step body', blockId, n, findings)
    };
  });
  if (items.length < 2) {
    findings.push(finding('fatal', 'too-few-items', `Block "${blockId}" (Horizontal Timeline) has ${items.length} step(s); at least 2 are required.`));
  }
  return { blockHeadline: (shared.Title || '').trim(), items };
}

const MAPPERS = {
  accordion: mapAccordion,
  'multiple-choice': mapMultipleChoice,
  'image-gallery': mapImageGallery,
  'horizontal-timeline': mapHorizontalTimeline
};

/**
 * @param {{ blockId: string, component: string, fields: Array<{field:string,item:number|null,content:string}> }} contentRecord
 * @returns {{ type: string|null, config: any|null, findings: Array<{severity:'fatal'|'warning',code:string,message:string}> }}
 */
export function mapContentRecordToComponent(contentRecord) {
  /** @type {Array<{severity:'fatal'|'warning',code:string,message:string}>} */
  const findings = [];
  const componentId = SUPPORTED_COMPONENT_TYPES[contentRecord.component.trim().toLowerCase()];
  if (!componentId) {
    findings.push(finding('fatal', 'unsupported-import-mapping', `Block "${contentRecord.blockId}": "${contentRecord.component}" has no import field mapping yet — only Accordion, Multiple Choice, Image Gallery, and Horizontal Timeline can be imported (field mapping v${FIELD_MAPPING_VERSION}).`));
    return { type: null, config: null, findings };
  }
  const config = MAPPERS[componentId](contentRecord.blockId, contentRecord.fields, findings);
  return { type: componentId, config, findings };
}
