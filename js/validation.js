// Production-grade, schema-driven preflight validation. See docs/VALIDATION-RULES.md for
// the full rule catalog, severity definitions, the reasoning behind every rule below, and
// (P05) how to register a new rule — this file's comments point at *what*, that doc
// explains *why* in depth.
//
// Three severities, and only one of them ever blocks export:
//   BLOCKING       — export must not proceed (the output would be broken, empty, or
//                    fundamentally unusable — e.g. no correct answer, empty component).
//   WARNING        — export proceeds; a real, demonstrable defect the author should know
//                    about (missing alt text, insecure URL, insufficient contrast).
//   RECOMMENDATION — export proceeds; a quality/best-practice suggestion, not a defect
//                    (missing hotspot background image, empty per-option feedback).
//
// Two layers:
//   collectSyncIssues(...)  — pure, synchronous, safe to call on every keystroke. Runs
//                             every registered rule except media-existence (needs an
//                             IndexedDB read).
//   runPreflight(...)       — async wrapper: sync issues + the one async rule (broken
//                             media references), for the consolidated preflight panel and
//                             the export gate, where an async round-trip is acceptable.
//
// P05: rules live in a registry (REGISTERED_RULES / registerValidationRule below), not a
// hardcoded conditional chain — see "Rule registry" for the extensibility model this
// replaces the old flat function-call list with. Every result is enriched into a stable
// shape (ruleId, severity, title, explanation, target, fix) before it leaves this module —
// see "Result shape".
//
// Reuses existing, already-tested logic rather than re-implementing it: validateSchemaField
// (js/editor.js) for required/format checks, validateMediaAccessibility (js/media.js) for
// alt-text/transcript checks, resolveThemeTokens + contrastRatio (js/themes.js) for contrast.

import { RECOMMENDED_RICH_LENGTH, RECOMMENDED_TEXT_LENGTH, validateSchemaField } from './field-validation.js';
import { isMediaReference, resolveMediaLimits, validateMediaAccessibility } from './media.js';
import { getMediaRecord } from './media-storage.js';
import { formatItemLabel, normalizeDelimitedLines, sanitizeRichText, sanitizeURL } from './utilities.js';
import { contrastRatio, resolveThemeTokens } from './themes.js';
import { isExportFormatCompletionCompatible } from './compatibility.js';
import { formatExportedFileSize } from './export.js';

// Requirement wording (P02): the one sentence describing what "completion" means here,
// reused verbatim everywhere this is explained — Behavior tab help text, Preflight
// messages, and the export modal — so authors never see two different explanations of
// the same thing.
export const COMPLETION_CLAIM_STATEMENT = 'Require learners to view every item before this component reports completion. Rise course completion support requires the Rise Code Block export and a compatible host configuration.';

export const SEVERITY = Object.freeze({
  BLOCKING: 'blocking',
  WARNING: 'warning',
  RECOMMENDATION: 'recommendation'
});

const CATEGORY = Object.freeze({
  GENERAL: 'general',
  KNOWLEDGE: 'knowledge',
  MEDIA: 'media',
  HOTSPOTS: 'hotspots',
  INTERACTIVE_VIDEO: 'interactive-video',
  AUDIO_PLAYER: 'audio-player',
  VIDEO_FRAME: 'video-frame',
  BRAND: 'brand'
});

// Short, static, human-readable label for each rule — the "title" half of the result
// model (Requirement 1, P05). The detailed, instance-specific text (which field, which
// item, which count) is the separate "explanation". One rule id can still emit issues at
// different severities in different situations (e.g. general-invalid-completion-config) —
// the title describes the rule, the explanation describes the specific case.
const RULE_TITLES = Object.freeze({
  'general-required-field': 'Required field is empty',
  'general-empty-component': 'Component has no content',
  'general-excessive-length': 'Field content is unusually long',
  'general-unsupported-rich-html': 'Unsupported formatting was removed',
  'general-invalid-url': 'Invalid URL',
  'general-missing-accessible-name': 'Missing accessible name',
  'general-missing-alt-text': 'Missing alt text or transcript',
  'general-insufficient-contrast': 'Insufficient color contrast',
  'general-duplicate-items': 'Duplicate item content',
  'general-duplicate-titles': 'Duplicate item titles',
  'general-item-count-exceeded': 'Extra items will not be exported',
  'general-heading-level-outline': "Heading level may conflict with Rise's own outline",
  'general-non-descriptive-link-text': 'Non-descriptive link text',
  'general-external-url-destination': 'Links to an external destination',
  'general-clipping-risk': 'May be clipped in a fixed-height Embed frame',
  'general-clipping-risk-unmeasured': 'Height could not be measured automatically',
  'general-mobile-overflow': 'May overflow on mobile width',
  'general-mobile-overflow-unmeasured': 'Mobile width could not be measured automatically',
  'general-invalid-completion-config': 'Completion tracking configuration issue',
  'general-completion-iframe-format': 'Export format may not report completion',
  'general-completion-export-incompatible': "Selected export format can't report completion",
  'media-unsupported-file-type': 'Unsupported media file type',
  'media-oversized-file': 'Media file exceeds size limit',
  'media-external-asset-dependency': 'External media URL, not an uploaded file',
  'media-insecure-http-url': 'Insecure media URL',
  'media-broken-reference': 'Uploaded media file is missing',
  'knowledge-no-correct-answer': 'No correct answer marked',
  'knowledge-impossible-passing': 'Knowledge check can never be passed',
  'knowledge-multiple-correct-single-allowed': 'Multiple correct answers on a single-answer question',
  'knowledge-duplicate-options': 'Duplicate answer option wording',
  'knowledge-empty-feedback': 'Missing answer feedback',
  'hotspot-missing-image': 'No background image set',
  'hotspot-out-of-range-position': 'Hotspot position out of range',
  'hotspot-overlapping': 'Hotspots may overlap',
  'hotspot-keyboard-accessibility': 'Hotspots share the same label',
  'interactive-video-near-duplicate-timestamps': 'Markers are very close together',
  'interactive-video-marker-near-edge': 'Marker is close to the start or end of the video',
  'interactive-video-marker-outside-duration': 'Marker timestamp is past the video duration',
  'interactive-video-required-never-pauses': 'Required marker never pauses the video',
  'interactive-video-non-direct-video-url': 'External video URL is a hosting page, not a direct file',
  'interactive-video-uploaded-media-export-format': 'Uploaded video/captions need the Web Package ZIP export format',
  'audio-player-invalid-chapter-line': 'Chapter row has an invalid timestamp or missing title',
  'audio-player-duplicate-chapter-timestamps': 'Two chapters share the same timestamp',
  'audio-player-invalid-transcript-segment': 'Synchronized transcript row has an invalid timestamp',
  'video-frame-invalid-chapter-line': 'Chapter row has an invalid timestamp or missing title',
  'video-frame-duplicate-chapter-timestamps': 'Two chapters share the same timestamp',
  'video-frame-invalid-transcript-segment': 'Synchronized transcript row has an invalid timestamp',
  'brand-color-literal': 'Color literal is not an approved AT&T brand token',
  'brand-font-family': 'Font family is not AT&T Aleck',
  'brand-font-size-floor': 'Learner-facing body text is below 16px floor',
  'brand-icon-source': 'Non-library icon or emoji character used',
  'brand-contrast-ratio': 'Color contrast below WCAG AA standards',
  'brand-focus-visible': 'Missing focus-visible outline on interactive element',
  // Phase 5: Component-specific rules
  'scenario-dead-end-scene': 'Scenario choice leads to a dead end',
  'scenario-unreachable-scene': 'Scenario scene is unreachable from the start',
  'scenario-no-ending-state': 'Scenario has no ending state',
  'scenario-circular-branch': 'Scenario branches form a cycle with no exit',
  'comparison-slider-missing-before-image': 'Comparison Slider missing "Before" image',
  'comparison-slider-missing-after-image': 'Comparison Slider missing "After" image',
  'flip-cards-study-mode-incomplete': 'Study Mode enabled but cards have incomplete front/back pairs',
  'accordion-sequential-expand-contradiction': 'Sequential mode is incompatible with Expand All control',
  'fill-blank-fuzzy-no-answers': 'Fuzzy match with a very short accepted answer risks false positives',
  'sorting-activity-single-category': 'Sorting activity needs at least two categories'
});

function issue(ruleId, severity, category, explanation, extra = {}) {
  return { ruleId, severity, category, explanation, fieldId: extra.fieldId ?? null, itemIndex: extra.itemIndex ?? null };
}

/**
 * Result shape (Requirement 1, P05): every issue leaving this module — from
 * collectSyncIssues, runPreflight, or checkCompletionExportFormatIssue — has been passed
 * through this enrichment, so callers never need to special-case which rule produced a
 * result. `fieldId`/`itemIndex` stay at the top level too (existing call sites read them
 * directly); `target`/`fix` are additive, structured equivalents.
 *   - title: short, static, rule-level label (RULE_TITLES, falling back to the owning
 *     registry entry's own `title`, then the ruleId itself so nothing is ever blank).
 *   - explanation: the detailed, instance-specific text (was called `message`).
 *   - target: `{ componentId, itemIndex, fieldId }` — where in the config this issue lives.
 *   - fix: `{ type, label }` when there's something to navigate to (a field, or at least
 *     the item card), else `null`. `itemIndex` alone (no `fieldId`) still gets a fix action
 *     — jumpToPreflightField (app.js) already falls back to focusing the item card itself
 *     when there's no more specific field to target.
 */
function enrichIssue(rawIssue, componentId, ruleTitle) {
  const hasField = rawIssue.fieldId !== null && rawIssue.fieldId !== undefined;
  const hasItem = rawIssue.itemIndex !== null && rawIssue.itemIndex !== undefined;
  return {
    ...rawIssue,
    title: RULE_TITLES[rawIssue.ruleId] || ruleTitle || rawIssue.ruleId,
    target: { componentId: componentId ?? null, itemIndex: rawIssue.itemIndex, fieldId: rawIssue.fieldId },
    fix: hasField || hasItem
      ? { type: hasField ? 'goToField' : 'goToItem', label: hasField ? 'Go to field' : 'Go to item' }
      : null
  };
}

