// Versioned field mapping from a storyboard-extract.js content record (raw Field/Item/Content
// rows) to a real project-schema.js component config, for all 26 component types in
// js/editor-schemas.js (docs/STORYBOARD-IMPORT-DESIGN.md, docs/STORYBOARD-IMPORT-GUIDE.md).
// Field-name conventions are confirmed against the real reference template covering every
// type, "SB Template/Rise_Storyboard_All_Components.docx" — not invented from the schema
// alone. Any "Component" value that still doesn't match one of the 26 is an explicit
// "unsupported import mapping" finding — this never invents a plausible-looking mapping for a
// type it hasn't been taught. Any recognized field this module doesn't use for its type is
// surfaced as an "unmapped-field" finding rather than silently discarded, per the reference
// template's own stated requirement.

export const FIELD_MAPPING_VERSION = 2;

// Template "Component" text (case-insensitive) -> the real js/editor-schemas.js component id.
export const SUPPORTED_COMPONENT_TYPES = {
  accordion: 'accordion',
  'study cards': 'flip-cards',
  'horizontal tabs': 'tab-blocks',
  hotspots: 'hotspots',
  'button list': 'button-list',
  'reference explorer': 'menu-list',
  'multiple choice': 'multiple-choice',
  'multiple select': 'multiple-select',
  'sorting activity': 'sorting-activity',
  'fill in the blank': 'fill-blank',
  'guided vertical timeline': 'vertical-timeline',
  'horizontal timeline': 'horizontal-timeline',
  'guided process': 'process-flow',
  scenario: 'scenario',
  'profile cards': 'profile-cards',
  'info grid': 'info-grid',
  'comparison matrix': 'pricing-comparison',
  'learning audio player': 'audio-player',
  'learning video player': 'video-frame',
  'image gallery': 'image-gallery',
  'interactive video': 'interactive-video',
  'comparison slider': 'comparison-slider',
  'interactive gauge': 'dial-gauge',
  'policy & alert cards': 'callout-box',
  'card carousel': 'card-carousel',
  'confidence matrix': 'confidence-matrix'
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
 * @param {number|string} itemLabel @param {ReturnType<typeof finding>[]} findings
 */
function requireField(row, templateField, blockId, itemLabel, findings) {
  const value = (row[templateField] || '').trim();
  if (!value) {
    findings.push(finding('fatal', 'required-field-missing', `Block "${blockId}" item ${itemLabel}: required field "${templateField}" is empty.`));
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

/** @param {any[]} items @param {number} min @param {string} blockId @param {string} label @param {ReturnType<typeof finding>[]} findings */
function checkMinItems(items, min, blockId, label, findings) {
  if (items.length < min) {
    findings.push(finding('fatal', 'too-few-items', `Block "${blockId}" (${label}) has ${items.length} item(s); at least ${min} ${min === 1 ? 'is' : 'are'} required.`));
  }
}

/**
 * Applies the template's shared "Title"/"Introduction" rows to a component config. Most types
 * render the generic, non-schema-driven block header (config.blockHeadline/blockDesc); a few
 * "advanced" types (hotspots, interactive-video, comparison-slider, dial-gauge, callout-box,
 * card-carousel, confidence-matrix) define their OWN title/content (or title/introduction)
 * componentFields in js/editor-schemas.js instead, and use those in place of the generic header.
 * @param {Record<string,string>} shared @param {'header'|'own'} mode @param {string} [ownContentKey]
 */
function applySharedHeader(config, shared, mode, ownContentKey = 'content') {
  const title = (shared.Title || '').trim();
  const intro = (shared.Introduction || '').trim();
  if (mode === 'own') {
    config.title = title;
    config[ownContentKey] = intro;
  } else {
    config.blockHeadline = title;
    config.blockDesc = intro;
  }
}

// The template marks a pending file as "[filename — attach in Builder]"; this keeps the
// filename as a human-readable hint while never producing a value that could pass as a real,
// resolvable media reference.
const MEDIA_FILENAME_RE = /\[([^\]]+?)(?:\s*—\s*[^[\]]*)?\]/;

/**
 * A synthetic, intentionally-unresolvable media reference matching isMediaReference()'s shape
 * (js/media.js) with no corresponding IndexedDB record — reuses the app's existing broken-media
 * detection (checkBrokenMediaReferences, js/validation.js) as the "pending media" blocking
 * Preflight issue, rather than inventing a parallel "pending" concept (docs/STORYBOARD-IMPORT-DESIGN.md).
 * @param {string} blockId @param {number|string} itemKey @param {string} rawContent
 * @param {'image'|'audio'|'video'|'captions'} [kind]
 */
function pendingMediaReference(blockId, itemKey, rawContent, kind = 'image') {
  const match = MEDIA_FILENAME_RE.exec(rawContent || '');
  const name = (match ? match[1] : rawContent || `${kind}-${itemKey}`).trim();
  return {
    mediaId: `pending-${blockId}-${itemKey}-${kind}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    source: 'upload',
    kind,
    name
  };
}

/**
 * An optional media field: only synthesized when the author actually wrote something.
 * @param {Record<string,string>} row @param {string} templateField @param {string} blockId
 * @param {number|string} itemKey @param {'image'|'audio'|'video'|'captions'} [kind]
 */
function optionalPendingMedia(row, templateField, blockId, itemKey, kind = 'image') {
  const raw = (row[templateField] || '').trim();
  return raw ? pendingMediaReference(blockId, itemKey, raw, kind) : '';
}

/** MM:SS or HH:MM:SS -> total seconds; null if unparseable. */
function parseTimecodeToSeconds(text) {
  const parts = (text || '').trim().split(':').map(p => Number(p));
  if (parts.length < 2 || parts.some(p => !Number.isFinite(p))) return null;
  return parts.reduceRight((total, part, i, arr) => total + part * Math.pow(60, arr.length - 1 - i), 0);
}

// ---------------------------------------------------------------------------------------------
// Generic per-item "title + body" mapper, shared by every type whose item shape is just two
// required text/richtext fields under a type-specific field-name convention (the majority of
// the simpler types below).
// ---------------------------------------------------------------------------------------------
function mapTitleBodyItems(blockId, itemRows, itemNumbers, titleField, bodyField, findings) {
  return itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, titleField, blockId, n, findings),
      content: requireField(row, bodyField, blockId, n, findings)
    };
  });
}

function mapAccordion(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 1, blockId, 'Accordion', findings);
  return config;
}

function mapStudyCards(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 2, blockId, 'Study Cards', findings);
  return config;
}

function mapHorizontalTabs(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 2, blockId, 'Horizontal Tabs', findings);
  return config;
}

function mapReferenceExplorer(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 1, blockId, 'Reference Explorer', findings);
  return config;
}

function mapInfoGrid(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 1, blockId, 'Info Grid', findings);
  return config;
}

function mapGuidedVerticalTimeline(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Step title', 'Step body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 2, blockId, 'Guided Vertical Timeline', findings);
  return config;
}

function mapHorizontalTimeline(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Step title', 'Step body', findings) };
  applySharedHeader(config, shared, 'header');
  checkMinItems(config.items, 2, blockId, 'Horizontal Timeline', findings);
  return config;
}

function mapGuidedProcess(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const item = {
      title: requireField(row, 'Step title', blockId, n, findings),
      content: requireField(row, 'Step body', blockId, n, findings)
    };
    const durationRaw = (row['Duration minutes'] || '').trim();
    if (durationRaw) {
      const duration = Number(durationRaw);
      if (Number.isFinite(duration)) item.durationMinutes = duration;
      else findings.push(finding('warning', 'invalid-number', `Block "${blockId}" item ${n}: "Duration minutes" value "${durationRaw}" is not a number — ignored.`));
    }
    return item;
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 2, blockId, 'Guided Process', findings);
  return config;
}

function mapPolicyAlertCards(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Card title', 'Card body', findings) };
  applySharedHeader(config, shared, 'own');
  checkMinItems(config.items, 1, blockId, 'Policy & Alert Cards', findings);
  return config;
}

function mapCardCarousel(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Card title', blockId, n, findings),
      content: requireField(row, 'Card body', blockId, n, findings),
      image: optionalPendingMedia(row, 'Card image', blockId, n, 'image'),
      altText: (row['Card image alt text'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'own');
  checkMinItems(items, 1, blockId, 'Card Carousel', findings);
  return config;
}

function mapConfidenceMatrix(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = { items: mapTitleBodyItems(blockId, itemRows, itemNumbers, 'Item title', 'Item body', findings) };
  applySharedHeader(config, shared, 'own');
  checkMinItems(config.items, 1, blockId, 'Confidence Matrix', findings);
  return config;
}

function mapButtonList(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Item title', blockId, n, findings),
      content: requireField(row, 'Destination URL', blockId, n, findings)
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Button List', findings);
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
  const config = { items };
  config.blockHeadline = (shared.Question || '').trim();
  if (items.length === 0) {
    findings.push(finding('fatal', 'no-items', `Block "${blockId}" (Multiple Choice) has no item rows.`));
  } else if (correctCount !== 1) {
    findings.push(finding('fatal', 'wrong-correct-count', `Block "${blockId}" (Multiple Choice) has ${correctCount} choice(s) marked correct; exactly 1 is required.`));
  }
  return config;
}

function mapMultipleSelect(blockId, fields, findings) {
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
  const config = { items };
  config.blockHeadline = (shared.Question || '').trim();
  if (items.length === 0) {
    findings.push(finding('fatal', 'no-items', `Block "${blockId}" (Multiple Select) has no item rows.`));
  } else if (correctCount === 0) {
    findings.push(finding('warning', 'no-correct-answers', `Block "${blockId}" (Multiple Select) has no choices marked correct — confirm this is intentional.`));
  }
  return config;
}

function mapSortingActivity(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  // "Category" (no "Item" prefix) rows declare the category pool for the ID's own reference;
  // "Item category" is each item's actual assignment, which is what the schema stores.
  const declaredCategories = new Set(
    fields.filter(f => f.field === 'Category').map(f => f.content.trim()).filter(Boolean)
  );
  const numberedItems = itemNumbers.filter(n => itemRows.get(n)['Item title'] !== undefined || itemRows.get(n)['Item category'] !== undefined);
  checkSequentialItemNumbers(numberedItems, blockId, findings);
  const items = numberedItems.map(n => {
    const row = itemRows.get(n) || {};
    const category = requireField(row, 'Item category', blockId, n, findings);
    if (category && declaredCategories.size > 0 && !declaredCategories.has(category)) {
      findings.push(finding('warning', 'category-not-declared', `Block "${blockId}" item ${n}: category "${category}" is not one of the declared "Category" rows.`));
    }
    return {
      title: requireField(row, 'Item title', blockId, n, findings),
      content: (row['Item description'] || '').trim(),
      category,
      explanation: (row['Item explanation'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 2, blockId, 'Sorting Activity', findings);
  return config;
}

function mapFillBlank(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const title = requireField(row, 'Sentence', blockId, n, findings);
    if (title && !/\[blank\]/i.test(title)) {
      findings.push(finding('warning', 'missing-blank-token', `Block "${blockId}" item ${n}: "Sentence" has no "[blank]" token.`));
    }
    return {
      title,
      content: requireField(row, 'Accepted answer', blockId, n, findings),
      hint: (row['Clue'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Fill in the Blank', findings);
  return config;
}

function mapScenario(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const promptText = requireField(shared, 'Prompt', blockId, 'prompt', findings);
  const promptItem = { title: (shared.Title || '').trim() || 'Scenario', content: promptText };
  if (!(shared.Title || '').trim()) {
    findings.push(finding('warning', 'synthesized-scenario-title', `Block "${blockId}": the prompt item's title was synthesized from the block's own Title — review before publishing.`));
  }
  const choiceItems = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Choice title', blockId, n, findings),
      content: requireField(row, 'Choice outcome', blockId, n, findings)
    };
  });
  const items = [promptItem, ...choiceItems];
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 2, blockId, 'Scenario', findings);
  return config;
}

function mapProfileCards(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Person name', blockId, n, findings),
      content: requireField(row, 'Description', blockId, n, findings),
      image: optionalPendingMedia(row, 'Image source', blockId, n, 'image'),
      altText: (row['Image alt text'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Profile Cards', findings);
  return config;
}

function mapComparisonMatrix(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const highlightedRaw = (row['Highlighted option'] || '').trim().toLowerCase();
    return {
      title: requireField(row, 'Option title', blockId, n, findings),
      content: requireField(row, 'Option detail', blockId, n, findings),
      highlighted: highlightedRaw === 'yes' || highlightedRaw === 'true'
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 2, blockId, 'Comparison Matrix', findings);
  return config;
}

function mapAudioPlayer(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  // maxItems: 1 — the template's one shared Title doubles as both the block header and this
  // single item's own required title (there is no separate per-item title to give).
  const sharedTitle = requireField(shared, 'Title', blockId, 'shared', findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const sourceNote = requireField(row, 'Audio source', blockId, n, findings);
    return {
      title: sharedTitle,
      content: pendingMediaReference(blockId, n, sourceNote, 'audio'),
      description: (row['Description'] || '').trim(),
      transcript: (row['Transcript'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Learning Audio Player', findings);
  if (items.length > 1) {
    findings.push(finding('warning', 'extra-items-ignored', `Block "${blockId}" (Learning Audio Player) only uses its first item — this component holds exactly one audio track.`));
  }
  return config;
}

function mapVideoPlayer(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  // maxItems: 1 — same single-item/shared-title relationship as Learning Audio Player above.
  const sharedTitle = requireField(shared, 'Title', blockId, 'shared', findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const sourceNote = requireField(row, 'Video source', blockId, n, findings);
    return {
      title: sharedTitle,
      content: pendingMediaReference(blockId, n, sourceNote, 'video'),
      posterImage: optionalPendingMedia(row, 'Poster image', blockId, n, 'image'),
      posterAltText: (row['Poster alt text'] || '').trim(),
      captionsUrl: optionalPendingMedia(row, 'Captions file', blockId, n, 'captions'),
      transcript: (row['Transcript'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Learning Video Player', findings);
  if (items.length > 1) {
    findings.push(finding('warning', 'extra-items-ignored', `Block "${blockId}" (Learning Video Player) only uses its first item — this component holds exactly one video.`));
  }
  return config;
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
      content: pendingMediaReference(blockId, n, sourceNote, 'image'),
      title,
      caption,
      altText: (row['Image alt text'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'header');
  checkMinItems(items, 1, blockId, 'Image Gallery', findings);
  return config;
}

function mapHotspots(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const item = {
      title: requireField(row, 'Item title', blockId, n, findings),
      content: requireField(row, 'Item body', blockId, n, findings),
      x: 50,
      y: 50
    };
    const posRaw = (row['Item position'] || '').trim();
    const match = /(\d+(?:\.\d+)?)\s*%?\s*x[,\s]+(\d+(?:\.\d+)?)\s*%?\s*y/i.exec(posRaw);
    if (match) {
      item.x = Number(match[1]);
      item.y = Number(match[2]);
    } else if (posRaw) {
      findings.push(finding('warning', 'unparseable-position', `Block "${blockId}" item ${n}: "Item position" value "${posRaw}" is not in the expected "N% x, M% y" format — left at the default center position.`));
    } else {
      findings.push(finding('warning', 'missing-position', `Block "${blockId}" item ${n}: no "Item position" given — left at the default center position.`));
    }
    return item;
  });
  const config = { items };
  applySharedHeader(config, shared, 'own');
  config.backgroundImage = optionalPendingMedia(shared, 'Background image', blockId, 'background', 'image');
  config.backgroundAltText = (shared['Background alt text'] || '').trim();
  checkMinItems(items, 1, blockId, 'Hotspots', findings);
  return config;
}

function mapComparisonSlider(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      beforeLabel: requireField(row, 'Before label', blockId, n, findings),
      beforeImage: optionalPendingMedia(row, 'Before image', blockId, `${n}-before`, 'image'),
      beforeAltText: (row['Before alt text'] || '').trim(),
      afterLabel: requireField(row, 'After label', blockId, n, findings),
      afterImage: optionalPendingMedia(row, 'After image', blockId, `${n}-after`, 'image'),
      afterAltText: (row['After alt text'] || '').trim()
    };
  });
  const config = { items };
  applySharedHeader(config, shared, 'own');
  checkMinItems(items, 1, blockId, 'Comparison Slider', findings);
  if (items.length > 1) {
    findings.push(finding('warning', 'extra-items-ignored', `Block "${blockId}" (Comparison Slider) only uses its first item — this component holds exactly one before/after pair.`));
  }
  return config;
}

function mapInteractiveGauge(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = {};
  applySharedHeader(config, shared, 'own');
  const num = (fieldName, key) => {
    const value = requireField(shared, fieldName, blockId, 'shared', findings);
    const parsed = Number(value);
    if (value && !Number.isFinite(parsed)) {
      findings.push(finding('warning', 'invalid-number', `Block "${blockId}": "${fieldName}" value "${value}" is not a number.`));
      return;
    }
    config[key] = parsed;
  };
  num('Minimum', 'minValue');
  num('Maximum', 'maxValue');
  num('Value', 'initialValue');
  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    return {
      title: requireField(row, 'Tier title', blockId, n, findings),
      rangeMin: Number(requireField(row, 'Tier minimum', blockId, n, findings)) || 0,
      rangeMax: Number(requireField(row, 'Tier maximum', blockId, n, findings)) || 0,
      content: requireField(row, 'Tier insight', blockId, n, findings)
    };
  });
  config.items = items;
  checkMinItems(items, 1, blockId, 'Interactive Gauge', findings);
  return config;
}

const INTERACTION_TYPE_MAP = { information: 'information', 'multiple choice': 'multipleChoice' };

function mapInteractiveVideo(blockId, fields, findings) {
  const { shared, itemRows, itemNumbers } = splitFields(fields);
  checkSequentialItemNumbers(itemNumbers, blockId, findings);
  const config = {};
  config.title = requireField(shared, 'Title', blockId, 'shared', findings);
  config.introduction = (shared.Introduction || '').trim();
  const sourceNote = requireField(shared, 'Video source', blockId, 'shared', findings);
  config.videoMediaId = pendingMediaReference(blockId, 'video', sourceNote, 'video');
  config.videoSourceType = 'upload';
  config.captionsUrl = optionalPendingMedia(shared, 'Captions file', blockId, 'captions', 'captions');

  const items = itemNumbers.map(n => {
    const row = itemRows.get(n) || {};
    const typeRaw = (row['Marker type'] || '').trim().toLowerCase();
    const type = INTERACTION_TYPE_MAP[typeRaw];
    if (!type) {
      findings.push(finding('fatal', 'unknown-marker-type', `Block "${blockId}" item ${n}: "Marker type" value "${row['Marker type']}" must be "Information" or "Multiple Choice".`));
    }
    const seconds = parseTimecodeToSeconds(row['Marker time']);
    if (seconds === null) {
      findings.push(finding('fatal', 'required-field-missing', `Block "${blockId}" item ${n}: "Marker time" ("${row['Marker time']}") is not a valid MM:SS timestamp.`));
    }
    const item = {
      type: type || 'information',
      timestamp: seconds || 0,
      title: requireField(row, 'Marker title', blockId, n, findings)
    };
    if (type === 'information') {
      item.body = requireField(row, 'Marker body', blockId, n, findings);
    } else if (type === 'multipleChoice') {
      item.question = requireField(row, 'Question', blockId, n, findings);
      item.answer1Label = requireField(row, 'Correct answer', blockId, n, findings);
      item.correctAnswerIndex = '1';
      findings.push(finding('warning', 'single-answer-marker', `Block "${blockId}" item ${n}: only the correct answer was provided — add distractor options in the Builder before publishing.`));
    }
    return item;
  });
  config.items = items;
  return config;
}

const MAPPERS = {
  accordion: mapAccordion,
  'flip-cards': mapStudyCards,
  'tab-blocks': mapHorizontalTabs,
  hotspots: mapHotspots,
  'button-list': mapButtonList,
  'menu-list': mapReferenceExplorer,
  'multiple-choice': mapMultipleChoice,
  'multiple-select': mapMultipleSelect,
  'sorting-activity': mapSortingActivity,
  'fill-blank': mapFillBlank,
  'vertical-timeline': mapGuidedVerticalTimeline,
  'horizontal-timeline': mapHorizontalTimeline,
  'process-flow': mapGuidedProcess,
  scenario: mapScenario,
  'profile-cards': mapProfileCards,
  'info-grid': mapInfoGrid,
  'pricing-comparison': mapComparisonMatrix,
  'audio-player': mapAudioPlayer,
  'video-frame': mapVideoPlayer,
  'image-gallery': mapImageGallery,
  'interactive-video': mapInteractiveVideo,
  'comparison-slider': mapComparisonSlider,
  'dial-gauge': mapInteractiveGauge,
  'callout-box': mapPolicyAlertCards,
  'card-carousel': mapCardCarousel,
  'confidence-matrix': mapConfidenceMatrix
};

// The exact template field-name strings each type's mapper reads (see the field-name-to-schema
// tables in docs/STORYBOARD-IMPORT-GUIDE.md). Anything in a content record that isn't in this
// set for its type is flagged as an "unmapped-field" finding rather than silently dropped, per
// the reference template's own stated requirement ("SB Template/Rise_Storyboard_All_Components.docx").
const KNOWN_TEMPLATE_FIELDS = {
  accordion: ['Title', 'Introduction', 'Item title', 'Item body'],
  'flip-cards': ['Title', 'Introduction', 'Item title', 'Item body'],
  'tab-blocks': ['Title', 'Introduction', 'Item title', 'Item body'],
  hotspots: ['Title', 'Introduction', 'Background image', 'Background alt text', 'Item title', 'Item body', 'Item position'],
  'button-list': ['Title', 'Introduction', 'Item title', 'Destination URL'],
  'menu-list': ['Title', 'Introduction', 'Item title', 'Item body'],
  'multiple-choice': ['Question', 'Choice text', 'Choice correct', 'Choice feedback'],
  'multiple-select': ['Question', 'Choice text', 'Choice correct', 'Choice feedback'],
  'sorting-activity': ['Title', 'Introduction', 'Category', 'Item title', 'Item description', 'Item category', 'Item explanation'],
  'fill-blank': ['Title', 'Introduction', 'Sentence', 'Accepted answer', 'Clue', 'Feedback'],
  'vertical-timeline': ['Title', 'Introduction', 'Step title', 'Step body'],
  'horizontal-timeline': ['Title', 'Introduction', 'Step title', 'Step body'],
  'process-flow': ['Title', 'Introduction', 'Step title', 'Step body', 'Duration minutes'],
  scenario: ['Title', 'Introduction', 'Prompt', 'Choice title', 'Choice outcome'],
  'profile-cards': ['Title', 'Introduction', 'Person name', 'Description', 'Image source', 'Image alt text'],
  'info-grid': ['Title', 'Introduction', 'Item title', 'Item body'],
  'pricing-comparison': ['Title', 'Introduction', 'Option title', 'Option detail', 'Highlighted option'],
  'audio-player': ['Title', 'Introduction', 'Audio source', 'Description', 'Duration', 'Transcript'],
  'video-frame': ['Title', 'Introduction', 'Video source', 'Poster image', 'Poster alt text', 'Captions file', 'Transcript'],
  'image-gallery': ['Title', 'Introduction', 'Image source', 'Image alt text', 'Image caption'],
  'interactive-video': ['Title', 'Introduction', 'Video source', 'Captions file', 'Marker time', 'Marker type', 'Marker title', 'Marker body', 'Question', 'Correct answer'],
  'comparison-slider': ['Title', 'Introduction', 'Before label', 'Before image', 'Before alt text', 'After label', 'After image', 'After alt text'],
  'dial-gauge': ['Title', 'Introduction', 'Value', 'Minimum', 'Maximum', 'Tier title', 'Tier minimum', 'Tier maximum', 'Tier insight'],
  'callout-box': ['Title', 'Introduction', 'Card title', 'Card body'],
  'card-carousel': ['Title', 'Introduction', 'Card title', 'Card body', 'Card image', 'Card image alt text'],
  'confidence-matrix': ['Title', 'Introduction', 'Item title', 'Item body']
};

function collectUnmappedFieldFindings(contentRecord, componentId, findings) {
  const known = new Set(KNOWN_TEMPLATE_FIELDS[componentId] || []);
  const seen = new Set();
  for (const f of contentRecord.fields) {
    if (known.has(f.field) || seen.has(f.field)) continue;
    seen.add(f.field);
    findings.push(finding('warning', 'unmapped-field', `Block "${contentRecord.blockId}": field "${f.field}" is not used by this component's import mapping — its content was preserved in the source document but not imported.`));
  }
}

/**
 * @param {{ blockId: string, component: string, fields: Array<{field:string,item:number|null,content:string}> }} contentRecord
 * @returns {{ type: string|null, config: any|null, findings: Array<{severity:'fatal'|'warning',code:string,message:string}> }}
 */
export function mapContentRecordToComponent(contentRecord) {
  /** @type {Array<{severity:'fatal'|'warning',code:string,message:string}>} */
  const findings = [];
  const componentId = SUPPORTED_COMPONENT_TYPES[contentRecord.component.trim().toLowerCase()];
  if (!componentId) {
    findings.push(finding('fatal', 'unsupported-import-mapping', `Block "${contentRecord.blockId}": "${contentRecord.component}" does not match a known AT&T Builder component name (field mapping v${FIELD_MAPPING_VERSION}).`));
    return { type: null, config: null, findings };
  }
  const config = MAPPERS[componentId](contentRecord.blockId, contentRecord.fields, findings);
  collectUnmappedFieldFindings(contentRecord, componentId, findings);
  return { type: componentId, config, findings };
}
