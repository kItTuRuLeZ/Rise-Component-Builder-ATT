import { isMediaReference } from './media.js';
import {
  BUILT_IN_THEMES, DEFAULT_THEME_ID, getBuiltInTheme, normalizeComponentOverrides, validateTheme
} from './themes.js';
import { DEFAULT_DEVICE_MODE, isValidDeviceMode } from './device-preview.js';
import {
  buildProjectSchemaV3, validateProjectV3
} from './project-schema.js';
import { backupLegacyProjects, migrateProjectToV3 } from './project-migration.js';
import { EDITION, namespacedKey, ownedByThisEdition } from './client-isolation.js';

export const SCHEMA_VERSION = 3;

// The keys this edition reads and writes going forward — each namespaced by EDITION so the
// AT&T and PMI editions, which share one browser origin, never collide (client-isolation.js,
// 27 September 2026 functional audit, section 3).
export const KEYS = {
  projects: namespacedKey('rise-builder-projects-v1'),
  draft: namespacedKey('rise-builder-draft-v1'),
  favorites: namespacedKey('rise-builder-favorites-v1'),
  recentlyUsed: namespacedKey('rise-builder-recently-used-v1'),
  settings: namespacedKey('rise-builder-settings-v1'),
  uiTheme: namespacedKey('rise-builder-theme'),
  customThemes: namespacedKey('rise-builder-custom-themes-v1'),
  defaultTheme: namespacedKey('rise-builder-default-theme-v1'),
  previewDevice: namespacedKey('rise-builder-preview-device-v1')
};

// The un-namespaced keys every build used before this edition split — read-only, migration
// source. Never written to and never deleted: a project or preference this edition doesn't
// confidently claim (see ownedByThisEdition) stays here, untouched, for the author to import
// explicitly (getUnclaimedLegacyProjects/importLegacyProjectById below) or for the other
// edition's own migration to claim.
const LEGACY_KEYS = {
  projects: 'rise-builder-projects-v1',
  draft: 'rise-builder-draft-v1',
  favorites: 'rise-builder-favorites-v1',
  recentlyUsed: 'rise-builder-recently-used-v1',
  settings: 'rise-builder-settings-v1',
  uiTheme: 'rise-builder-theme',
  customThemes: 'rise-builder-custom-themes-v1',
  defaultTheme: 'rise-builder-default-theme-v1',
  previewDevice: 'rise-builder-preview-device-v1'
};
const MIGRATION_MARKER_KEY = namespacedKey('rise-builder-storage-migrated-v1');

const DEFAULT_SETTINGS = {
  defaultFont: 'Lato',
  exportFormat: 'web',
  autosave: true,
  mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 },
  // Empty string = unconfigured: exported components post/accept completion messages to/from
  // any origin ('*'), and accept them from any origin — documented default, see
  // docs/COMPLETION-INTEGRATION.md "Why the default targetOrigin is '*'". When set, this
  // exact origin is required for every inbound message and used as the outbound targetOrigin.
  completionParentOrigin: ''
};

export const MEDIA_LIMIT_BOUNDS_MB = {
  image: [1, 50],
  audio: [1, 150],
  video: [1, 500],
  svg: [1, 20]
};

function normalizeMediaLimitsMb(value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(Object.entries(MEDIA_LIMIT_BOUNDS_MB).map(([key, [min, max]]) => {
    const num = Number(source[key]);
    const valid = Number.isFinite(num) && num >= min && num <= max;
    return [key, valid ? Math.round(num) : DEFAULT_SETTINGS.mediaLimitsMb[key]];
  }));
}

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPlainObject = value => isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const clone = value => JSON.parse(JSON.stringify(value));
const validDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new Error(error?.name === 'QuotaExceededError'
      ? 'Local storage is full. Export or delete projects and try again.'
      : 'This browser could not save data locally.');
  }
}