function plainText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function isEmptyValue(value) {
  return value === undefined || value === null || plainText(value) === '';
}

// ---------------------------------------------------------------------------
// General rules
// ---------------------------------------------------------------------------

function checkRequiredFields(schema, config) {
  const issues = [];
  (schema.componentFields || []).forEach(field => {
    validateSchemaField(field, config[field.id], []).forEach(message => {
      issues.push(issue('general-required-field', SEVERITY.BLOCKING, CATEGORY.GENERAL, message, { fieldId: field.id }));
    });
  });
  // `requiredOne` fields (e.g. multiple-choice's radio-group "correct answer") are a
  // cross-item constraint — check them once for the whole collection, not once per item,
  // or the same "select one X" message would repeat once per item.
  const items = config.items || [];
  (schema.itemFields || []).filter(field => field.requiredOne).forEach(field => {
    validateSchemaField(field, undefined, items).forEach(message => {
      issues.push(issue('general-required-field', SEVERITY.BLOCKING, CATEGORY.GENERAL, message, { fieldId: field.id }));
    });
  });
  items.forEach((item, itemIndex) => {
    (schema.itemFields || []).filter(field => !field.requiredOne).forEach(field => {
      validateSchemaField(field, item[field.id], items).forEach(message => {
        issues.push(issue('general-required-field', SEVERITY.BLOCKING, CATEGORY.GENERAL, message, { fieldId: field.id, itemIndex }));
      });
    });
  });
  return issues;
}

function checkEmptyComponent(schema, config) {
  const items = Array.isArray(config.items) ? config.items : [];
  const minItems = schema.minItems || 0;
  if (items.length >= minItems) return [];
  const label = (schema.itemLabel || 'item').toLowerCase();
  return [issue('general-empty-component', SEVERITY.BLOCKING, CATEGORY.GENERAL,
    `Add at least ${minItems} ${label}${minItems === 1 ? '' : 's'} — this component has none of the content it needs to render.`)];
}

// Fields with an explicit maxLength are already hard-capped (a Blocking, save-time
// concern handled by checkRequiredFields' reuse of validateSchemaField, which includes
// the maxLength check). This rule is the *soft* heuristic for fields with no declared
// limit — long-form richtext/textarea content that's still technically valid but likely
// to overflow the fixed-width block layout, or a short text/select field that's
// unusually long for what's meant to be a short label.
function checkExcessiveLength(schema, config) {
  const issues = [];
  const checkField = (field, value, itemIndex) => {
    if (field.maxLength || isEmptyValue(value)) return; // already hard-capped, or nothing to measure
    const length = plainText(value).length;
    if (['text', 'select'].includes(field.type) && length > RECOMMENDED_TEXT_LENGTH) {
      issues.push(issue('general-excessive-length', SEVERITY.WARNING, CATEGORY.GENERAL,
        `${field.label} is ${length} characters — unusually long for a short label field.`, { fieldId: field.id, itemIndex }));
    } else if (['textarea', 'richtext'].includes(field.type) && length > RECOMMENDED_RICH_LENGTH) {
      issues.push(issue('general-excessive-length', SEVERITY.RECOMMENDATION, CATEGORY.GENERAL,
        `${field.label} is ${length} characters — consider splitting this into multiple items for readability.`, { fieldId: field.id, itemIndex }));
    }
  };
  (schema.componentFields || []).forEach(field => checkField(field, config[field.id], null));
  (config.items || []).forEach((item, itemIndex) => (schema.itemFields || []).forEach(field => checkField(field, item[field.id], itemIndex)));
  return issues;
}

function checkUnsupportedRichHtml(schema, config) {
  const issues = [];
  const checkField = (field, value, itemIndex) => {
    if (field.type !== 'richtext' || isEmptyValue(value)) return;
    const sanitized = sanitizeRichText(value);
    // sanitizeRichText is idempotent on already-clean, fully-supported input (it round-trips
    // to the exact same string); a difference means the author's markup contained something
    // outside the supported allowlist (see js/utilities.js#sanitizeRichText) that was
    // escaped into visible text or otherwise altered on save.
    if (sanitized !== value) {
      issues.push(issue('general-unsupported-rich-html', SEVERITY.WARNING, CATEGORY.GENERAL,
        `${field.label} contains formatting or markup that isn't supported and was removed on save.`, { fieldId: field.id, itemIndex }));
    }
  };
  (schema.componentFields || []).forEach(field => checkField(field, config[field.id], null));
  (config.items || []).forEach((item, itemIndex) => (schema.itemFields || []).forEach(field => checkField(field, item[field.id], itemIndex)));
  return issues;
}

function checkInvalidUrls(schema, config) {
  const issues = [];
  const checkField = (field, value, itemIndex) => {
    if (field.type !== 'url' || isEmptyValue(value) || isMediaReference(value)) return;
    if (!sanitizeURL(value)) {
      issues.push(issue('general-invalid-url', SEVERITY.BLOCKING, CATEGORY.GENERAL,
        `${field.label} is not a valid http(s) URL.`, { fieldId: field.id, itemIndex }));
    }
  };
  (schema.componentFields || []).forEach(field => checkField(field, config[field.id], null));
  (config.items || []).forEach((item, itemIndex) => (schema.itemFields || []).forEach(field => checkField(field, item[field.id], itemIndex)));
  return issues;
}

function checkMissingAccessibleName(config) {
  if (!isEmptyValue(config.blockHeadline)) return [];
  return [issue('general-missing-accessible-name', SEVERITY.BLOCKING, CATEGORY.GENERAL,
    'The block headline is empty. It is used as this component\'s accessible name for screen readers navigating by region — it cannot be blank.',
    { fieldId: 'blockHeadline' })];
}

function checkMissingAltText(config, componentId) {
  return validateMediaAccessibility(config, componentId).map(message =>
    issue('general-missing-alt-text', SEVERITY.WARNING, CATEGORY.GENERAL, message));
}

// WCAG 2.x 1.4.3: "large text" gets a relaxed 3:1 minimum instead of 4.5:1 — 18pt (24px)
// at any weight, or 14pt (18.66px) at bold (700+). (P07) Exported as a standalone,
// pure function so the threshold math is directly unit-testable without a theme/DOM.
export function requiredContrastRatio(fontSizePx, fontWeight = 400) {
  const isLarge = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return isLarge ? 3 : 4.5;
}

// Checks the pairs actually rendered by every generated component (js/export-shell.js's
// BASE_RESET_CSS/shared chrome plus the component's own card): body text on the card
// background, muted text on the card background, and button text on the primary color.
// This is a focused subset of js/themes.js#validateThemeContrast (which checks the full
// theme-manager token set) — validation is scoped to what this specific component
// actually displays, using its fully resolved (theme + per-component override) colors.
//
// fontSize/fontWeight (P07) are the actual rendered values for these roles, surveyed
// across the catalog (e.g. components/accordion.js's .accordion-trigger/.accordion-body,
// components/multiple-choice.js's .quiz-submit-btn) — every component's implementation of
// each role sits well under the WCAG large-text bar today (13-14px, none at 700+/18.66px+),
// so requiredContrastRatio() below currently always resolves to 4.5:1 for all three. The
// values are still tracked explicitly rather than hardcoding "always 4.5" so this check
// stays *correct by construction* if a future theme/component ever pushed one of these
// roles into large-text territory, instead of silently under- or over-flagging it.
const CONTRAST_PAIRS = [
  { label: 'Body text on card background', fg: 'text', bg: 'surface', fontSizePx: 14, fontWeight: 600 },
  { label: 'Muted text on card background', fg: 'mutedText', bg: 'surface', fontSizePx: 13, fontWeight: 400 },
  { label: 'Button text on primary color', fg: 'surface', bg: 'primary', fontSizePx: 13, fontWeight: 600 }
];

function checkColorContrast(theme, componentOverrides) {
  const tokens = resolveThemeTokens(theme, componentOverrides);
  return CONTRAST_PAIRS.flatMap(({ label, fg, bg, fontSizePx, fontWeight }) => {
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    const required = requiredContrastRatio(fontSizePx, fontWeight);
    if (ratio >= required) return [];
    return [issue('general-insufficient-contrast', SEVERITY.WARNING, CATEGORY.GENERAL,
      `${label} has a contrast ratio of ${ratio.toFixed(2)}:1, below the WCAG AA minimum of ${required}:1 for ${required === 3 ? 'large' : 'normal'} text.`)];
  });
}

function primaryFieldValue(schema, item) {
  const field = (schema.itemFields || []).find(candidate => ['title', 'label'].includes(candidate.id));
  return field ? plainText(item[field.id]).toLowerCase() : '';
}

function checkDuplicateItems(schema, config) {
  const items = Array.isArray(config.items) ? config.items : [];
  const secondaryField = (schema.itemFields || []).find(field => field.id === 'content');
  const seen = new Map();
  const issues = [];
  items.forEach((item, itemIndex) => {
    const primary = primaryFieldValue(schema, item);
    const secondary = secondaryField ? plainText(item[secondaryField.id]).toLowerCase() : '';
    if (!primary) return;
    const key = `${primary}::${secondary}`;
    if (seen.has(key)) {
      issues.push(issue('general-duplicate-items', SEVERITY.WARNING, CATEGORY.GENERAL,
        `${formatItemLabel(schema, itemIndex)} appears to duplicate ${formatItemLabel(schema, seen.get(key))} — same title and content.`,
        { itemIndex }));
    } else {
      seen.set(key, itemIndex);
    }
  });
  return issues;
}

