/**
 * @file client-isolation.js
 * AT&T and PMI editions of this Builder are two separate repositories deployed to two paths
 * of the SAME origin (`kitturulez.github.io/Rise-Component-Builder-ATT/` and `.../-PMI/`).
 * `localStorage` and IndexedDB are scoped per ORIGIN, not per path, so before this file
 * existed both editions read and wrote the exact same keys — `rise-builder-projects-v1`,
 * the `rise-component-builder-media` database, and so on — and could list, open, edit or
 * delete each other's projects and media in the same browser profile
 * (27 September 2026 functional audit, section 3).
 *
 * `EDITION` is the one line that differs between this file and the PMI repo's copy of it —
 * a literal baked into the build, never detected at runtime (from a URL, a query param, etc.),
 * so it can never be ambiguous or spoofed. Every other module that needs to namespace a key
 * imports from here, so the two repos can never disagree with themselves about their own name.
 */

export const EDITION = 'ATT';
const EDITION_SLUG = EDITION.toLowerCase();

/**
 * Free-text `clientLabel` values a project is confidently treated as belonging to this
 * edition for — the default `buildProjectSchemaV3` sets (js/project-schema.js) plus the
 * spellings an author is likely to type into the dashboard's "Client / Brand Tag" field.
 * A project whose label matches neither edition's list (blank, or something else entirely,
 * e.g. an agency name) is never auto-claimed by either side — see `migrateLegacyStorage`.
 */
const CLIENT_LABEL_ALIASES = ['at&t', 'att'];

export function ownedByThisEdition(clientLabel) {
  const normalized = String(clientLabel || '').trim().toLowerCase();
  return CLIENT_LABEL_ALIASES.includes(normalized);
}

/** `rise-builder-projects-v1` -> `rise-builder-att-projects-v1` (also covers the one key
 * with no `-v1` suffix, `rise-builder-theme` -> `rise-builder-att-theme`). */
export function namespacedKey(baseKey) {
  return baseKey.replace(/^rise-builder-/, `rise-builder-${EDITION_SLUG}-`);
}
