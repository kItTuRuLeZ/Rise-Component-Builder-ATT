import { blobToDataURL, collectMediaReferences, createMediaReference, isMediaReference } from './media.js';
import { registerLocalBlobURL, revokeLocalBlobURL } from './utilities.js';
import { EDITION } from './client-isolation.js';

// Edition-scoped: AT&T and PMI share one browser origin, so before this existed both builds
// opened the exact same IndexedDB database and could read/delete each other's uploads
// (27 September 2026 functional audit, section 3). LEGACY_MEDIA_DB_NAME is the pre-split
// shared database — read-only migration source, see migrateLegacyMediaForClaimedProjects.
export const MEDIA_DB_NAME = `rise-component-builder-${EDITION.toLowerCase()}-media`;
export const LEGACY_MEDIA_DB_NAME = 'rise-component-builder-media';
export const MEDIA_DB_VERSION = 1;
export const MEDIA_STORE_NAME = 'media';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

export function createIndexedDBMediaStore(indexedDBFactory = globalThis.indexedDB, dbName = MEDIA_DB_NAME) {
  let databasePromise;

  function open() {
    if (!indexedDBFactory) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDBFactory.open(dbName, MEDIA_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
          const store = database.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('Could not open the local media database.'));
      };
      request.onblocked = () => reject(new Error('The local media database is blocked by another tab.'));
    });
    return databasePromise;
  }

  async function transact(mode, operation) {
    const database = await open();
    const transaction = database.transaction(MEDIA_STORE_NAME, mode);
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    return operation(store, transaction);
  }

  return {
    open,
    async put(record) {
      if (!record?.id || !(record.blob instanceof Blob)) throw new Error('A valid media record and Blob are required.');
      return transact('readwrite', store => requestResult(store.put(record)));
    },
    async get(id) {
      return transact('readonly', store => requestResult(store.get(id)));
    },
    async delete(id) {
      return transact('readwrite', store => requestResult(store.delete(id)));
    },
    async getAll() {
      return transact('readonly', store => requestResult(store.getAll()));
    }
  };
}

const defaultStore = createIndexedDBMediaStore();
const runtimeObjectURLs = new Map();

function rawOpenDatabase(indexedDBFactory, dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(dbName, MEDIA_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        const store = database.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open a local media database.'));
    request.onblocked = () => reject(new Error('A local media database is blocked by another tab.'));
  });
}
const rawGet = (database, id) => requestResult(database.transaction(MEDIA_STORE_NAME, 'readonly').objectStore(MEDIA_STORE_NAME).get(id));
const rawPut = (database, record) => requestResult(database.transaction(MEDIA_STORE_NAME, 'readwrite').objectStore(MEDIA_STORE_NAME).put(record));

/**
 * One-time, non-destructive copy of the media every project this edition has already
 * claimed (js/storage.js#migrateLegacyStorage) actually references, from the pre-split
 * shared database into this edition's own (27 September 2026 functional audit, section 3).
 * Never deletes from LEGACY_MEDIA_DB_NAME — a media record belonging to a project this
 * edition hasn't claimed (or that the author never imports) simply stays there, exactly as
 * it was, available to the other edition or to a later explicit import.
 *
 * Talks to both databases through their own direct connections rather than through
 * `defaultStore`/`createIndexedDBMediaStore`'s open()+transact(), so a media read that
 * happens to fire while this is still running can never deadlock waiting on itself.
 */
