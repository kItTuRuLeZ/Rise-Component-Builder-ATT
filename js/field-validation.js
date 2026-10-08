// Low-level, schema-field-level validation shared by js/editor.js (the live inline
// editor UI) and js/validation.js (the preflight engine). Split into its own module so
// neither of those two needs to import the other — js/validation.js's rules are built
// partly on top of these same field checks.

import { isMediaReference } from './media.js';

export function isEmpty(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
}

export function validateSchemaField(field, value, items = []) {
  const errors = [];
  if (field.required && isEmpty(value)) errors.push(`${field.label} is required.`);
  if (field.requiredOne && !items.some(item => Boolean(item[field.id]))) errors.push(`Select one ${field.label.toLowerCase()}.`);
  if (isEmpty(value)) return errors;

  if (field.type === 'number' || field.type === 'range') {
    const number = Number(value);
    if (!Number.isFinite(number)) errors.push(`${field.label} must be a number.`);
    if (field.min !== undefined && number < field.min) errors.push(`${field.label} must be at least ${field.min}.`);
    if (field.max !== undefined && number > field.max) errors.push(`${field.label} must be no more than ${field.max}.`);
  }
  if (field.type === 'url' && value && !isMediaReference(value)) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch { errors.push(`${field.label} must be a valid URL.`); }
  }
  if (['image', 'audio', 'video'].includes(field.type) && value && !isMediaReference(value) && !String(value).startsWith('data:')) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch { errors.push(`${field.label} must be a valid web URL or uploaded file.`); }
  }
  if (field.type === 'color' && value && !/^#[0-9a-f]{6}$/i.test(String(value))) errors.push(`${field.label} must be a six-digit hexadecimal color.`);
  if (field.maxLength && String(value).length > field.maxLength) errors.push(`${field.label} must be ${field.maxLength} characters or fewer.`);
  const patternSubject = ['text', 'richtext'].includes(field.type)
    ? String(value).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
    : String(value);
  if (field.pattern && !new RegExp(field.pattern, field.patternFlags || '').test(patternSubject)) errors.push(field.patternMessage || `${field.label} has an invalid format.`);
  return errors;
}

// P11: shared with js/validation.js's preflight "excessive length" rule, so the inline
// editor hint and the later save/export-time warning agree on the same thresholds. This
// is guidance only — it never enforces a hard limit (fields that need one already declare
// field.maxLength, which getLengthGuidance treats as "already handled, nothing to add").
export const RECOMMENDED_TEXT_LENGTH = 200;
export const RECOMMENDED_RICH_LENGTH = 4000;

export function getLengthGuidance(field) {
  if (field.maxLength) return '';
  if (['text', 'select'].includes(field.type)) return `Keep this under about ${RECOMMENDED_TEXT_LENGTH} characters — it reads best as a short label.`;
  if (['textarea', 'richtext'].includes(field.type)) return `Recommended: under about ${RECOMMENDED_RICH_LENGTH} characters. Longer content may not fit the block layout well.`;
  return '';
}

export function getAccessibilityWarning(field, value, model) {
  if (field.warningWhen && isEmpty(model[field.warningWhen])) return '';
  if (field.warningUnless && !model[field.warningUnless] && isEmpty(value)) return field.warningMessage || `${field.label} is recommended for accessibility.`;
  if (field.warningUnlessAny && !field.warningUnlessAny.some(id => !isEmpty(model[id]))) return field.warningMessage || 'Provide an accessible media alternative.';
  return '';
}