export function createProjectId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Blocked outright regardless of the general key-name pattern below: these are the
// property names a downstream `target[key] = value`-shaped merge (present or future)
// could use to repoint an object's prototype rather than set a normal data field.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeProjectValue(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length <= 1000 && value.every(entry => isSafeProjectValue(entry, depth + 1));
  if (!isPlainObject(value)) return false;
  if ('objectUrl' in value || 'blob' in value) return false;
  // Only a value that actually points at stored media is held to the media-reference
  // shape. Item-media descriptors (js/item-media.js) are initialised with
  // sourceType: 'upload' while still empty — type: 'none', mediaId: '' — and
  // isMediaReference deliberately rejects that shape, excluding anything that carries
  // `placement` alongside `aspectRatio`/`fit`. Keying the check off `source`/`sourceType`
  // alone therefore made every item that had ever rendered a media control unsavable,
  // failing the whole project with "Project item data is invalid." A descriptor with no
  // id references nothing, and the objectUrl/blob check above already rejects the
  // non-serialisable media handles this guard exists to keep out of localStorage.
  const mediaPointer = (typeof value.mediaId === 'string' ? value.mediaId.trim() : value.mediaId)
    || (typeof value.assetId === 'string' ? value.assetId.trim() : value.assetId);
  if (mediaPointer && !isMediaReference(value)) return false;
  return Object.entries(value).length <= 100 && Object.entries(value).every(([key, entry]) =>
    /^[a-zA-Z0-9_-]+$/.test(key) && !DANGEROUS_KEYS.has(key) && isSafeProjectValue(entry, depth + 1));
}

const ORIGIN_PATTERN = /^https?:\/\/[^/]+$/i;

function normalizeCompletionParentOrigin(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return ORIGIN_PATTERN.test(trimmed) ? trimmed : DEFAULT_SETTINGS.completionParentOrigin;
}

export function normalizeSettings(value) {
  if (!isObject(value)) return { ...DEFAULT_SETTINGS };
  const allowedFonts = ['Merriweather', 'Lato', 'Roboto', 'Montserrat', 'Open Sans'];
  return {
    defaultFont: allowedFonts.includes(value.defaultFont) ? value.defaultFont : DEFAULT_SETTINGS.defaultFont,
    exportFormat: ['web', 'zip'].includes(value.exportFormat) ? value.exportFormat : DEFAULT_SETTINGS.exportFormat,
    autosave: typeof value.autosave === 'boolean' ? value.autosave : DEFAULT_SETTINGS.autosave,
    mediaLimitsMb: normalizeMediaLimitsMb(value.mediaLimitsMb),
    completionParentOrigin: normalizeCompletionParentOrigin(value.completionParentOrigin)
  };
}

export function migrateProject(value) {
  if (!isObject(value)) throw new Error('Project data must be a JSON object.');
  const version = value.schemaVersion ?? 0;
  if (!Number.isInteger(version) || version < 0) throw new Error('Invalid project schemaVersion.');
  if (version > SCHEMA_VERSION) throw new Error(`This project uses schema version ${version}, but this builder supports version ${SCHEMA_VERSION}.`);

  let project = value;
  if (version === 0) {
    project = {
      ...value,
      schemaVersion: 1,
      name: value.name || value.title,
      settings: normalizeSettings(value.settings)
    };
  }
  if (project.schemaVersion === 1) {
    const config = isObject(project.config) ? project.config : {};
    const overrides = normalizeComponentOverrides({
      primary: config.colorPrimary,
      accent: config.colorAccent,
      background: config.colorBg,
      text: config.colorText,
      borderRadius: Number(config.borderRadius),
      shadow: config.shadowDepth,
      fontFamily: project.settings?.defaultFont
    });
    const normalizedConfig = {
      headerStyle: 'minimal',
      headerCyanRule: false,
      spacingDensity: 'standard',
      contextBandEnabled: false,
      contextBandText: '',
      contextBandAlignment: 'left',
      ...config
    };
    return {
      ...project,
      schemaVersion: 2,
      config: normalizedConfig,
      uiTheme: project.theme === 'dark' ? 'dark' : 'light',
      theme: getBuiltInTheme(DEFAULT_THEME_ID),
      componentOverrides: overrides
    };
  }
  if (isObject(project.config)) {
    project.config = {
      headerStyle: 'minimal',
      headerCyanRule: false,
      spacingDensity: 'standard',
      contextBandEnabled: false,
      contextBandText: '',
      contextBandAlignment: 'left',
      ...project.config
    };
  }
  return project;
}