export async function migrateLegacyMediaForClaimedProjects(indexedDBFactory = globalThis.indexedDB) {
  const marker = `rise-builder-${EDITION.toLowerCase()}-media-migrated-v1`;
  if (!indexedDBFactory) return;
  try {
    if (localStorage.getItem(marker)) return;
    const { loadProjects } = await import('./storage.js');
    const projects = loadProjects();
    const mediaIds = new Set();
    for (const project of projects) {
      const components = project.components ? Object.values(project.components) : [project];
      for (const comp of components) {
        collectMediaReferences(comp?.config).forEach(ref => {
          const id = ref?.mediaId || ref?.assetId;
          if (id) mediaIds.add(id);
        });
      }
    }
    if (mediaIds.size) {
      const legacyDb = await rawOpenDatabase(indexedDBFactory, LEGACY_MEDIA_DB_NAME);
      const targetDb = await rawOpenDatabase(indexedDBFactory, MEDIA_DB_NAME);
      for (const id of mediaIds) {
        const existing = await rawGet(targetDb, id);
        if (existing) continue;
        const record = await rawGet(legacyDb, id);
        if (record) await rawPut(targetDb, record);
      }
      legacyDb.close();
      targetDb.close();
    }
    localStorage.setItem(marker, new Date().toISOString());
  } catch (error) {
    console.warn('[Media Storage Migration] Could not migrate pre-edition-split media:', error);
  }
}
// Fire-and-forget at module load, same as js/storage.js's synchronous migration: the first
// ever load after this edition split runs it once (guarded by the marker above); everything
// else this module does (get/put/delete) works normally regardless of timing, and simply
// won't see a not-yet-migrated record until this finishes — which is fast (typically well
// under the time it takes an author to open a project) and self-heals on the next read.
if (typeof globalThis.indexedDB !== 'undefined') {
  migrateLegacyMediaForClaimedProjects().catch(() => { /* already logged above */ });
}

export async function saveMediaRecord(record, store = defaultStore) {
  try {
    await store.put(record);
  } catch (error) {
    // Same friendly-rewrite policy as js/storage.js's localStorage quota handling —
    // IndexedDB throws a QuotaExceededError under the same DOMException name.
    throw new Error(error?.name === 'QuotaExceededError'
      ? 'This browser’s local media storage is full. Delete unused projects/media or free up disk space, then try again.'
      : 'This browser could not store the uploaded file locally.');
  }
  return createMediaReference(record);
}

export async function getMediaRecord(id, store = defaultStore) {
  return store.get(id);
}

// Finds an already-stored record with the same content hash and kind, so an author
// re-uploading the same picture (even under a different filename) can reuse the
// existing asset instead of the app silently storing a second copy. Never blocks an
// upload — a `null` contentHash (digest unavailable, see js/media.js#computeFileHash)
// simply means no duplicate can be found, not that anything is wrong with the file.
export async function findDuplicateByHash(contentHash, kind, store = defaultStore) {
  if (!contentHash) return null;
  const all = await store.getAll();
  return all.find(record => record.contentHash === contentHash && record.kind === kind) || null;
}

export function peekMediaObjectURL(id) {
  return runtimeObjectURLs.get(id) || '';
}

export async function ensureMediaObjectURL(id, store = defaultStore) {
  if (runtimeObjectURLs.has(id)) return runtimeObjectURLs.get(id);
  const record = await store.get(id);
  if (!record?.blob) return '';
  const url = registerLocalBlobURL(URL.createObjectURL(record.blob));
  runtimeObjectURLs.set(id, url);
  return url;
}

export function releaseMediaObjectURL(id) {
  const url = runtimeObjectURLs.get(id);
  if (!url) return false;
  runtimeObjectURLs.delete(id);
  if (url.startsWith('blob:')) {
    revokeLocalBlobURL(url);
  }
  return true;
}

export function releaseAllMediaObjectURLs() {
  [...runtimeObjectURLs.keys()].forEach(releaseMediaObjectURL);
}

export function pruneMediaObjectURLs(config) {
  const active = new Set(collectMediaReferences(config).map(reference => reference.mediaId || reference.assetId).filter(Boolean));
  [...runtimeObjectURLs.keys()].forEach(id => { if (!active.has(id)) releaseMediaObjectURL(id); });
}

export async function deleteMediaRecord(id, store = defaultStore) {
  releaseMediaObjectURL(id);
  await store.delete(id);
}

export async function restoreMediaReferences(value, store = defaultStore) {
  const references = collectMediaReferences(value);
  const missing = [];
  await Promise.all(references.map(async reference => {
    const id = reference.mediaId || reference.assetId;
    if (!id || !await ensureMediaObjectURL(id, store)) missing.push(id || 'unknown');
  }));
  return { restored: references.length - missing.length, missing };
}

