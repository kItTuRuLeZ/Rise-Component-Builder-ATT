// Portable project packaging: a saved project's uploaded media currently lives only in
// this browser's IndexedDB (docs/MEDIA-ASSET-PIPELINE.md) — the plain `.rise.json` export
// (js/storage.js#importProjectJson, unchanged, still fully supported) carries only media
// *references* (a mediaId + metadata), so opening that file in a different browser or
// after clearing site data reproduces exactly the existing "missing media" experience
// (js/media-storage.js#restoreMediaReferences), never something worse. This module adds a
// second, opt-in format — a `.rise-project.zip` containing `project.json` plus the actual
// media bytes under `media/<mediaId>` — so the project can travel with its media instead.

import { collectMediaReferences, computeFileHash, sanitizeAssetFilename } from './media.js';
import { getMediaRecord, saveMediaRecord } from './media-storage.js';
import { buildProject, saveProject, validateProject } from './storage.js';
import { buildProjectSchemaV3 } from './project-schema.js';
import { registerLocalBlobURL, revokeLocalBlobURL, slugify } from './utilities.js';
import { createZip, readZip } from './zip.js';

/**
 * @param {object} project a project object already saved via js/storage.js (the shape
 *   `getProject`/`buildProject` return)
 * @param {{ store?: any }} [options]
 * @returns {Promise<{ blob: Blob, size: number, missing: string[] }>}
 *   `missing` lists any referenced media whose blob is no longer in IndexedDB — packaging
 *   still succeeds (the project.json travels either way), it just can't include what it
 *   doesn't have; the resulting package behaves exactly like a plain JSON export for those
 *   specific assets when reopened.
 */
export async function exportProjectPackage(project, options = {}) {
  const references = collectMediaReferences(project.config || project);
  const entries = [{ path: 'project.json', data: JSON.stringify(project, null, 2) }];
  const missing = [];
  for (const reference of references) {
    const record = await getMediaRecord(reference.mediaId, options.store);
    if (!record?.blob) { missing.push(reference.name); continue; }
    entries.push({ path: `media/${reference.mediaId}`, data: await record.blob.arrayBuffer() });
  }
  const blob = createZip(entries);
  return { blob, size: blob.size, missing };
}

/**
 * @param {Blob} zipBlob
 * @param {{ store?: any }} [options]
 * @returns {Promise<{ project: object, restoredMediaCount: number, missingMedia: string[] }>}
 *   Mirrors js/storage.js#importProjectJson's contract (validates, assigns a fresh project
 *   id, saves it) with one addition: any media reference the reopened project needs that
 *   isn't already in this browser's IndexedDB is restored from the package's `media/`
 *   entries before the project is returned, so the normal open-project flow
 *   (js/media-storage.js#restoreMediaReferences, called from app.js#applyProject) finds it
 *   already there and never needs to report it missing.
 */
/**
 * Says what a ZIP that is not a project backup actually is, and what to use instead. Several of
 * this Builder's exports are ZIPs that look alike but are not restorable: a hosted component or
 * course package is a published copy (an index.html and assets), not the editable project.
 * @param {{ path: string, data: Uint8Array }[]} entries
 */
export function describeNonProjectZip(entries) {
  const paths = entries.map(entry => entry.path.replace(/\\/g, '/').toLowerCase());
  const has = test => paths.some(test);
  const instead = 'To keep an editable copy of a project, use Export Backup (.rise-project.zip) in the project menu on the dashboard or in the editor Open dialog: it includes the media. Export JSON (content only) saves the content without the media files. (Export for Hosting on a course makes a hosted copy, which cannot be imported back.)';
  if (has(p => p.endsWith('imsmanifest.xml'))) {
    return `This ZIP is a SCORM package, not an editable project backup, so it cannot be imported as a project. To add tools to a published Rise course, use Post-Publish. ${instead}`;
  }
  if (has(p => p === 'project-backup.json') || has(p => p === 'manifest.json')) {
    return `This ZIP is a course pack exported for hosting (one folder per component), not an editable project backup, so it cannot be imported as a project. ${instead}`;
  }
  if (has(p => p === 'index.html' || p.endsWith('/index.html'))) {
    return `This ZIP is a hosted web package (it contains an index.html), not an editable project backup, so it cannot be imported as a project. ${instead}`;
  }
  return `This ZIP is not a Rise Component Builder project package (it has no project.json). ${instead}`;
}

export async function importProjectPackage(zipBlob, options = {}) {
  let entries;
  try {
    entries = await readZip(zipBlob);
  } catch (error) {
    throw new Error(`This does not appear to be a valid project package: ${error.message}`);
  }
  const projectEntry = entries.find(entry => entry.path === 'project.json');
  if (!projectEntry) throw new Error(describeNonProjectZip(entries));

  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(projectEntry.data)); }
  catch { throw new Error('The project.json inside this package is not valid JSON.'); }

  const result = validateProject(parsed);
  if (!result.valid) throw new Error(result.error);

  const mediaBytesById = new Map(
    entries.filter(entry => entry.path.startsWith('media/')).map(entry => [entry.path.slice('media/'.length), entry.data])
  );
  const references = collectMediaReferences(result.project.config || result.project);
  const missingMedia = [];
  let restoredMediaCount = 0;
  for (const reference of references) {
    const existing = await getMediaRecord(reference.mediaId, options.store);
    if (existing?.blob) continue; // already present in this browser — nothing to restore
    const bytes = mediaBytesById.get(reference.mediaId);
    if (!bytes) { missingMedia.push(reference.name); continue; }
    const blob = new Blob([Uint8Array.from(bytes)], { type: reference.mimeType });
    await saveMediaRecord({
      id: reference.mediaId, schemaVersion: reference.schemaVersion, name: reference.name,
      sanitizedName: sanitizeAssetFilename(reference.name), mimeType: reference.mimeType, size: blob.size,
      createdAt: reference.createdAt, kind: reference.kind, duration: reference.duration,
      dimensions: null, altText: '', decorative: false, caption: '', transcript: '', resized: false,
      contentHash: await computeFileHash(blob), blob
    }, options.store);
    restoredMediaCount += 1;
  }

  // Same split as storage.js#importProjectJson: a course project (Schema v3: sections, components)
  // must be rebuilt as v3. Rebuilding it with buildProject() (the single-component v2 builder) dropped
  // its structure and failed with a cryptic '"undefined" is not valid JSON', so a course project's
  // package could never be imported.
  const imported = result.project.schemaVersion === 3
    ? buildProjectSchemaV3({ ...result.project, id: null, createdAt: null, updatedAt: null, name: result.project.name })
    : buildProject({ ...result.project, id: null, createdAt: null, name: result.project.name });
  const saved = saveProject(imported);
  return { project: saved, restoredMediaCount, missingMedia };
}

// `.rise-project.zip` (not plain `.zip`) so it's visually distinct from the "Rise Project
// ZIP" component-export format (js/export.js#buildRiseProjectZip) — the two are unrelated
// archive shapes (one is a re-importable Builder project, the other is a Rise-embeddable
// static bundle) and giving them the same extension would invite confusing either for the
// other. A plain `.zip` is still accepted for import (see isProjectPackageFile) since a
// user may have renamed the file; importProjectPackage() gives a clear, readable error
// ("missing its project.json") rather than a cryptic one if the wrong kind of ZIP is opened.
export function downloadProjectPackage(name, blob) {
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(name || 'rise-project')}.rise-project.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function isProjectPackageFile(file) {
  return /\.zip$/i.test(file?.name || '');
}