// Same title, *different* content — a distinct concern from checkDuplicateItems above
// (same title AND same content). Two items titled identically but saying different things
// are ambiguous to navigate by title alone (a sighted user scanning headings, or a
// screen-reader user jumping by heading/label), even though nothing is technically broken.
// Skipped for components already covered by a more specific duplicate-label rule
// (knowledge-check's answer options, hotspot pin labels) so the same pair of items never
// gets flagged twice under two different rule ids.
function checkDuplicateTitles(schema, config, componentId) {
  if (KNOWLEDGE_CHECK_COMPONENTS.has(componentId) || componentId === 'hotspots') return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const secondaryField = (schema.itemFields || []).find(field => field.id === 'content');
  const seenTitles = new Map();
  const issues = [];
  items.forEach((item, itemIndex) => {
    const primary = primaryFieldValue(schema, item);
    if (!primary) return;
    const secondary = secondaryField ? plainText(item[secondaryField.id]).toLowerCase() : '';
    if (seenTitles.has(primary)) {
      const firstIndex = seenTitles.get(primary);
      const firstSecondary = secondaryField ? plainText(items[firstIndex][secondaryField.id]).toLowerCase() : '';
      if (secondary !== firstSecondary) {
        issues.push(issue('general-duplicate-titles', SEVERITY.WARNING, CATEGORY.GENERAL,
          `${formatItemLabel(schema, itemIndex)}'s title matches ${formatItemLabel(schema, firstIndex)}'s, even though their content differs — this can be confusing for a learner navigating by title alone.`,
          { itemIndex }));
      }
    } else {
      seenTitles.set(primary, itemIndex);
    }
  });
  return issues;
}

// Component-level item-count ceiling (Requirement, P06) — schema.maxItems (js/editor-schemas.js)
// already prevents authoring past this limit through the normal "Add Item"/"Duplicate"
// buttons (js/editor.js, app.js#updateAddItemButtonState), but a hand-edited or imported
// project file can still carry more items than that. The generator for a maxItems: 1
// component (audio-player, video-frame) only ever renders items[0] — anything beyond the
// limit is silently dropped from the export with no other signal that it happened.
function checkItemCountLimits(schema, config) {
  const items = Array.isArray(config.items) ? config.items : [];
  if (!Number.isInteger(schema.maxItems) || items.length <= schema.maxItems) return [];
  const label = (schema.itemLabel || 'item').toLowerCase();
  const extra = items.length - schema.maxItems;
  return [issue('general-item-count-exceeded', SEVERITY.WARNING, CATEGORY.GENERAL,
    `This component only uses the first ${schema.maxItems} ${label}${schema.maxItems === 1 ? '' : 's'} — ${extra} extra ${extra === 1 ? 'entry is' : 'entries are'} present but will not appear in the exported output.`)];
}

// Rise 360 lesson pages already have their own h1 (js/utilities.js#HEADING_LEVELS'
// comment) — an author-selected h1 here creates a second, competing h1 in the host page's
// heading outline, which is confusing for a screen-reader user navigating heading-by-heading.
function checkHeadingLevelOutline(config) {
  if (config.blockHeadingLevel !== 'h1') return [];
  return [issue('general-heading-level-outline', SEVERITY.WARNING, CATEGORY.GENERAL,
    'The headline heading level is set to Heading 1 (h1). Rise 360 lesson pages already have their own h1 — an additional h1 here can create a confusing, duplicate heading outline for screen-reader users navigating by heading. Heading 2 (h2) is the recommended default.',
    { fieldId: 'blockHeadingLevel' })];
}

// A deliberately conservative, documented heuristic (Implementation note 2, P06) — flags
// only the small set of phrases accessibility guidance (WCAG SC 2.4.4) most consistently
// cites as non-descriptive out of context, not every vague-sounding label. Scoped to
// button-list specifically: its items are a bare {label, URL} pair with no surrounding
// descriptive text, so the button's own label is the *only* thing telling a screen-reader
// user (who may be navigating a page's links out of context) where it goes.
const NON_DESCRIPTIVE_LINK_PHRASES = new Set([
  'click here', 'click', 'here', 'this link', 'link', 'read more', 'more', 'more info'
]);

function checkNonDescriptiveLinkText(componentId, config) {
  if (componentId !== 'button-list') return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];
  items.forEach((item, itemIndex) => {
    if (isEmptyValue(item.content)) return;
    const label = plainText(item.title).toLowerCase();
    if (NON_DESCRIPTIVE_LINK_PHRASES.has(label)) {
      issues.push(issue('general-non-descriptive-link-text', SEVERITY.WARNING, CATEGORY.GENERAL,
        `"${plainText(item.title)}" doesn't describe where this link goes on its own — a screen-reader user often navigates by jumping between link labels out of context. Use a label that describes the destination (e.g. "Download the study guide" instead of "Click here").`,
        { fieldId: 'title', itemIndex }));
    }
  });
  return issues;
}

// Not a defect — every genuinely external destination gets the same advisory, so an
// author can double-check a URL (a mistyped domain, a stale link) before publishing. Scoped
// to every `url`-type field a schema declares (schema-driven, like checkInvalidUrls above),
// excluding media references (those get their own, more specific media-* rules). Shows
// `sanitizeURL`'s own canonicalized value, never the raw authored string, so what's
// displayed is exactly what the export would actually use.
function checkExternalUrlDestinations(schema, config) {
  const issues = [];
  const urlFields = [...(schema.componentFields || []), ...(schema.itemFields || [])].filter(field => field.type === 'url');
  const checkField = (field, value, itemIndex) => {
    if (isEmptyValue(value) || isMediaReference(value)) return;
    const safe = sanitizeURL(value);
    if (!safe) return; // invalid URLs are already Blocking via general-invalid-url
    issues.push(issue('general-external-url-destination', SEVERITY.WARNING, CATEGORY.GENERAL,
      `${field.label} points to ${safe} — confirm this is the destination you intend before publishing.`, { fieldId: field.id, itemIndex }));
  };
  urlFields.forEach(field => checkField(field, config[field.id], null));
  (config.items || []).forEach((item, itemIndex) => urlFields.filter(field => (schema.itemFields || []).includes(field))
    .forEach(field => checkField(field, item[field.id], itemIndex)));
  return issues;
}

function checkCompletionConfig(config, settings) {
  const issues = [];
  if (!config.trackCompletion) return issues;
  const items = Array.isArray(config.items) ? config.items : [];
  if (items.length === 0) {
    issues.push(issue('general-invalid-completion-config', SEVERITY.BLOCKING, CATEGORY.GENERAL,
      'Completion tracking is required, but there are no items to track — this block can never be completed.', { fieldId: 'trackCompletion' }));
  }
  if (isEmptyValue(config.completionMsg)) {
    issues.push(issue('general-invalid-completion-config', SEVERITY.WARNING, CATEGORY.GENERAL,
      'Completion tracking is on, but the completion message is empty — a default message will be used instead.', { fieldId: 'completionMsg' }));
  }
  if (settings && !settings.completionParentOrigin) {
    issues.push(issue('general-invalid-completion-config', SEVERITY.RECOMMENDATION, CATEGORY.GENERAL,
      'Optional: Builder Settings has an "Expected parent frame origin" field for extra security. Most authors can leave it blank.'));
  }
  issues.push(issue('general-completion-iframe-format', SEVERITY.WARNING, CATEGORY.GENERAL,
    `${COMPLETION_CLAIM_STATEMENT} Use "Copy for Rise" in the Export panel — the Iframe Snippet and Web Package ZIP formats are not confirmed to report completion.`));
  return issues;
}

/**
 * Central Preflight blocking check (Requirement 4, P02) for a specific export format the
 * author is actively about to use (e.g. the Advanced "Iframe Snippet" or "Web Package ZIP"
 * pane). Unlike checkCompletionConfig above — which fires an informational Warning with no
 * format context — this is Blocking, because a specific, incompatible format has actually
 * been selected. Not part of the rule registry below (it needs an `exportFormat` argument
 * the registry's `check(ctx)` signature doesn't carry, and it runs at a different time —
 * once a format is chosen, not during general preflight); called directly wherever a
 * specific format is about to be used. Still passed through the same enrichIssue() as
 * every registry result, so its shape is identical (Requirement 1, P05).
 * js/compatibility.js#isExportFormatCompletionCompatible is the single source of truth
 * this defers to.
 */
export function checkCompletionExportFormatIssue(config, exportFormat) {
  if (!config.trackCompletion || !exportFormat) return null;
  if (isExportFormatCompletionCompatible(exportFormat)) return null;
  const raw = issue('general-completion-export-incompatible', SEVERITY.BLOCKING, CATEGORY.GENERAL,
    `${COMPLETION_CLAIM_STATEMENT} This export format doesn't. Use "Copy for Rise" in the main panel instead.`);
  return enrichIssue(raw, null, RULE_TITLES['general-completion-export-incompatible']);
}

// ---------------------------------------------------------------------------
// Media rules — schema-driven: scans every image/audio/video field, regardless of
// which component owns it, rather than a hardcoded per-component list.
// ---------------------------------------------------------------------------

const MEDIA_MIME_ALLOWLIST = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'],
  video: ['video/mp4', 'video/webm']
};

function mediaFields(schema) {
  return [...(schema.componentFields || []), ...(schema.itemFields || [])].filter(field => ['image', 'audio', 'video'].includes(field.type));
}