export function validateProject(value) {
  try {
    if (!isObject(value)) throw new Error('Project data must be a JSON object.');
    const version = value.schemaVersion ?? 0;
    if (!Number.isInteger(version) || version < 0) throw new Error('Invalid project schemaVersion.');
    if (version > SCHEMA_VERSION) throw new Error(`This project uses schema version ${version}, but this builder supports version ${SCHEMA_VERSION}.`);

    if (version === 3 || isObject(value.components)) {
      return validateProjectV3(value);
    }

    const project = migrateProject(value);
    if (typeof project.id !== 'string' || !project.id.trim()) throw new Error('Project id is missing.');
    if (typeof project.name !== 'string' || !project.name.trim()) throw new Error('Project name is missing.');
    if (typeof project.componentId !== 'string' || !project.componentId.trim()) throw new Error('Project componentId is missing.');
    if (!validDate(project.createdAt) || !validDate(project.updatedAt)) throw new Error('Project dates are invalid.');
    if (!isObject(project.config) || !Array.isArray(project.config.items)) throw new Error('Project config is invalid.');
    if (!project.config.items.every(isObject)) throw new Error('Project items must be objects.');
    const stringFields = ['blockTitle', 'blockHeadline', 'blockDesc', 'colorPrimary', 'colorAccent', 'colorBg',
      'colorText', 'borderRadius', 'shadowDepth', 'iconStyle', 'completionMsg'];
    if (stringFields.some(field => typeof project.config[field] !== 'string')) throw new Error('Project config contains invalid text values.');
    const booleanFields = ['borderOutline', 'accordionMulti', 'accordionAnimation', 'trackCompletion'];
    if (booleanFields.some(field => typeof project.config[field] !== 'boolean')) throw new Error('Project config contains invalid behavior values.');
    if (!['colorPrimary', 'colorAccent', 'colorBg', 'colorText'].every(field => /^#[0-9a-f]{6}$/i.test(project.config[field]))) {
      throw new Error('Project colors must use six-digit hexadecimal values.');
    }
    if (!/^\d{1,3}$/.test(project.config.borderRadius)) throw new Error('Project border radius is invalid.');
    if (!['none', 'soft', 'medium', 'premium'].includes(project.config.shadowDepth)) throw new Error('Project shadow setting is invalid.');
    if (!['chevron', 'plus-minus', 'arrow'].includes(project.config.iconStyle)) throw new Error('Project icon setting is invalid.');
    if (project.config.headerStyle && !['minimal', 'editorial'].includes(project.config.headerStyle)) {
      throw new Error('Project header style setting is invalid.');
    }
    if (project.config.spacingDensity && !['compact', 'standard', 'comfortable', 'spacious'].includes(project.config.spacingDensity)) {
      throw new Error('Project spacing density setting is invalid.');
    }
    if (project.config.contextBandAlignment && !['left', 'center'].includes(project.config.contextBandAlignment)) {
      throw new Error('Project context band alignment setting is invalid.');
    }
    if (!isSafeProjectValue(project.config)) {
      throw new Error('Project item data is invalid.');
    }
    const themeResult = validateTheme(project.theme);
    if (!themeResult.valid) throw new Error(`Project theme is invalid: ${themeResult.error}`);
    if (!['light', 'dark'].includes(project.uiTheme)) throw new Error('Project UI theme is invalid.');
    const componentOverrides = normalizeComponentOverrides(project.componentOverrides);

    return {
      valid: true,
      project: {
        id: project.id.trim(),
        schemaVersion: 2,
        name: project.name.trim(),
        componentId: project.componentId.trim(),
        createdAt: new Date(project.createdAt).toISOString(),
        updatedAt: new Date(project.updatedAt).toISOString(),
        config: clone(project.config),
        theme: themeResult.theme,
        componentOverrides,
        uiTheme: project.uiTheme,
        settings: normalizeSettings(project.settings)
      }
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * @param {{ id?: any, name?: any, componentId?: any, createdAt?: any, config?: any,
 *   theme?: any, activeTheme?: any, componentOverrides?: any, uiTheme?: any, settings?: any }} project
 */
export function buildProject({
  id, name, componentId, createdAt, config, theme, activeTheme, componentOverrides, uiTheme, settings
}) {
  const now = new Date().toISOString();
  const themeCandidate = activeTheme || (isObject(theme) ? theme : getBuiltInTheme(DEFAULT_THEME_ID));
  const themeResult = validateTheme(themeCandidate);
  if (!themeResult.valid) throw new Error(themeResult.error);
  return {
    id: id || createProjectId(),
    schemaVersion: 2,
    name: String(name || 'Untitled Project').trim() || 'Untitled Project',
    componentId: componentId || 'accordion',
    createdAt: createdAt || now,
    updatedAt: now,
    config: clone(config),
    theme: themeResult.theme,
    componentOverrides: normalizeComponentOverrides(componentOverrides),
    uiTheme: uiTheme === 'dark' || theme === 'dark' ? 'dark' : 'light',
    settings: normalizeSettings(settings)
  };
}

// A record written before Schema v3 (single component, no `components` map).
function isLegacyRecord(record) {
  return isObject(record) && record.schemaVersion !== 3 && !isObject(record.components);
}

// The dashboard, project overview and export flows only understand Schema v3 course
// projects, so a validated legacy (v0/v1/v2) project is upgraded on read to a v3 project
// holding its one component. Falls back to the legacy shape (never drops the project) if
// migration throws.
function upgradeToV3(project) {
  if (project.schemaVersion === 3) return project;
  try {
    return migrateProjectToV3(project);
  } catch (error) {
    console.warn('[Storage Migration] Could not upgrade project to schema v3; keeping legacy shape:', error);
    return project;
  }
}

/**
 * One-time, non-destructive claim of pre-split shared data (27 September 2026 functional
 * audit, section 3). Runs once per browser profile (guarded by MIGRATION_MARKER_KEY) the
 * first time this module is used. Never writes to, moves, or deletes anything under a
 * LEGACY_KEYS key — every legacy record this edition doesn't confidently own (see
 * ownedByThisEdition) is left exactly where it was, for the other edition's own migration,
 * or for the author to import explicitly via importLegacyProjectById.
 */
function migrateLegacyStorage() {
  try {
    if (localStorage.getItem(MIGRATION_MARKER_KEY)) return;

    // Projects: claim only those whose clientLabel confidently names this edition. A
    // project already present under this edition's own key (by id) is left alone, so
    // re-running this function (or an author's own edits since) is always safe.
    const legacyProjects = readJson(LEGACY_KEYS.projects, []);
    if (Array.isArray(legacyProjects) && legacyProjects.length) {
      const owned = readJson(KEYS.projects, []);
      const ownedIds = new Set((Array.isArray(owned) ? owned : []).map(p => p?.id).filter(Boolean));
      const claimed = legacyProjects.filter(p => isObject(p) && !ownedIds.has(p.id) && ownedByThisEdition(p.clientLabel));
      if (claimed.length) writeJson(KEYS.projects, [...(Array.isArray(owned) ? owned : []), ...claimed]);
    }

    // Draft: a single in-progress snapshot, not a list — claim it only if this edition has
    // none of its own yet and the legacy draft's embedded project confidently names this
    // edition, so an author's actual unsaved work never silently surfaces in the other build.
    if (localStorage.getItem(KEYS.draft) === null) {
      const legacyDraft = readJson(LEGACY_KEYS.draft, null);
      if (isObject(legacyDraft) && ownedByThisEdition(legacyDraft.clientLabel)) {
        writeJson(KEYS.draft, legacyDraft);
      }
    }

    // UI preferences (favorites, recently used, settings, themes, preview device): not
    // client-owned data, so a plain one-time copy-forward is safe — worst case a preference
    // is duplicated into both editions, never lost or misattributed.
    for (const name of ['favorites', 'recentlyUsed', 'settings', 'uiTheme', 'customThemes', 'defaultTheme', 'previewDevice']) {
      if (localStorage.getItem(KEYS[name]) !== null) continue;
      const legacyValue = localStorage.getItem(LEGACY_KEYS[name]);
      if (legacyValue !== null) localStorage.setItem(KEYS[name], legacyValue);
    }

    localStorage.setItem(MIGRATION_MARKER_KEY, new Date().toISOString());
  } catch (error) {
    console.warn('[Storage Migration] Could not migrate pre-edition-split local data:', error);
  }
}

/**
 * Legacy (pre-split) projects this edition has not claimed: either their clientLabel names
 * the other edition, or it's blank/unrecognised. Nothing here has been touched — each is
 * exactly as it was under the shared key — so the dashboard can offer them for explicit
 * import (importLegacyProjectById) without any risk of silently reassigning someone else's
 * project or double-claiming one already imported.
 */
export function getUnclaimedLegacyProjects() {
  try {
    const legacyProjects = readJson(LEGACY_KEYS.projects, []);
    if (!Array.isArray(legacyProjects)) return [];
    const ownedIds = new Set(loadProjects().map(p => p.id));
    return legacyProjects
      .filter(p => isObject(p) && typeof p.id === 'string' && !ownedIds.has(p.id) && !ownedByThisEdition(p.clientLabel))
      .map(p => ({ id: p.id, name: String(p.name || p.title || 'Untitled project'), clientLabel: p.clientLabel || null, updatedAt: p.updatedAt || p.createdAt || null }));
  } catch {
    return [];
  }
}

/**
 * Explicit author action: copies one unclaimed legacy project into this edition (validated
 * and upgraded exactly like any other saveProject call). The source record in LEGACY_KEYS
 * is left untouched — this is a copy, not a move, so it stays available to the other
 * edition too and nothing is lost if the import target was a mistake.
 */
export function importLegacyProjectById(id) {
  migrateLegacyStorage();
  const legacyProjects = readJson(LEGACY_KEYS.projects, []);
  const record = Array.isArray(legacyProjects) ? legacyProjects.find(p => isObject(p) && p.id === id) : null;
  if (!record) throw new Error('That legacy project could not be found.');
  const result = validateProject(record);
  if (!result.valid) throw new Error(`That legacy project could not be imported: ${result.error}`);
  const owned = readJson(KEYS.projects, []);
  writeJson(KEYS.projects, [...(Array.isArray(owned) ? owned : []), upgradeToV3(result.project)]);
  return getProject(id);
}

export function loadProjects() {
  migrateLegacyStorage();
  const stored = readJson(KEYS.projects, []);
  if (!Array.isArray(stored)) return [];
  // Keep a one-time copy of the original records before any later save rewrites them as v3.
  const legacy = stored.filter(isLegacyRecord);
  if (legacy.length) backupLegacyProjects(legacy);
  return stored.map(validateProject).filter(result => result.valid).map(result => upgradeToV3(result.project))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function getProject(id) {
  return loadProjects().find(project => project.id === id) || null;
}

export function saveProject(project) {
  const result = validateProject(project);
  if (!result.valid) throw new Error(result.error);
  const projects = loadProjects();
  const index = projects.findIndex(item => item.id === result.project.id);
  if (index >= 0) projects[index] = result.project;
  else projects.push(result.project);
  writeJson(KEYS.projects, projects);
  return result.project;
}

export function renameProject(id, name) {
  const project = getProject(id);
  if (!project) throw new Error('Project not found.');
  return saveProject({ ...project, name: String(name || '').trim(), updatedAt: new Date().toISOString() });
}

export function duplicateProject(id) {
  const project = getProject(id);
  if (!project) throw new Error('Project not found.');
  if (project.schemaVersion === 3) {
    const cloneData = JSON.parse(JSON.stringify(project));
    return saveProject(buildProjectSchemaV3({
      ...cloneData,
      id: null,
      name: `${project.name} Copy`,
      createdAt: null,
      updatedAt: null
    }));
  }
  return saveProject(buildProject({ ...project, id: null, createdAt: null, name: `${project.name} Copy` }));
}

export function deleteProject(id) {
  const projects = loadProjects();
  const filtered = projects.filter(project => project.id !== id);
  if (filtered.length === projects.length) return false;
  writeJson(KEYS.projects, filtered);
  return true;
}

export function toggleFavoriteProject(id) {
  const project = getProject(id);
  if (!project) throw new Error('Project not found.');
  return saveProject({
    ...project,
    favorite: !project.favorite,
    updatedAt: new Date().toISOString()
  });
}

export function exportProjectJson(id) {
  const project = getProject(id);
  if (!project) throw new Error('Project not found.');
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
  const result = validateProject(parsed);
  if (!result.valid) throw new Error(result.error);
  if (result.project.schemaVersion === 3) {
    const imported = buildProjectSchemaV3({
      ...result.project,
      id: null,
      createdAt: null,
      updatedAt: null,
      name: result.project.name
    });
    return saveProject(imported);
  }
  const imported = buildProject({ ...result.project, id: null, createdAt: null, name: result.project.name });
  return saveProject(imported);
}

export function saveDraft(project) { writeJson(KEYS.draft, project); }
export function loadDraft() {
  migrateLegacyStorage();
  const result = validateProject(readJson(KEYS.draft, null));
  return result.valid ? result.project : null;
}
export function clearDraft() {
  try { localStorage.removeItem(KEYS.draft); } catch { /* Storage may be unavailable in privacy mode. */ }
}

/** JSON with object keys sorted, so equal content compares equal regardless of key order. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * What a project *says*, independent of its record shape: legacy single-component records and
 * schema v3 course projects fingerprint the same when they hold the same name and blocks.
 * Timestamps and ids are deliberately excluded.
 */
function contentFingerprint(project) {
  const parts = isObject(project?.components)
    ? Object.values(project.components).map(comp => ({ type: comp.type, config: comp.config }))
    : [{ type: project?.componentId, config: project?.config }];
  return stableStringify({ name: project?.name || '', parts });
}

/**
 * A working draft is only worth offering back when it holds something the saved project does
 * not. After an explicit save the draft equals the project, and "Unsaved working draft" would
 * be wrong.
 * @returns {{ recoverable: boolean, reason: 'never-saved'|'differs'|'identical', savedName: string }}
 */
export function compareDraftToSaved(draft, savedProjects = loadProjects()) {
  if (!draft) return { recoverable: false, reason: 'identical', savedName: '' };
  const saved = savedProjects.find(project => project.id === draft.id);
  if (!saved) return { recoverable: true, reason: 'never-saved', savedName: '' };
  const same = contentFingerprint(draft) === contentFingerprint(saved);
  return { recoverable: !same, reason: same ? 'identical' : 'differs', savedName: saved.name };
}

export function loadUiTheme() {
  migrateLegacyStorage();
  try { return localStorage.getItem(KEYS.uiTheme) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function saveUiTheme(theme) {
  try { localStorage.setItem(KEYS.uiTheme, theme); }
  catch { throw new Error('The builder interface theme could not be saved locally.'); }
}

// Backwards-compatible aliases for integrations that used these names for the builder UI mode.
export const loadTheme = loadUiTheme;
export const saveTheme = saveUiTheme;

export function loadCustomThemes() {
  migrateLegacyStorage();
  const stored = readJson(KEYS.customThemes, []);
  if (!Array.isArray(stored)) return [];
  return stored.map(validateTheme).filter(result => result.valid && !result.theme.isBuiltIn && !result.theme.isLocked)
    .map(result => result.theme).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveCustomTheme(theme) {
  const result = validateTheme(theme);
  if (!result.valid) throw new Error(result.error);
  if (result.theme.isBuiltIn || result.theme.isLocked) throw new Error('Built-in and locked themes cannot be saved as custom themes.');
  if (BUILT_IN_THEMES.some(item => item.id === result.theme.id)) throw new Error('Custom theme id conflicts with a built-in theme.');
  const themes = loadCustomThemes();
  const index = themes.findIndex(item => item.id === result.theme.id);
  if (index >= 0) themes[index] = result.theme;
  else themes.push(result.theme);
  writeJson(KEYS.customThemes, themes);
  return result.theme;
}

export function deleteCustomTheme(id) {
  const themes = loadCustomThemes();
  const next = themes.filter(theme => theme.id !== id);
  if (next.length === themes.length) return false;
  writeJson(KEYS.customThemes, next);
  if (loadDefaultThemeId() === id) saveDefaultThemeId(DEFAULT_THEME_ID);
  return true;
}

export function loadDefaultThemeId() {
  migrateLegacyStorage();
  try {
    const id = localStorage.getItem(KEYS.defaultTheme);
    const exists = id && [...BUILT_IN_THEMES, ...loadCustomThemes()].some(theme => theme.id === id);
    return exists ? id : DEFAULT_THEME_ID;
  } catch { return DEFAULT_THEME_ID; }
}

export function saveDefaultThemeId(id) {
  const exists = [...BUILT_IN_THEMES, ...loadCustomThemes()].some(theme => theme.id === id);
  if (!exists) throw new Error('Default theme was not found.');
  try { localStorage.setItem(KEYS.defaultTheme, id); }
  catch { throw new Error('The default theme could not be saved locally.'); }
  return id;
}

export function loadFavorites() {
  migrateLegacyStorage();
  const value = readJson(KEYS.favorites, []);
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}
export function saveFavorites(favorites) { writeJson(KEYS.favorites, [...favorites]); }

// P11: "Recently used" is ordered most-recent-first, capped so the list stays a quick
// glance rather than a second catalog, and de-duplicated by moving an existing entry to
// the front rather than storing it twice. Recording happens exactly once per selection —
// wherever a component becomes appState.selectedComponent (picking a fresh component or
// opening/restoring a saved project) — not on every keystroke or re-render.
export const RECENTLY_USED_LIMIT = 8;

export function loadRecentlyUsed() {
  migrateLegacyStorage();
  const value = readJson(KEYS.recentlyUsed, []);
  return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, RECENTLY_USED_LIMIT) : [];
}
export function saveRecentlyUsed(recentlyUsed) { writeJson(KEYS.recentlyUsed, [...recentlyUsed].slice(0, RECENTLY_USED_LIMIT)); }

export function withRecentlyUsedEntry(recentlyUsed, componentId) {
  return [componentId, ...recentlyUsed.filter(id => id !== componentId)].slice(0, RECENTLY_USED_LIMIT);
}

export function loadPreviewDevice() {
  migrateLegacyStorage();
  const value = readJson(KEYS.previewDevice, DEFAULT_DEVICE_MODE);
  return isValidDeviceMode(value) ? value : DEFAULT_DEVICE_MODE;
}
export function savePreviewDevice(mode) {
  writeJson(KEYS.previewDevice, isValidDeviceMode(mode) ? mode : DEFAULT_DEVICE_MODE);
}

export function loadSettings() { migrateLegacyStorage(); return normalizeSettings(readJson(KEYS.settings, DEFAULT_SETTINGS)); }
export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  writeJson(KEYS.settings, normalized);
  return normalized;
}
