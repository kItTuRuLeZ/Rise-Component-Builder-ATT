/**
 * Project Schema v3 Definitions & Utilities
 * Supports multi-component course projects with sections, unsectioned components, shared media, and QA.
 */

import {
  DEFAULT_THEME_ID, getBuiltInTheme, normalizeComponentOverrides, validateTheme
} from './themes.js';
import { normalizeSettings } from './storage.js';

export const SCHEMA_VERSION_V3 = 3;

export function generateUUID(prefix = '') {
  const randomPart = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  return prefix ? `${prefix}-${randomPart}` : randomPart;
}

export function createProjectId() {
  return generateUUID('project');
}

export function createSectionId() {
  return generateUUID('sec');
}

export function createComponentInstanceId() {
  return generateUUID('comp');
}

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const validDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/**
 * @param {{ id?: string|null, name?: string, type?: string, config?: any, styleOverrides?: any,
 *   mediaRefs?: any[], qa?: any, status?: string, kind?: string, createdAt?: string|null,
 *   updatedAt?: string|null }} [options]
 */
export function createComponentInstance({
  id = null,
  name = 'Untitled Component',
  type = 'accordion',
  config = {},
  styleOverrides = {},
  mediaRefs = [],
  qa = {},
  status = 'draft',
  kind = 'builder',
  createdAt = null,
  updatedAt = null
} = {}) {
  const now = new Date().toISOString();
  return {
    id: id || createComponentInstanceId(),
    name: String(name || 'Untitled Component').trim(),
    type: String(type || 'accordion').trim(),
    config: clone(config),
    styleOverrides: normalizeComponentOverrides(styleOverrides),
    mediaRefs: Array.isArray(mediaRefs) ? [...mediaRefs] : [],
    qa: isObject(qa) ? clone(qa) : { status: 'untested', notes: '' },
    status: ['draft', 'in_review', 'in-review', 'ready', 'approved'].includes(status) ? (status === 'approved' ? 'ready' : status) : 'draft',
    // Additive, backward-compatible: existing v3 projects have no `kind` field at all, and every
    // one of them is (and always was) a real, schema-driven component — 'builder' is the correct
    // default for data that predates this field, not just an arbitrary fallback. 'rise' marks a
    // storyboard-imported row that stands for a native Rise block: it carries no schema-driven
    // config, is never compiled/previewed, and must be excluded from QA, Preflight, and export
    // (js/dashboard/project-qa.js, js/dashboard/project-export.js) — see
    // docs/STORYBOARD-IMPORT-DESIGN.md.
    kind: kind === 'rise' ? 'rise' : 'builder',
    createdAt: createdAt && validDate(createdAt) ? new Date(createdAt).toISOString() : now,
    updatedAt: updatedAt && validDate(updatedAt) ? new Date(updatedAt).toISOString() : now
  };
}

/**
 * @param {{ id?: string|null, name?: string, description?: string, collapsed?: boolean,
 *   componentOrder?: string[] }} [options]
 */
export function createSection({
  id = null,
  name = 'New Section',
  description = '',
  collapsed = false,
  componentOrder = []
} = {}) {
  return {
    id: id || createSectionId(),
    name: String(name || 'New Section').trim(),
    description: String(description || '').trim(),
    collapsed: Boolean(collapsed),
    componentOrder: Array.isArray(componentOrder) ? [...componentOrder] : []
  };
}

/**
 * @param {{ id?: string|null, name?: string, clientLabel?: string, description?: string,
 *   favorite?: boolean, settings?: any, sectionOrder?: string[], sections?: Record<string, any>,
 *   unsectionedComponentOrder?: string[], components?: Record<string, any>, mediaRefs?: any[],
 *   projectQa?: any, theme?: any, activeTheme?: any, componentOverrides?: any, uiTheme?: string,
 *   createdAt?: string|null, updatedAt?: string|null }} [options]
 */