export function resolveMediaAsset(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value;
  }
  if (isMediaReference(value)) {
    const id = value.mediaId || value.assetId;
    if (typeof value.src === 'string' && (value.src.startsWith('data:') || value.src.startsWith('assets/') || value.src.startsWith('http://') || value.src.startsWith('https://') || value.src.startsWith('./'))) {
      return value.src;
    }
    return peekMediaObjectURL(id) || (typeof value.src === 'string' ? value.src : '') || '';
  }
  if (value && typeof value === 'object' && (value.mediaId || value.assetId)) {
    const id = value.mediaId || value.assetId;
    if (typeof value.src === 'string' && (value.src.startsWith('data:') || value.src.startsWith('assets/') || value.src.startsWith('http://') || value.src.startsWith('https://') || value.src.startsWith('./'))) {
      return value.src;
    }
    return peekMediaObjectURL(id) || (typeof value.src === 'string' ? value.src : '') || '';
  }
  if (value && typeof value === 'object' && typeof value.src === 'string') {
    return value.src;
  }
  return '';
}

export function resolveMediaReference(value) {
  return resolveMediaAsset(value);
}

export function resolveMediaReferencesForPreview(value) {
  if (!value) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  // 1. If this object is an item-media structure (e.g. from item-media.js)
  if (typeof value === 'object' && !Array.isArray(value) && (value.placement !== undefined || (value.type && ['image', 'audio', 'video', 'none'].includes(value.type) && (value.mediaId || value.src !== undefined || value.alt !== undefined || value.caption !== undefined)))) {
    const isExportedSrc = typeof value.src === 'string' && (value.src.startsWith('data:') || value.src.startsWith('assets/') || value.src.startsWith('http://') || value.src.startsWith('https://') || value.src.startsWith('./'));
    const mediaId = value.mediaId || (value.src && typeof value.src === 'object' ? (value.src.mediaId || value.src.assetId) : '');
    const resolvedSrc = isExportedSrc
      ? value.src
      : (mediaId ? (peekMediaObjectURL(mediaId) || (typeof value.src === 'string' ? value.src : '')) : (typeof value.src === 'string' ? value.src : resolveMediaAsset(value.src)));

    const isExportedPoster = typeof value.posterSrc === 'string' && (value.posterSrc.startsWith('data:') || value.posterSrc.startsWith('assets/') || value.posterSrc.startsWith('http://') || value.posterSrc.startsWith('https://') || value.posterSrc.startsWith('./'));
    const posterMediaId = value.posterMediaId || (value.posterSrc && typeof value.posterSrc === 'object' ? (value.posterSrc.mediaId || value.posterSrc.assetId) : '');
    const resolvedPoster = isExportedPoster
      ? value.posterSrc
      : (posterMediaId ? (peekMediaObjectURL(posterMediaId) || (typeof value.posterSrc === 'string' ? value.posterSrc : '')) : (typeof value.posterSrc === 'string' ? value.posterSrc : resolveMediaAsset(value.posterSrc)));

    return {
      ...value,
      src: resolvedSrc || (typeof value.src === 'string' ? value.src : ''),
      posterSrc: resolvedPoster || (typeof value.posterSrc === 'string' ? value.posterSrc : '')
    };
  }

  // 2. If this is a standalone media reference (e.g. iconImage, backgroundImage, beforeImage, etc.)
  if (isMediaReference(value)) {
    return resolveMediaAsset(value);
  }

  // 3. Arrays
  if (Array.isArray(value)) {
    return value.map(resolveMediaReferencesForPreview);
  }

  // 4. Other objects (e.g. root config, item objects)
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveMediaReferencesForPreview(entry)]));
}

export async function ensureAllProjectMediaObjectURLs(project, store = defaultStore) {
  if (!project) return { restored: 0, missing: [] };
  const references = collectMediaReferences(project);
  const missing = [];
  await Promise.all(references.map(async ref => {
    const id = ref.mediaId || ref.assetId;
    if (id) {
      const url = await ensureMediaObjectURL(id, store);
      if (!url) missing.push(id);
    }
  }));
  return { restored: references.length - missing.length, missing };
}

export function getRuntimeMediaURLCount() {
  return runtimeObjectURLs.size;
}

export async function listMedia(store = defaultStore) {
  return store.getAll();
}

export async function saveMedia(reference, blob, store = defaultStore) {
  return saveMediaRecord({ ...reference, blob }, store);
}

export async function deleteMedia(id, store = defaultStore) {
  releaseMediaObjectURL(id);
  return store.delete(id);
}

export { defaultStore as mediaStore };
