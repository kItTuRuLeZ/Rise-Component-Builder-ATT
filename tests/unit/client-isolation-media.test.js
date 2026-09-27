// @vitest-environment node
//
// 27 September 2026 functional audit, section 3: media isolation. Before this, AT&T and PMI
// opened the exact same IndexedDB database, so "a media asset showed uses in both projects."
// This proves, against the real module, that migrateLegacyMediaForClaimedProjects copies only
// the media this edition's claimed projects actually reference, from the pre-split shared
// database into this edition's own — and never deletes the legacy copy.
import { beforeEach, describe, expect, test } from 'vitest';
import {
  createIndexedDBMediaStore, migrateLegacyMediaForClaimedProjects, MEDIA_DB_NAME, LEGACY_MEDIA_DB_NAME
} from '../../js/media-storage.js';
import { saveProject } from '../../js/storage.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../js/project-schema.js';
import { createEmptyItemMedia } from '../../js/item-media.js';
import { createMediaReference } from '../../js/media.js';
import { memoryLocalStorage, createFakeIndexedDB } from '../fixtures/index.js';

function blobFile(name, type, bytes) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function mediaRecord(id, name) {
  return { id, kind: 'image', name, sanitizedName: name, mimeType: 'image/png', size: PNG.byteLength, blob: blobFile(name, 'image/png', PNG), createdAt: new Date().toISOString() };
}

function saveOwnedProjectReferencing(mediaId) {
  const ref = createMediaReference(mediaRecord(mediaId, `${mediaId}.png`));
  const media = { ...createEmptyItemMedia('image'), sourceType: 'upload', mediaId: ref.mediaId, fileName: ref.name, mimeType: ref.mimeType };
  const comp = createComponentInstance({
    id: 'c1', name: 'Lesson', type: 'accordion',
    config: { items: [{ title: 'One', content: 'Body', media }] }
  });
  return saveProject(buildProjectSchemaV3({
    name: 'Media Course', sectionOrder: ['s1'],
    sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) },
    components: { c1: comp }
  }));
}

let fakeIndexedDB;

beforeEach(() => {
  globalThis.localStorage = memoryLocalStorage();
  fakeIndexedDB = createFakeIndexedDB();
});

describe('migrateLegacyMediaForClaimedProjects', () => {
  test('copies media referenced by a claimed project from the legacy db into this edition’s own', async () => {
    const legacyStore = createIndexedDBMediaStore(fakeIndexedDB, LEGACY_MEDIA_DB_NAME);
    await legacyStore.put(mediaRecord('img-referenced', 'referenced.png'));
    saveOwnedProjectReferencing('img-referenced');

    await migrateLegacyMediaForClaimedProjects(fakeIndexedDB);

    const targetStore = createIndexedDBMediaStore(fakeIndexedDB, MEDIA_DB_NAME);
    const migrated = await targetStore.get('img-referenced');
    expect(migrated?.name).toBe('referenced.png');

    // Never deleted from the legacy database.
    const stillInLegacy = await legacyStore.get('img-referenced');
    expect(stillInLegacy?.name).toBe('referenced.png');
  });

  test('does not copy legacy media no claimed project references', async () => {
    const legacyStore = createIndexedDBMediaStore(fakeIndexedDB, LEGACY_MEDIA_DB_NAME);
    await legacyStore.put(mediaRecord('img-unused', 'unused.png'));
    // A project exists, but references a different id.
    saveOwnedProjectReferencing('img-referenced-2');

    await migrateLegacyMediaForClaimedProjects(fakeIndexedDB);

    const targetStore = createIndexedDBMediaStore(fakeIndexedDB, MEDIA_DB_NAME);
    expect(await targetStore.get('img-unused')).toBeUndefined();
    // Still exactly where it was.
    expect((await legacyStore.get('img-unused'))?.name).toBe('unused.png');
  });

  test('runs once per browser profile: a later manual change in the target db is not clobbered by re-running it', async () => {
    const legacyStore = createIndexedDBMediaStore(fakeIndexedDB, LEGACY_MEDIA_DB_NAME);
    await legacyStore.put(mediaRecord('img-x', 'original.png'));
    saveOwnedProjectReferencing('img-x');
    await migrateLegacyMediaForClaimedProjects(fakeIndexedDB);

    const targetStore = createIndexedDBMediaStore(fakeIndexedDB, MEDIA_DB_NAME);
    await targetStore.put(mediaRecord('img-x', 'author-replaced.png'));

    await migrateLegacyMediaForClaimedProjects(fakeIndexedDB); // second call: marker already set
    expect((await targetStore.get('img-x'))?.name).toBe('author-replaced.png');
  });
});