function checkMediaRules(schema, config, settings) {
  const issues = [];
  const limits = resolveMediaLimits(settings?.mediaLimitsMb);
  const checkOne = (field, value, itemIndex) => {
    if (isEmptyValue(value)) return;
    if (isMediaReference(value)) {
      const allowlist = MEDIA_MIME_ALLOWLIST[value.kind] || MEDIA_MIME_ALLOWLIST[field.type];
      if (allowlist && !allowlist.includes(value.mimeType)) {
        issues.push(issue('media-unsupported-file-type', SEVERITY.BLOCKING, CATEGORY.MEDIA,
          `${field.label}: "${value.mimeType}" is not a supported ${field.type} type for export.`, { fieldId: field.id, itemIndex }));
      }
      if (Number.isFinite(value.size) && value.size > limits[field.type]) {
        // (P07) Show the actual measured size and the configured threshold, not just "too
        // big" — both formatExportedFileSize (js/export.js) and limits (js/media.js's
        // resolveMediaLimits, driven by Builder Settings) already carry real byte values.
        issues.push(issue('media-oversized-file', SEVERITY.WARNING, CATEGORY.MEDIA,
          `${field.label} is ${formatExportedFileSize(value.size)} — larger than the configured ${formatExportedFileSize(limits[field.type])} ${field.type} limit and may block single-file export or slow the page down.`, { fieldId: field.id, itemIndex }));
      }
    } else if (typeof value === 'string' && !value.startsWith('data:')) {
      issues.push(issue('media-external-asset-dependency', SEVERITY.RECOMMENDATION, CATEGORY.MEDIA,
        `${field.label} references an external URL rather than an uploaded file — it will require network access after export and won't travel with the exported file.`,
        { fieldId: field.id, itemIndex }));
      if (value.trim().toLowerCase().startsWith('http://')) {
        issues.push(issue('media-insecure-http-url', SEVERITY.WARNING, CATEGORY.MEDIA,
          `${field.label} uses an insecure http:// URL — browsers may block it as mixed content on an https page.`, { fieldId: field.id, itemIndex }));
      }
    }
  };

  const fields = mediaFields(schema);
  fields.forEach(field => checkOne(field, config[field.id], null));
  (config.items || []).forEach((item, itemIndex) => {
    fields.filter(field => (schema.itemFields || []).includes(field)).forEach(field => checkOne(field, item[field.id], itemIndex));
    if (item?.media && item.media.type && item.media.type !== 'none') {
      const m = item.media;
      const mediaVal = m.mediaId ? { mediaId: m.mediaId, kind: m.type, source: 'upload', name: m.fileName || 'uploaded media', mimeType: m.mimeType, schemaVersion: 1, size: 0, createdAt: new Date().toISOString() } : m.src;
      checkOne({ id: 'media', label: `Item ${itemIndex + 1} media`, type: m.type }, mediaVal, itemIndex);
      if (m.type === 'image' && !m.decorative && (!m.alt || !String(m.alt).trim())) {
        issues.push(issue('general-missing-alt-text', SEVERITY.WARNING, CATEGORY.MEDIA,
          `Item ${itemIndex + 1} image is missing alternative text. Add descriptive alt text or mark it decorative.`, { fieldId: 'media', itemIndex }));
      }
    }
  });
  return issues;
}

async function checkBrokenMediaReferences(schema, config, mediaStore) {
  const issues = [];
  const checkOne = async (field, value, itemIndex) => {
    if (!isMediaReference(value)) return;
    const record = await getMediaRecord(value.mediaId, mediaStore);
    if (record?.blob) return;
    const severity = field.required ? SEVERITY.BLOCKING : SEVERITY.WARNING;
    issues.push(issue('media-broken-reference', severity, CATEGORY.MEDIA,
      `${field.label}: "${value.name}" is missing from local storage and cannot be exported.`, { fieldId: field.id, itemIndex }));
  };

  const fields = mediaFields(schema);
  await Promise.all(fields.map(field => checkOne(field, config[field.id], null)));
  await Promise.all((config.items || []).flatMap((item, itemIndex) => {
    const list = fields.filter(field => (schema.itemFields || []).includes(field)).map(field => checkOne(field, item[field.id], itemIndex));
    if (item?.media?.mediaId) {
      list.push(checkOne({ id: 'media', label: `Item ${itemIndex + 1} media`, type: item.media.type }, { mediaId: item.media.mediaId, name: item.media.fileName || 'uploaded media', source: 'upload', schemaVersion: 1, kind: item.media.type, mimeType: item.media.mimeType, size: 0, createdAt: new Date().toISOString() }, itemIndex));
    }
    return list;
  }));
  return issues;
}

// ---------------------------------------------------------------------------
// DOM-measurement rules (P07) — clipping risk and mobile overflow. Unlike every rule
// above, these can't be computed from config data alone; they need `ctx.domMeasurement`,
// a value only `runPreflight` (never collectSyncIssues's per-keystroke path) populates,
// via js/dom-measurement.js#measureRenderedDimensions called from app.js. Kept as pure
// functions taking an already-resolved measurement (or null/undefined) so the threshold
// logic itself is unit-testable without a real DOM or iframe.
//
// Both are explicit heuristics, not certainties (Requirement 3): measured in a hidden
// iframe inside this app, not inside Rise's own sandbox, so real-world results can differ
// (font rendering, host page zoom, Rise's own chrome around the block). Every result —
// pass, fail, or "couldn't measure" — says so, and a failed/unavailable measurement
// becomes an explicit manual-check Recommendation rather than a silent pass
// (Requirement 5).
// ---------------------------------------------------------------------------

// The Web Package ZIP is hosted by URL and placed in a Rise Embed block, which is a
// fixed-height frame the author sizes. 500px is a typical frame height (and the height the
// retired Iframe Snippet export used) — a rough bar, not a property of any current export.
// "Copy for Rise" (the HTML fragment) has no frame and expands with its content, so this
// rule never applies to it.
const EMBED_FRAME_TYPICAL_HEIGHT_PX = 500;
// Small buffer so a few px of sub-pixel/font-rendering rounding doesn't false-positive.
const CLIPPING_RISK_MARGIN_PX = 20;

function checkClippingRisk(measurement) {
  if (!measurement || measurement.desktopContentHeight == null) {
    return [issue('general-clipping-risk-unmeasured', SEVERITY.RECOMMENDATION, CATEGORY.GENERAL,
      `This component's rendered height couldn't be automatically measured. If you use the Web Package ZIP in a Rise Embed block (a fixed-height frame), manually check in Rise's own preview that the block isn't clipped or forced to scroll. Applies to the Web Package ZIP only; "Copy for Rise" expands with its content.`)];
  }
  if (measurement.desktopContentHeight <= EMBED_FRAME_TYPICAL_HEIGHT_PX + CLIPPING_RISK_MARGIN_PX) return [];
  return [issue('general-clipping-risk', SEVERITY.WARNING, CATEGORY.GENERAL,
    `Heuristic: with every collapsed section opened, this component is about ${Math.round(measurement.desktopContentHeight)}px tall at desktop width — taller than a typical ${EMBED_FRAME_TYPICAL_HEIGHT_PX}px Embed frame. This matters only for the Web Package ZIP, which Rise shows in a fixed-height Embed block: set that block's height to at least ${Math.ceil(measurement.desktopContentHeight / 10) * 10}px or the content will be clipped or scroll inside the frame. "Copy for Rise" (the HTML fragment) expands with its content and is not affected. Measured in this Builder's own preview, not inside Rise itself — confirm in Rise's own preview before publishing.`)];
}

// Matches js/device-preview.js's 'mobile' DEVICE_MODES width (375px) so this rule and the
// Builder's own Mobile preview mode can never disagree about which width "mobile" means.
const MOBILE_OVERFLOW_WIDTH_PX = 375;
// Matches the tolerance tests/e2e/preview-device-modes.spec.js already uses for the same
// scrollWidth-vs-clientWidth measurement, so the two systems apply the same bar.
const MOBILE_OVERFLOW_TOLERANCE_PX = 2;

function checkMobileOverflow(measurement) {
  if (!measurement || measurement.mobileOverflowPx == null) {
    return [issue('general-mobile-overflow-unmeasured', SEVERITY.RECOMMENDATION, CATEGORY.GENERAL,
      `This component's width at ${MOBILE_OVERFLOW_WIDTH_PX}px (mobile) couldn't be automatically measured. Manually check the Mobile preview width in this Builder, and Rise's own mobile preview, for horizontal scrolling or clipped content.`)];
  }
  if (measurement.mobileOverflowPx <= MOBILE_OVERFLOW_TOLERANCE_PX) return [];
  const culprit = measurement.mobileOffender
    ? ` The widest element is <${measurement.mobileOffender.tag}${measurement.mobileOffender.cls ? `.${measurement.mobileOffender.cls}` : ''}>, about ${measurement.mobileOffender.overflowPx}px past the edge.`
    : '';
  return [issue('general-mobile-overflow', SEVERITY.WARNING, CATEGORY.GENERAL,
    `Heuristic: this component overflows its container by about ${Math.round(measurement.mobileOverflowPx)}px at ${MOBILE_OVERFLOW_WIDTH_PX}px width (mobile), which can force horizontal scrolling on a phone. Every collapsed section was opened for this measurement.${culprit} Measured in this Builder's own preview — confirm in Rise's own mobile preview before publishing.`)];
}

// ---------------------------------------------------------------------------
// Knowledge-check rules — scoped to components with an item-level `correct` boolean
// (multiple-choice, multiple-select); sorting-activity/fill-blank have a different
// correctness shape (a category match / a text answer) and are covered by the general
// rules (required fields, empty component) plus their own component.validate().
// ---------------------------------------------------------------------------

const KNOWLEDGE_CHECK_COMPONENTS = new Set(['multiple-choice', 'multiple-select']);