export function buildProjectSchemaV3({
  id = null,
  name = 'Untitled Course Project',
  clientLabel = 'AT&T',
  description = '',
  favorite = false,
  settings = undefined,
  sectionOrder = [],
  sections = {},
  unsectionedComponentOrder = [],
  components = {},
  mediaRefs = [],
  projectQa = {},
  theme = undefined,
  activeTheme = undefined,
  componentOverrides = undefined,
  uiTheme = 'light',
  createdAt = null,
  updatedAt = null
} = {}) {
  const now = new Date().toISOString();
  const themeCandidate = activeTheme || (isObject(theme) ? theme : getBuiltInTheme(DEFAULT_THEME_ID));
  const themeResult = validateTheme(themeCandidate);
  const resolvedTheme = themeResult.valid ? themeResult.theme : getBuiltInTheme(DEFAULT_THEME_ID);

  const normalizedSections = {};
  if (isObject(sections)) {
    for (const [secId, secData] of Object.entries(sections)) {
      if (isObject(secData)) {
        normalizedSections[secId] = createSection({ ...secData, id: secId });
      }
    }
  }

  const normalizedComponents = {};
  if (isObject(components)) {
    for (const [compId, compData] of Object.entries(components)) {
      if (isObject(compData)) {
        normalizedComponents[compId] = createComponentInstance({ ...compData, id: compId });
      }
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION_V3,
    id: id || createProjectId(),
    name: String(name || 'Untitled Course Project').trim() || 'Untitled Course Project',
    clientLabel: String(clientLabel || 'AT&T').trim() || 'AT&T',
    description: String(description || '').trim(),
    favorite: Boolean(favorite),
    createdAt: createdAt && validDate(createdAt) ? new Date(createdAt).toISOString() : now,
    updatedAt: updatedAt && validDate(updatedAt) ? new Date(updatedAt).toISOString() : now,
    settings: normalizeSettings(settings),
    theme: resolvedTheme,
    componentOverrides: normalizeComponentOverrides(componentOverrides),
    uiTheme: ['light', 'dark'].includes(uiTheme) ? uiTheme : 'light',
    sectionOrder: Array.isArray(sectionOrder) ? [...sectionOrder] : [],
    sections: normalizedSections,
    unsectionedComponentOrder: Array.isArray(unsectionedComponentOrder) ? [...unsectionedComponentOrder] : [],
    components: normalizedComponents,
    mediaRefs: Array.isArray(mediaRefs) ? [...mediaRefs] : [],
    projectQa: isObject(projectQa) ? clone(projectQa) : {
      overallStatus: 'pending',
      lastAuditedAt: null,
      notes: ''
    }
  };
}

/**
 * Validates a Schema v3 project object.
 */
export function validateProjectV3(value) {
  try {
    if (!isObject(value)) throw new Error('Project data must be a JSON object.');
    if (value.schemaVersion !== SCHEMA_VERSION_V3) {
      throw new Error(`Project schemaVersion must be ${SCHEMA_VERSION_V3}. Received: ${value.schemaVersion}`);
    }
    if (typeof value.id !== 'string' || !value.id.trim()) throw new Error('Project id is missing.');
    if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('Project name is missing.');
    if (!validDate(value.createdAt) || !validDate(value.updatedAt)) throw new Error('Project dates are invalid.');

    if (!Array.isArray(value.sectionOrder)) throw new Error('sectionOrder must be an array.');
    if (!isObject(value.sections)) throw new Error('sections must be an object.');
    if (!Array.isArray(value.unsectionedComponentOrder)) throw new Error('unsectionedComponentOrder must be an array.');
    if (!isObject(value.components)) throw new Error('components must be an object.');

    // Validate sections integrity
    for (const secId of value.sectionOrder) {
      if (!value.sections[secId]) {
        throw new Error(`Section "${secId}" listed in sectionOrder is not defined in sections map.`);
      }
    }

    // Validate components references
    const allReferencedCompIds = new Set([
      ...value.unsectionedComponentOrder,
      ...Object.values(value.sections).flatMap(s => Array.isArray(s.componentOrder) ? s.componentOrder : [])
    ]);

    for (const compId of allReferencedCompIds) {
      if (!value.components[compId]) {
        throw new Error(`Component "${compId}" referenced in layout is not defined in components map.`);
      }
    }

    const themeResult = validateTheme(value.theme);
    const resolvedTheme = themeResult.valid ? themeResult.theme : getBuiltInTheme(DEFAULT_THEME_ID);

    return {
      valid: true,
      project: buildProjectSchemaV3({
        ...value,
        theme: resolvedTheme
      })
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}
