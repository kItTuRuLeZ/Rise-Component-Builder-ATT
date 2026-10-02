import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';

import { prepareMediaFile } from '../js/media.js';
import { createIndexedDBMediaStore, getMediaRecord, saveMediaRecord } from '../js/media-storage.js';
import { buildProject } from '../js/storage.js';
import { exportProjectPackage, importProjectPackage, isProjectPackageFile } from '../js/project-package.js';
import { componentConfig, createFakeIndexedDB, memoryLocalStorage } from './fixtures/index.js';

function fileBlob(name, type, content) {
  const blob = new Blob([content], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

beforeEach(() => { globalThis.localStorage = memoryLocalStorage(); });

test('a saved project with uploaded media reopens with that media intact after a round trip through a package', async () => {
  // Store A / Store B stand in for two different browser profiles — the whole point of
  // this format is that B never had the media in its own IndexedDB to begin with.
  const storeA = createIndexedDBMediaStore(createFakeIndexedDB());
  const storeB = createIndexedDBMediaStore(createFakeIndexedDB());

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7]);
  const record = await prepareMediaFile(fileBlob('photo.png', 'image/png', png), 'image', { id: 'portable-img' });
  const reference = await saveMediaRecord(record, storeA);

  const project = buildProject({
    name: 'Portable Project', componentId: 'image-gallery',
    config: componentConfig([{ title: 'Image', content: reference }]),
    settings: { defaultFont: 'Lato', exportFormat: 'web', autosave: true, aiEnabled: false }
  });

  const packaged = await exportProjectPackage(project, { store: storeA });
  assert.deepEqual(packaged.missing, []);

  assert.equal(await getMediaRecord(reference.mediaId, storeB), undefined, 'store B must start without the media (this is the scenario the format exists for)');
  const imported = await importProjectPackage(packaged.blob, { store: storeB });
  assert.deepEqual(imported.missingMedia, []);
  assert.equal(imported.restoredMediaCount, 1);
  assert.equal(imported.project.name, 'Portable Project');
  assert.notEqual(imported.project.id, project.id, 'importing assigns a fresh project id, same as importProjectJson');

  const restored = await getMediaRecord(reference.mediaId, storeB);
  assert.ok(restored?.blob, 'the media record must now exist in store B');
  assert.equal(restored.mimeType, 'image/png');
  assert.deepEqual([...new Uint8Array(await restored.blob.arrayBuffer())], [...png]);
});

test('importing a package does not re-fetch media that already exists locally', async () => {
  const store = createIndexedDBMediaStore(createFakeIndexedDB());
  const record = await prepareMediaFile(fileBlob('photo.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])), 'image', { id: 'already-here' });
  const reference = await saveMediaRecord(record, store);
  const project = buildProject({
    name: 'Same Browser Reimport', componentId: 'image-gallery',
    config: componentConfig([{ title: 'Image', content: reference }]),
    settings: { defaultFont: 'Lato', exportFormat: 'web', autosave: true, aiEnabled: false }
  });
  const packaged = await exportProjectPackage(project, { store });
  const imported = await importProjectPackage(packaged.blob, { store });
  assert.equal(imported.restoredMediaCount, 0, 'media already present locally should not be counted as "restored"');
});

test('a package missing its project.json gives a readable error, not a crash', async () => {
  const { createZip } = await import('../js/zip.js');
  const bogusZip = createZip([{ path: 'assets/photo.png', data: new Uint8Array([1, 2, 3]) }]);
  // The message now says what the ZIP is not and what to use instead (see describeNonProjectZip).
  await assert.rejects(() => importProjectPackage(bogusZip), /has no project\.json.*Export Backup/i);
});

test('a package whose project.json fails validation gives the same readable error validateProject would', async () => {
  const { createZip } = await import('../js/zip.js');
  const badProjectZip = createZip([{ path: 'project.json', data: JSON.stringify({ schemaVersion: 2 }) }]);
  await assert.rejects(() => importProjectPackage(badProjectZip));
});

test('a project referencing media that is in neither the package nor local storage reports it as missing with a readable message, rather than throwing', async () => {
  const store = createIndexedDBMediaStore(createFakeIndexedDB());
  const project = buildProject({
    name: 'Old Project With Gone Media', componentId: 'image-gallery',
    config: componentConfig([{
      title: 'Image',
      content: { source: 'upload', mediaId: 'never-existed', schemaVersion: 1, kind: 'image', name: 'gone.png', mimeType: 'image/png', size: 10, createdAt: new Date().toISOString(), duration: null }
    }]),
    settings: { defaultFont: 'Lato', exportFormat: 'web', autosave: true, aiEnabled: false }
  });
  // A package built without ever having had the media (simulates an old/hand-edited
  // project.json-only package, or one exported after the media was already gone).
  const { createZip } = await import('../js/zip.js');
  const zip = createZip([{ path: 'project.json', data: JSON.stringify(project, null, 2) }]);
  const imported = await importProjectPackage(zip, { store });
  assert.deepEqual(imported.missingMedia, ['gone.png']);
  assert.equal(imported.project.name, 'Old Project With Gone Media');
});

test('plain .rise.json import remains fully supported and unaffected by the package format', async () => {
  const { importProjectJson } = await import('../js/storage.js');
  const project = buildProject({ name: 'Plain JSON Project', componentId: 'accordion', config: componentConfig() });
  const imported = importProjectJson(JSON.stringify(project));
  assert.equal(imported.name, 'Plain JSON Project');
  assert.notEqual(imported.id, project.id);
});

test('isProjectPackageFile distinguishes a .zip from a plain .json by filename', () => {
  assert.equal(isProjectPackageFile({ name: 'my-project.rise-project.zip' }), true);
  assert.equal(isProjectPackageFile({ name: 'my-project.zip' }), true);
  assert.equal(isProjectPackageFile({ name: 'my-project.rise.json' }), false);
  assert.equal(isProjectPackageFile({ name: 'my-project.json' }), false);
});

test('a file that is not a valid ZIP at all gives a readable error, not a raw parser exception', async () => {
  const notAZip = new Blob(['this is plain text, not a ZIP archive']);
  await assert.rejects(() => importProjectPackage(notAZip), /does not appear to be a valid project package/i);
});

test('a package whose project.json entry is not parseable JSON gives a readable error', async () => {
  const { createZip } = await import('../js/zip.js');
  const corruptZip = createZip([{ path: 'project.json', data: '{ this is not valid json' }]);
  await assert.rejects(() => importProjectPackage(corruptZip), /not valid JSON/i);
});