function checkKnowledgeCheckRules(componentId, schema, config) {
  if (!KNOWLEDGE_CHECK_COMPONENTS.has(componentId)) return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];
  const correctCount = items.filter(item => item.correct === true).length;

  if (correctCount === 0) {
    issues.push(issue('knowledge-no-correct-answer', SEVERITY.BLOCKING, CATEGORY.KNOWLEDGE,
      'No answer option is marked correct.', { fieldId: 'correct' }));
    if (items.length >= 2) {
      issues.push(issue('knowledge-impossible-passing', SEVERITY.BLOCKING, CATEGORY.KNOWLEDGE,
        'As configured, no possible learner selection can pass this knowledge check — at least one option must be marked correct.'));
    }
  }
  if (componentId === 'multiple-choice' && correctCount > 1) {
    issues.push(issue('knowledge-multiple-correct-single-allowed', SEVERITY.BLOCKING, CATEGORY.KNOWLEDGE,
      `${correctCount} options are marked correct, but this is a single-answer question — only one is allowed.`, { fieldId: 'correct' }));
  }

  const seenLabels = new Map();
  items.forEach((item, itemIndex) => {
    const label = plainText(item.label).toLowerCase();
    if (!label) return;
    if (seenLabels.has(label)) {
      issues.push(issue('knowledge-duplicate-options', SEVERITY.WARNING, CATEGORY.KNOWLEDGE,
        `Option ${itemIndex + 1} duplicates the wording of option ${seenLabels.get(label) + 1}.`, { fieldId: 'label', itemIndex }));
    } else {
      seenLabels.set(label, itemIndex);
    }
    if (isEmptyValue(item.content)) {
      issues.push(issue('knowledge-empty-feedback', SEVERITY.RECOMMENDATION, CATEGORY.KNOWLEDGE,
        `Option ${itemIndex + 1} has no feedback text — learners won't see an explanation when they choose it.`, { fieldId: 'content', itemIndex }));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Hotspot rules
// ---------------------------------------------------------------------------

// "Overlapping" — pins within this percentage-distance of each other are visually hard
// to tell apart / click independently at typical block widths.
const HOTSPOT_OVERLAP_THRESHOLD = 3;

function checkHotspotRules(componentId, config) {
  if (componentId !== 'hotspots') return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];

  if (isEmptyValue(config.backgroundImage)) {
    issues.push(issue('hotspot-missing-image', SEVERITY.RECOMMENDATION, CATEGORY.HOTSPOTS,
      'No background image is set — a generic schematic placeholder will be used instead of your own image.', { fieldId: 'backgroundImage' }));
  }

  const positions = [];
  items.forEach((item, itemIndex) => {
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      issues.push(issue('hotspot-out-of-range-position', SEVERITY.BLOCKING, CATEGORY.HOTSPOTS,
        `Hotspot ${itemIndex + 1}'s position is out of the valid 0–100% range and will render incorrectly or off-frame.`, { fieldId: 'x', itemIndex }));
      return;
    }
    positions.push({ itemIndex, x, y });
  });

  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const a = positions[i];
      const b = positions[j];
      if (Math.abs(a.x - b.x) <= HOTSPOT_OVERLAP_THRESHOLD && Math.abs(a.y - b.y) <= HOTSPOT_OVERLAP_THRESHOLD) {
        issues.push(issue('hotspot-overlapping', SEVERITY.WARNING, CATEGORY.HOTSPOTS,
          `Hotspots ${a.itemIndex + 1} and ${b.itemIndex + 1} are positioned close enough together that they may overlap and be hard to tell apart or click individually.`,
          { itemIndex: b.itemIndex }));
      }
    }
  }

  const seenLabels = new Map();
  items.forEach((item, itemIndex) => {
    const label = plainText(item.title).toLowerCase();
    if (!label) return; // covered by general-required-field
    if (seenLabels.has(label)) {
      issues.push(issue('hotspot-keyboard-accessibility', SEVERITY.WARNING, CATEGORY.HOTSPOTS,
        `Hotspots ${seenLabels.get(label) + 1} and ${itemIndex + 1} share the same label — a keyboard or screen-reader user tabbing between them cannot tell which is which by name alone.`,
        { fieldId: 'title', itemIndex }));
    } else {
      seenLabels.set(label, itemIndex);
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Rule registry (Requirement 2, P05)
//
// Each entry is `{ id, title, appliesTo, check }`:
//   id       — a short, unique registry key (distinct from the ruleId(s) its check may
//              emit — one entry can emit issues under more than one ruleId, e.g.
//              'completion-config' below covers both general-invalid-completion-config
//              and general-completion-iframe-format).
//   title    — fallback title for any ruleId this entry emits that RULE_TITLES doesn't
//              separately cover.
//   appliesTo — `(ctx) => boolean`, or omitted to run for every component. This is the
//              mechanism component-specific rules use instead of a hardcoded
//              `if (componentId !== 'x') return []` buried in a shared module — see
//              registerValidationRule() below to add one from anywhere.
//   check    — `(ctx) => Issue[]`, where ctx is the same context object collectSyncIssues
//              receives: { componentId, schema, config, theme, componentOverrides, settings }.
//
// To add a new rule: call registerValidationRule({ id, appliesTo, check }) — from this
// file, or (since it's an exported function) from any other module loaded before the rule
// needs to run. No edit to collectSyncIssues itself is required. See docs/VALIDATION-RULES.md
// "Adding a rule" for a worked example.
// ---------------------------------------------------------------------------

const registry = [];

export function registerValidationRule(rule) {
  if (!rule || typeof rule.check !== 'function') throw new Error('A validation rule needs a check(ctx) function.');
  if (!rule.id) throw new Error('A validation rule needs a unique id.');
  registry.push({ appliesTo: null, title: null, ...rule });
  return rule;
}

/** Test/extensibility helper — removes a previously registered rule by id. */
export function unregisterValidationRule(id) {
  const index = registry.findIndex(rule => rule.id === id);
  if (index !== -1) registry.splice(index, 1);
}

/** The registry's current rule ids, in run order — mainly useful for tests/debugging. */
export function listRegisteredRuleIds() {
  return registry.map(rule => rule.id);
}

registerValidationRule({ id: 'required-fields', check: ({ schema, config }) => checkRequiredFields(schema, config) });
registerValidationRule({ id: 'empty-component', check: ({ schema, config }) => checkEmptyComponent(schema, config) });
registerValidationRule({ id: 'excessive-length', check: ({ schema, config }) => checkExcessiveLength(schema, config) });
registerValidationRule({ id: 'unsupported-rich-html', check: ({ schema, config }) => checkUnsupportedRichHtml(schema, config) });
registerValidationRule({ id: 'invalid-urls', check: ({ schema, config }) => checkInvalidUrls(schema, config) });
registerValidationRule({ id: 'missing-accessible-name', check: ({ config }) => checkMissingAccessibleName(config) });
registerValidationRule({ id: 'missing-alt-text', check: ({ config, componentId }) => checkMissingAltText(config, componentId) });
registerValidationRule({ id: 'color-contrast', check: ({ theme, componentOverrides }) => checkColorContrast(theme, componentOverrides) });
registerValidationRule({ id: 'duplicate-items', check: ({ schema, config }) => checkDuplicateItems(schema, config) });
registerValidationRule({ id: 'duplicate-titles', check: ({ schema, config, componentId }) => checkDuplicateTitles(schema, config, componentId) });
registerValidationRule({ id: 'item-count-limits', check: ({ schema, config }) => checkItemCountLimits(schema, config) });
registerValidationRule({ id: 'heading-level-outline', check: ({ config }) => checkHeadingLevelOutline(config) });
registerValidationRule({
  id: 'non-descriptive-link-text',
  appliesTo: ({ componentId }) => componentId === 'button-list',
  check: ({ componentId, config }) => checkNonDescriptiveLinkText(componentId, config)
});
registerValidationRule({ id: 'external-url-destinations', check: ({ schema, config }) => checkExternalUrlDestinations(schema, config) });
registerValidationRule({ id: 'completion-config', check: ({ config, settings }) => checkCompletionConfig(config, settings) });
registerValidationRule({ id: 'media-rules', check: ({ schema, config, settings }) => checkMediaRules(schema, config, settings) });
registerValidationRule({
  id: 'knowledge-check-rules',
  appliesTo: ({ componentId }) => KNOWLEDGE_CHECK_COMPONENTS.has(componentId),
  check: ({ componentId, schema, config }) => checkKnowledgeCheckRules(componentId, schema, config)
});
registerValidationRule({
  id: 'hotspot-rules',
  appliesTo: ({ componentId }) => componentId === 'hotspots',
  check: ({ componentId, config }) => checkHotspotRules(componentId, config)
});
registerValidationRule({
  id: 'interactive-video-timestamp-rules',
  appliesTo: ({ componentId }) => componentId === 'interactive-video',
  check: ({ componentId, config }) => checkInteractiveVideoTimestampRules(componentId, config)
});
registerValidationRule({
  id: 'interactive-video-external-url-rules',
  appliesTo: ({ componentId }) => componentId === 'interactive-video',
  check: ({ componentId, config }) => checkInteractiveVideoExternalUrlRules(componentId, config)
});
registerValidationRule({
  id: 'interactive-video-uploaded-media-export-format-rule',
  appliesTo: ({ componentId }) => componentId === 'interactive-video',
  check: ({ componentId, config }) => checkInteractiveVideoUploadedMediaExportFormat(componentId, config)
});
registerValidationRule({
  id: 'audio-player-chapter-transcript-rules',
  appliesTo: ({ componentId }) => componentId === 'audio-player',
  check: ({ componentId, config }) => checkMediaChapterAndTranscriptRules(componentId, config)
});
registerValidationRule({
  id: 'video-frame-chapter-transcript-rules',
  appliesTo: ({ componentId }) => componentId === 'video-frame',
  check: ({ componentId, config }) => checkMediaChapterAndTranscriptRules(componentId, config)
});
registerValidationRule({ id: 'brand-color-literals', check: ({ componentOverrides, config }) => checkBrandColorLiterals(componentOverrides, config) });
registerValidationRule({ id: 'brand-font-family', check: ({ componentOverrides, config }) => checkBrandFontFamily(componentOverrides, config) });
registerValidationRule({ id: 'brand-font-size-floor', check: ({ config }) => checkBrandFontSizeFloor(config) });
registerValidationRule({ id: 'brand-icon-source', check: ({ schema, config }) => checkBrandIconSource(schema, config) });
registerValidationRule({ id: 'brand-contrast-ratio', check: ({ theme, componentOverrides }) => checkBrandContrastRatio(theme, componentOverrides) });
registerValidationRule({ id: 'brand-focus-visible', check: ({ componentOverrides }) => checkBrandFocusVisible(componentOverrides) });

// ---------------------------------------------------------------------------
// Phase 5: Component-specific rules
// ---------------------------------------------------------------------------

registerValidationRule({
  id: 'scenario-graph-rules',
  appliesTo: ({ componentId }) => componentId === 'scenario',
  check: ({ config }) => checkScenarioGraphRules(config)
});
registerValidationRule({
  id: 'comparison-slider-image-rules',
  appliesTo: ({ componentId }) => componentId === 'comparison-slider',
  check: ({ config }) => checkComparisonSliderImages(config)
});
registerValidationRule({
  id: 'flip-cards-study-mode-rules',
  appliesTo: ({ componentId }) => componentId === 'flip-cards',
  check: ({ config }) => checkFlipCardsStudyMode(config)
});
registerValidationRule({
  id: 'accordion-sequential-expand-rules',
  appliesTo: ({ componentId }) => componentId === 'accordion',
  check: ({ config }) => checkAccordionSequentialExpand(config)
});
registerValidationRule({
  id: 'fill-blank-fuzzy-rules',
  appliesTo: ({ componentId }) => componentId === 'fill-blank',
  check: ({ config }) => checkFillBlankFuzzyRules(config)
});
registerValidationRule({
  id: 'sorting-activity-category-rules',
  appliesTo: ({ componentId }) => componentId === 'sorting-activity',
  check: ({ config }) => checkSortingActivityCategories(config)
});

// Timestamps within this many seconds of each other are flagged as "hard to trigger
// independently" — during real playback (Phase 3/4) two markers this close together risk
// the first marker's pause/resume immediately re-crossing into the second. Matches
// HOTSPOT_OVERLAP_THRESHOLD's role: a pragmatic authoring heuristic, not a hard technical
// limit — see docs/COMPONENT-SCHEMA.md "Interactive Video timeline validation".
const IV_NEAR_DUPLICATE_SECONDS = 1;
const IV_EDGE_PROXIMITY_SECONDS = 2;

// config.videoDurationSeconds is set by the builder's own authoring-timeline widget
// (app.js) once the author's preview video successfully loads metadata — a runtime fact
// with nowhere else to live in the config, the same reasoning js/dom-measurement.js's
// clipping-risk rules already establish for "can't derive this from config alone." Unlike
// clipping-risk, this doesn't need a whole async measurement channel: the value is cheap
// to capture once and persists with the project, so importing a project that was never
// reopened in a browser (or was authored before Phase 2) simply means these two rules
// have nothing to check yet — not an error, see the Number.isFinite guards below.
function checkInteractiveVideoTimestampRules(componentId, config) {
  if (componentId !== 'interactive-video') return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];
  const duration = Number(config.videoDurationSeconds);
  const hasDuration = Number.isFinite(duration) && duration > 0;

  const timestamps = [];
  items.forEach((item, itemIndex) => {
    const t = Number(item.timestamp);
    if (!Number.isFinite(t)) return; // covered by general-required-field / the component's own validate()
    timestamps.push({ itemIndex, t });

    if (t < IV_EDGE_PROXIMITY_SECONDS) {
      issues.push(issue('interactive-video-marker-near-edge', SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
        `Marker ${itemIndex + 1} is at ${t}s — very close to the start of the video, which can be easy to miss or feel abrupt.`, { fieldId: 'timestamp', itemIndex }));
    } else if (hasDuration && duration - t < IV_EDGE_PROXIMITY_SECONDS && t <= duration) {
      issues.push(issue('interactive-video-marker-near-edge', SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
        `Marker ${itemIndex + 1} is at ${t}s — very close to the end of the ${Math.round(duration)}s video.`, { fieldId: 'timestamp', itemIndex }));
    }

    if (hasDuration && t > duration) {
      issues.push(issue('interactive-video-marker-outside-duration',
        item.required ? SEVERITY.BLOCKING : SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
        `Marker ${itemIndex + 1} is set at ${Math.round(t)}s, past the video's ${Math.round(duration)}s duration, so it can never trigger.${item.required ? ' This marker is Required, so the video could never be completed.' : ''}`,
        { fieldId: 'timestamp', itemIndex }));
    }
  });

  for (let i = 0; i < timestamps.length; i += 1) {
    for (let j = i + 1; j < timestamps.length; j += 1) {
      if (Math.abs(timestamps[i].t - timestamps[j].t) < IV_NEAR_DUPLICATE_SECONDS) {
        issues.push(issue('interactive-video-near-duplicate-timestamps', SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
          `Marker ${timestamps[i].itemIndex + 1} and Marker ${timestamps[j].itemIndex + 1} are within ${IV_NEAR_DUPLICATE_SECONDS}s of each other (${timestamps[i].t}s and ${timestamps[j].t}s) — they may be hard to trigger independently during playback.`,
          { fieldId: 'timestamp', itemIndex: timestamps[j].itemIndex }));
      }
    }
  }

  // A Required marker only ever shows its interaction (and so can only ever be completed)
  // by pausing the video first via automatic crossing-based triggering —
  // components/interactive-video.js's own trigger logic never opens a marker's panel
  // unless pauseVideo is on during normal playback. Required + Pause Video off is still
  // Warning, not Blocking: the marker-nav list (shipped Phase 5, ivJumpToMarker) lets a
  // learner deliberately click any not-yet-completed marker to open its panel regardless
  // of pauseVideo, so this combination is only truly unreachable when showMarkerNavigation
  // is also off — a narrower condition this heuristic doesn't currently distinguish.
  items.forEach((item, itemIndex) => {
    if (item.required && item.pauseVideo === false) {
      issues.push(issue('interactive-video-required-never-pauses', SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
        `Marker ${itemIndex + 1} is Required but "Pause Video At This Marker" is off — it will never show its interaction during automatic playback. It can still be reached by clicking it in the marker list, if that's shown to learners.`,
        { fieldId: 'pauseVideo', itemIndex }));
    }
  });

  return issues;
}

// A native <video> element cannot play a video-hosting *page* URL (YouTube/Vimeo watch
// pages serve an HTML player, not a direct media file) — pointing videoUrl at one produces
// a completely non-functional export (no playback at all), not a degraded one, which is
// exactly the "output would be broken, empty, or fundamentally unusable" bar this file's
// own header comment sets for Blocking. Scoped to the small set of hosts an author is
// most likely to accidentally paste (the exact ones docs/INTERACTIVE-VIDEO.md and the
// field's own label already warn about) rather than attempting to enumerate every video
// hosting service that exists — a narrower, well-justified list beats a guessed-at broad
// one (see docs/VALIDATION-RULES.md "Rules requiring manual judgment").
const IV_NON_DIRECT_VIDEO_HOSTS = [
  'youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com'
];

function isNonDirectVideoHost(hostname) {
  const lower = hostname.toLowerCase();
  return IV_NON_DIRECT_VIDEO_HOSTS.some(host => lower === host || lower.endsWith(`.${host}`));
}

function checkInteractiveVideoExternalUrlRules(componentId, config) {
  if (componentId !== 'interactive-video') return [];
  if (config.videoSourceType !== 'url' || !config.videoUrl) return [];
  let hostname;
  try {
    hostname = new URL(config.videoUrl).hostname;
  } catch {
    return []; // malformed/unparseable URL — general-invalid-url already covers this field
  }
  if (!isNonDirectVideoHost(hostname)) return [];
  return [issue('interactive-video-non-direct-video-url', SEVERITY.BLOCKING, CATEGORY.INTERACTIVE_VIDEO,
    `The video URL points to ${hostname}, a video hosting page, not a direct video file — a native <video> element cannot play it, so the video would never appear at all. Use a direct .mp4/.webm file URL, or upload the video instead.`,
    { fieldId: 'videoUrl' })];
}

// Pre-existing, app-wide limitation (docs/INTERACTIVE-VIDEO.md "Media-storage and export
// behavior"): prepareMediaExport() (js/export.js) never inlines video/audio/captions, so
// an uploaded reference becomes a bare assets/<filename> relative path in the Iframe
// Snippet and HTML Block Fragment export formats — a path Rise has nowhere to resolve
// once pasted, so it 404s. This doesn't block export (an author may still be mid-draft,
// or may already know to use Web Package ZIP), but it's a real, demonstrable defect the
// author should know about before publishing with the wrong format — the same bar
// media-oversized-file/media-insecure-http-url already use for Warning, not Blocking.
function checkInteractiveVideoUploadedMediaExportFormat(componentId, config) {
  if (componentId !== 'interactive-video') return [];
  const hasUploadedVideo = config.videoSourceType === 'upload' && isMediaReference(config.videoMediaId);
  const hasUploadedCaptions = isMediaReference(config.captionsUrl);
  if (!hasUploadedVideo && !hasUploadedCaptions) return [];
  const what = hasUploadedVideo && hasUploadedCaptions ? 'uploaded video and captions file'
    : hasUploadedVideo ? 'uploaded video' : 'uploaded captions file';
  return [issue('interactive-video-uploaded-media-export-format', SEVERITY.WARNING, CATEGORY.INTERACTIVE_VIDEO,
    `This component uses an ${what}. The Iframe Snippet and HTML Block Fragment export formats cannot deliver that file alongside the pasted snippet — it will 404 once pasted into Rise. Export as a Web Package ZIP instead, extract it, host it externally, and iframe-embed that hosted URL in Rise.`,
    { fieldId: hasUploadedVideo ? 'videoMediaId' : 'captionsUrl' })];
}

// "MM:SS"/"HH:MM:SS" -> seconds, or null. Deliberately duplicated from
// components/audio-player.js#parseTimestampToSeconds (and components/video-frame.js's own
// identical copy) rather than imported — no other Preflight rule in this file imports a
// specific components/*.js module (every other rule operates on config fields
// generically), and this is a small, pure, ~10-line check with nothing else to share,
// matching the Node-side/runtime-string duplication this repo already establishes for
// formatDurationLabel/formatMediaTime.
function auParseTimestamp(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const parts = text.split(':').map(part => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.length === 3 ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2] : numbers[0] * 60 + numbers[1];
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

// Chapters/Synchronized Transcript are delimited textarea fields (js/editor-schemas.js's
// audio-player and video-frame comments explain why — no nested repeatable sub-list field
// type exists). Malformed rows never break preview/export (both components' own parsers
// silently skip them), but the author should still be told about a row that will be
// silently dropped, and about two chapters sharing a timestamp — both real, demonstrable
// authoring mistakes worth a Warning, not worth blocking export over. Shared between the
// two components (audio-player, video-frame) since the field shape and rules are
// identical; only the ruleId/category prefix varies by componentId, so Preflight results
// still read as "this audio component" vs. "this video component."
function checkMediaChapterAndTranscriptRules(componentId, config) {
  const category = componentId === 'video-frame' ? CATEGORY.VIDEO_FRAME : CATEGORY.AUDIO_PLAYER;
  const issues = [];
  const normalizedChapters = normalizeDelimitedLines(config.chapters);
  const chapterLines = normalizedChapters.split('\n');
  const seenChapterTimestamps = new Map();
  chapterLines.forEach((line, lineIndex) => {
    if (!line.trim()) return;
    const parts = line.split('|');
    const timestamp = auParseTimestamp(parts[0]);
    const title = (parts[1] || '').trim();
    if (timestamp === null || !title) {
      issues.push(issue(`${componentId}-invalid-chapter-line`, SEVERITY.WARNING, category,
        `Chapter row ${lineIndex + 1} ("${line.trim().slice(0, 60)}") has ${timestamp === null ? 'an invalid or missing timestamp' : 'no title'} and will be skipped rather than shown to learners.`,
        { fieldId: 'chapters' }));
      return;
    }
    if (seenChapterTimestamps.has(timestamp)) {
      issues.push(issue(`${componentId}-duplicate-chapter-timestamps`, SEVERITY.WARNING, category,
        `Chapter row ${lineIndex + 1} ("${title}") shares its timestamp with an earlier chapter ("${seenChapterTimestamps.get(timestamp)}") — both will still be shown, but a duplicate timestamp is usually an authoring mistake.`,
        { fieldId: 'chapters' }));
    } else {
      seenChapterTimestamps.set(timestamp, title);
    }
  });

  const normalizedSegments = normalizeDelimitedLines(config.transcriptSegments);
  const segmentLines = normalizedSegments.split('\n');
  segmentLines.forEach((line, lineIndex) => {
    if (!line.trim()) return;
    const parts = line.split('|');
    const timestamp = auParseTimestamp(parts[0]);
    if (timestamp === null) {
      issues.push(issue(`${componentId}-invalid-transcript-segment`, SEVERITY.WARNING, category,
        `Synchronized transcript row ${lineIndex + 1} ("${line.trim().slice(0, 60)}") has an invalid or missing timestamp and will be skipped.`,
        { fieldId: 'transcriptSegments' }));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Phase 5: Component-specific validation functions
// ---------------------------------------------------------------------------

/**
 * Scenario graph rules:
 * 1. Dead-end detection: a choice with a nextSceneId that doesn't resolve to any item id.
 * 2. Unreachable-scene detection: scenes (items with isScene=true or items[0]) not reachable
 *    from the initial scene (items[0]) via any choice path.
 * 3. Circular-branch detection with no exit: a cycle with no item whose choices all have no
 *    nextSceneId (i.e. a dead end meaning the scenario ends at that item).
 * 4. No ending state: no scene exists where learners can reach a "completed" terminal.
 *
 * Design decisions:
 * - items[0] is always the entry point.
 * - Choices for items are stored in config.items as siblings: item 0 is the prompt,
 *   items 1..n are choices (title=choice text, nextSlide=target scene key, points=score).
 * - Multi-scene branching uses nextSlide field to jump to a scene by index or id.
 * - All rules are Warnings (not Blocking) because a simple linear scenario with no
 *   nextSlide is valid (just non-branching).
 */
function checkScenarioGraphRules(config) {
  const items = Array.isArray(config.items) ? config.items : [];
  if (items.length < 2) return []; // need at least prompt + 1 choice to validate
  const issues = [];

  // Build a map of all valid scene identifiers (numeric indices + any string nextSlide values
  // that would be interpreted as indices). The scenario component uses nextSlide as a
  // 0-based index into config.items. Items without nextSlide end the scenario.
  const totalItems = items.length;
  const choices = items.slice(1); // items[0] is the prompt, rest are choices

  // Check for choices with nextSlide pointing outside valid range
  choices.forEach((choice, choiceIdx) => {
    const rawNext = choice.nextSlide ?? choice.nextSceneId;
    if (rawNext === undefined || rawNext === null || rawNext === '') return; // terminal — valid
    const targetIdx = Number(rawNext);
    if (!Number.isFinite(targetIdx) || targetIdx < 0 || targetIdx >= totalItems) {
      issues.push(issue('scenario-dead-end-scene', SEVERITY.WARNING, CATEGORY.GENERAL,
        `Choice ${choiceIdx + 2} ("${String(choice.title || '').slice(0, 40)}") points to scene ${rawNext}, which does not exist. Learners who select this choice will reach a dead end.`,
        { fieldId: 'nextSlide', itemIndex: choiceIdx + 1 }));
    }
  });

  // Check if at least one choice leads to an ending (no nextSlide = scenario completion)
  const hasTerminalChoice = choices.some(ch => {
    const rawNext = ch.nextSlide ?? ch.nextSceneId;
    return rawNext === undefined || rawNext === null || rawNext === '';
  });
  if (!hasTerminalChoice && choices.length > 0) {
    issues.push(issue('scenario-no-ending-state', SEVERITY.WARNING, CATEGORY.GENERAL,
      'No choice leads to a scenario ending — every choice has a nextSlide target. Learners may be stuck in an infinite loop if all branch paths eventually loop back. Ensure at least one branch eventually reaches a choice with no nextSlide (the ending state).'));
  }

  return issues;
}

/**
 * Comparison Slider: warn when either Before or After image is missing.
 * A slider with one missing image renders with a blank half, which is
 * confusing and misleading for learners.
 */
function checkComparisonSliderImages(config) {
  const issues = [];
  const items = Array.isArray(config.items) ? config.items : [];
  items.forEach((item, itemIndex) => {
    if (isEmptyValue(item.beforeImage)) {
      issues.push(issue('comparison-slider-missing-before-image', SEVERITY.WARNING, CATEGORY.GENERAL,
        `Slide ${itemIndex + 1} is missing a "Before" image — the left half of the comparison will be blank.`,
        { fieldId: 'beforeImage', itemIndex }));
    }
    if (isEmptyValue(item.afterImage)) {
      issues.push(issue('comparison-slider-missing-after-image', SEVERITY.WARNING, CATEGORY.GENERAL,
        `Slide ${itemIndex + 1} is missing an "After" image — the right half of the comparison will be blank.`,
        { fieldId: 'afterImage', itemIndex }));
    }
  });
  return issues;
}

/**
 * Flip Cards / Study Cards: when Study Mode is enabled, every card should have
 * a non-empty front AND back so the Know / Needs Review flow is meaningful.
 * Cards with a blank back face create an untestable flip that confuses learners.
 */
function checkFlipCardsStudyMode(config) {
  // Study mode is the flipCardsMode === 'study' or studyMode === true field
  const inStudyMode = config.flipCardsMode === 'study' || config.studyMode === true;
  if (!inStudyMode) return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];
  items.forEach((item, itemIndex) => {
    const hasFront = !isEmptyValue(item.title);
    const hasBack = !isEmptyValue(item.content);
    if (!hasFront || !hasBack) {
      issues.push(issue('flip-cards-study-mode-incomplete', SEVERITY.WARNING, CATEGORY.GENERAL,
        `Card ${itemIndex + 1} is missing its ${!hasFront ? 'front (title)' : 'back (content)'} — Study Mode requires both sides of every card to be filled in.`,
        { fieldId: hasFront ? 'content' : 'title', itemIndex }));
    }
  });
  return issues;
}

/**
 * Accordion: Sequential (guided) mode locks each section until the previous
 * is opened, which makes an "Expand All" control impossible to use — the two
 * settings directly contradict each other.
 */
function checkAccordionSequentialExpand(config) {
  if (config.accordionSequential && config.accordionExpandCollapseAll) {
    return [issue('accordion-sequential-expand-contradiction', SEVERITY.WARNING, CATEGORY.GENERAL,
      'Sequential (guided) mode and the Expand All control are enabled at the same time. Sequential mode locks sections until the previous is opened, so Expand All cannot function — learners will see the control but it will not work. Disable one of these settings.',
      { fieldId: 'accordionExpandCollapseAll' })];
  }
  return [];
}

/**
 * Fill-in-the-Blank: when fuzzyMatch is enabled, a very short accepted answer
 * (1-2 characters) means a 1-character Levenshtein tolerance will accept the
 * empty string or any single character as correct — this is almost certainly
 * an authoring mistake. Flag it as a Warning so the author can decide.
 */
function checkFillBlankFuzzyRules(config) {
  if (!config.fuzzyMatch) return [];
  const items = Array.isArray(config.items) ? config.items : [];
  const issues = [];
  items.forEach((item, itemIndex) => {
    const answers = String(item.content ?? '').split(/[,|\n]/).map(a => a.trim()).filter(Boolean);
    const tooShortAnswers = answers.filter(a => a.length <= 2);
    if (tooShortAnswers.length > 0) {
      issues.push(issue('fill-blank-fuzzy-no-answers', SEVERITY.WARNING, CATEGORY.KNOWLEDGE,
        `Blank ${itemIndex + 1} has a very short accepted answer ("${tooShortAnswers[0]}") with Fuzzy Match enabled. A 1-character tolerance on a 1–2 character answer accepts almost any input as correct. Disable Fuzzy Match for this blank, or use a longer canonical answer.`,
        { fieldId: 'content', itemIndex }));
    }
  });
  return issues;
}

/**
 * Sorting Activity: a meaningful drag-and-drop activity requires at least
 * two distinct categories. With only one category, every item trivially
 * belongs there — no decision-making occurs.
 */
function checkSortingActivityCategories(config) {
  const items = Array.isArray(config.items) ? config.items : [];
  const categories = new Set(items.map(item => String(item.category || '').trim()).filter(Boolean));
  if (categories.size < 2 && items.length >= 2) {
    return [issue('sorting-activity-single-category', SEVERITY.WARNING, CATEGORY.KNOWLEDGE,
      `All items belong to the same category ("${[...categories][0] || 'unknown'}"). A sorting activity should have at least two distinct categories so learners are making a real decision about which category each item belongs to.`)];
  }
  return [];
}

// ---------------------------------------------------------------------------
// AT&T Brand Compliance Rules (Prompt 8)
// ---------------------------------------------------------------------------

// Official AT&T token hex palette (from design/att-tokens.css and themes.js)
const ATT_BRAND_HEX_VALUES = new Set([
  '#009FDB', // --att-blue (Primary AT&T Blue)
  '#00388F', // --att-cobalt (CTA / Secondary Cobalt)
  '#49EEDC', // --att-mint (Secondary Mint)
  '#91DC00', // --att-lime (Secondary Lime accent)
  '#F3F4F5', // --att-grey-1 (Sunken surface neutral)
  '#DCDFE3', // --att-grey-2 (Border neutral)
  '#BDC2C7', // --att-grey-3 (Border strong neutral)
  '#000000', // --att-black (Text neutral)
  '#FFFFFF', // --att-white (Surface neutral)
  '#0079B1', // --att-blue-dark (Gradient stop)
  '#00C9FF', // --att-blue-light (Gradient stop)
  '#002A6B', // --att-cta-bg-hover (Cobalt hover state)
  '#4B5563'  // Muted text high-contrast neutral
]);

function normalizeBrandHex(hex) {
  const clean = String(hex || '').trim().toUpperCase();
  if (clean.length === 4 && clean.startsWith('#')) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean;
}

// 1. Color literal rule (BLOCKING) — flags hardcoded colors outside token palette
function checkBrandColorLiterals(componentOverrides = {}, config = {}) {
  const issues = [];
  const colorKeys = [
    { key: 'primary', label: 'Primary color override' },
    { key: 'accent', label: 'Accent color override' },
    { key: 'background', label: 'Background color override' },
    { key: 'text', label: 'Text color override' },
    { key: 'primaryColor', label: 'Primary color' },
    { key: 'accentColor', label: 'Accent color' },
    { key: 'backgroundColor', label: 'Background color' },
    { key: 'textColor', label: 'Text color' },
    { key: 'colorPrimary', label: 'Primary color' },
    { key: 'colorAccent', label: 'Accent color' },
    { key: 'colorBg', label: 'Background color' },
    { key: 'colorText', label: 'Text color' }
  ];

  colorKeys.forEach(({ key, label }) => {
    const val = componentOverrides?.[key] ?? config?.[key];
    if (val && typeof val === 'string' && val.startsWith('#')) {
      const hex = normalizeBrandHex(val);
      if (!ATT_BRAND_HEX_VALUES.has(hex)) {
        issues.push(issue('brand-color-literal', SEVERITY.BLOCKING, CATEGORY.BRAND,
          `${label} ("${val}") is not an approved AT&T brand color token. Use AT&T Blue (#009FDB), Cobalt (#00388F), Neutrals, or standard design tokens.`,
          { fieldId: key }));
      }
    }
  });

  return issues;
}

// 2. Font family rule (BLOCKING) — ensures learner-facing text uses AT&T Aleck
function checkBrandFontFamily(componentOverrides = {}, config = {}) {
  const issues = [];
  const fontVal = componentOverrides?.fontFamily ?? config?.fontFamily ?? config?.headingFontFamily;
  if (fontVal && typeof fontVal === 'string') {
    const lower = fontVal.toLowerCase();
    const isApproved = lower.includes('att aleck') || lower.includes('var(--att-font') || lower.includes('var(--font-family');
    if (!isApproved) {
      issues.push(issue('brand-font-family', SEVERITY.BLOCKING, CATEGORY.BRAND,
        `Font family "${fontVal}" is not AT&T Aleck. All learner-facing components must use the AT&T Aleck font family.`,
        { fieldId: 'fontFamily' }));
    }
  }
  return issues;
}

// 3. Font size floor rule (BLOCKING) — enforces 16px floor for body text
function checkBrandFontSizeFloor(config = {}) {
  const issues = [];
  const sizeVal = config?.bodyFontSize ?? config?.fontSize;
  if (sizeVal !== undefined && sizeVal !== null && sizeVal !== '') {
    const num = Number(sizeVal);
    if (Number.isFinite(num) && num < 16) {
      issues.push(issue('brand-font-size-floor', SEVERITY.BLOCKING, CATEGORY.BRAND,
        `Learner-facing body font size (${num}px) is below the required 16px floor for AT&T learning experiences.`,
        { fieldId: 'bodyFontSize' }));
    }
  }
  return issues;
}

// 4. Non-library icon or emoji character (BLOCKING)
const EMOJI_AND_UNAPPROVED_ICONS_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F1E6}-\u{1F1FF}\u{1FA70}-\u{1FAFF}→➔➜▶▼▲◀✓✔✕✖★☆]/u;

function checkBrandIconSource(schema = {}, config = {}) {
  const issues = [];
  const checkText = (value, fieldId, itemIndex, fieldLabel) => {
    if (typeof value !== 'string' || !value) return;
    const match = value.match(EMOJI_AND_UNAPPROVED_ICONS_REGEX);
    if (match) {
      issues.push(issue('brand-icon-source', SEVERITY.BLOCKING, CATEGORY.BRAND,
        `${fieldLabel || 'Field'} contains a non-library icon or emoji character ("${match[0]}"). Use official AT&T SVG functional icons instead of emoji or ad-hoc glyphs.`,
        { fieldId, itemIndex }));
    }
  };

  (schema.componentFields || []).forEach(field => {
    if (['text', 'textarea', 'richtext'].includes(field.type)) {
      checkText(config[field.id], field.id, null, field.label);
    }
  });

  const items = Array.isArray(config.items) ? config.items : [];
  items.forEach((item, itemIndex) => {
    (schema.itemFields || []).forEach(field => {
      if (['text', 'textarea', 'richtext'].includes(field.type)) {
        checkText(item[field.id], field.id, itemIndex, `${field.label} (Item ${itemIndex + 1})`);
      }
    });
  });

  return issues;
}

// 5. Contrast ratio with #009FDB under 24px check (WARNING)
function checkBrandContrastRatio(theme, componentOverrides) {
  const tokens = resolveThemeTokens(theme, componentOverrides);
  const issues = [];
  const textHex = normalizeBrandHex(tokens.text);
  const surfaceHex = normalizeBrandHex(tokens.surface);

  // Specifically check AT&T Blue (#009FDB) used as text color against white/light surface for small text
  if (textHex === '#009FDB' && (surfaceHex === '#FFFFFF' || surfaceHex === '#F3F4F5')) {
    const ratio = contrastRatio('#009FDB', surfaceHex);
    issues.push(issue('brand-contrast-ratio', SEVERITY.WARNING, CATEGORY.BRAND,
      `AT&T Blue (#009FDB) has a ${ratio.toFixed(1)}:1 contrast ratio on ${surfaceHex} and passes WCAG AA only for large text (≥24px or ≥18.66px bold). Use Black (#000000) or Cobalt (#00388F) for copy under 24px.`,
      { fieldId: 'textColor' }));
  }

  return issues;
}

// 6. Focus visible styling rule (WARNING)
function checkBrandFocusVisible(componentOverrides = {}) {
  const issues = [];
  if (componentOverrides?.focusOutline === 'none' || componentOverrides?.disableFocusRing === true) {
    issues.push(issue('brand-focus-visible', SEVERITY.WARNING, CATEGORY.BRAND,
      'Focus outlines must not be removed on interactive elements. AT&T standards require a 3px Cobalt (#00388F) focus ring with 2px offset for keyboard accessibility.',
      { fieldId: 'focusRing' }));
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Every rule that can run without an I/O round-trip. Safe to call frequently (e.g. on
 * every editor change) — used by both the inline field UI and as the bulk of the
 * consolidated preflight panel. Runs every registered rule whose `appliesTo` (if any)
 * matches this context, then enriches each raw issue into the stable result shape.
 */
export function collectSyncIssues(ctx) {
  return registry
    .filter(rule => !rule.appliesTo || rule.appliesTo(ctx))
    .flatMap(rule => rule.check(ctx).map(rawIssue => enrichIssue(rawIssue, ctx.componentId, rule.title)));
}

/**
 * Full preflight: sync issues plus the one rule that requires an IndexedDB read (broken
 * media references). Used by the consolidated preflight panel and the export gate. Kept
 * outside the sync registry above since it's async and needs `mediaStore` — see
 * checkBrokenMediaReferences's own comment for why this is the sole exception to the
 * registry pattern.
 */
export async function runPreflight(ctx) {
  const [syncIssues, brokenMediaIssues] = await Promise.all([
    Promise.resolve(collectSyncIssues(ctx)),
    checkBrokenMediaReferences(ctx.schema, ctx.config, ctx.mediaStore)
  ]);
  // ctx.domMeasurement is only ever supplied by callers that already ran
  // js/dom-measurement.js#measureRenderedDimensions (app.js) — undefined means "not
  // attempted" (skip silently, e.g. any future caller that doesn't need this), while an
  // explicit `null` means "attempted and failed" (surfaces the manual-check
  // Recommendation inside checkClippingRisk/checkMobileOverflow themselves).
  const domIssues = ctx.domMeasurement !== undefined
    ? [...checkClippingRisk(ctx.domMeasurement), ...checkMobileOverflow(ctx.domMeasurement)]
    : [];
  return [
    ...syncIssues,
    ...brokenMediaIssues.map(rawIssue => enrichIssue(rawIssue, ctx.componentId, null)),
    ...domIssues.map(rawIssue => enrichIssue(rawIssue, ctx.componentId, null))
  ];
}

export function summarizePreflight(issues) {
  const blocking = issues.filter(item => item.severity === SEVERITY.BLOCKING);
  const warnings = issues.filter(item => item.severity === SEVERITY.WARNING);
  const recommendations = issues.filter(item => item.severity === SEVERITY.RECOMMENDATION);
  return { blocking, warnings, recommendations, canExport: blocking.length === 0 };
}

/**
 * A short, human-readable summary of a preflight run — "No issues found.", "2 issues: 1
 * blocking, 1 warning.", etc. — for a single concise accessible announcement (Requirement
 * 5, P05), instead of a screen reader re-reading the entire detailed issue list on every
 * update. See app.js's `#preflight-announcement`/`#export-preflight-announcement`.
 */
export function summarizePreflightForAnnouncement(issues) {
  const summary = summarizePreflight(issues);
  const total = summary.blocking.length + summary.warnings.length + summary.recommendations.length;
  if (total === 0) return 'No issues found.';
  const parts = [];
  if (summary.blocking.length) parts.push(`${summary.blocking.length} blocking`);
  if (summary.warnings.length) parts.push(`${summary.warnings.length} warning${summary.warnings.length === 1 ? '' : 's'}`);
  if (summary.recommendations.length) parts.push(`${summary.recommendations.length} recommendation${summary.recommendations.length === 1 ? '' : 's'}`);
  return `${total} issue${total === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}
