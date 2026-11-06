// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildLargePasteWarning, buildRiseProjectZip, formatExportedFileSize, getExportedFileSize,
  LARGE_PASTE_WARNING_BYTES, prepareMediaExport
} from '../../js/export.js';
import { readZip } from '../../js/zip.js';

describe('export file size reporting', () => {
  test('getExportedFileSize reports the UTF-8 byte length', () => {
    expect(getExportedFileSize('abcd')).toBe(4);
    expect(getExportedFileSize('')).toBe(0);
    // Multi-byte characters must count their real byte length, not character length.
    expect(getExportedFileSize('café')).toBe(5);
  });

  test('formatExportedFileSize renders bytes, kilobytes, and megabytes', () => {
    expect(formatExportedFileSize(0)).toBe('0 B');
    expect(formatExportedFileSize(512)).toBe('512 B');
    expect(formatExportedFileSize(1536)).toBe('1.5 KB');
    expect(formatExportedFileSize(13398)).toBe('13.1 KB');
    expect(formatExportedFileSize(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  test('formatExportedFileSize handles invalid input gracefully', () => {
    expect(formatExportedFileSize(-1)).toBe('Unknown size');
    expect(formatExportedFileSize(NaN)).toBe('Unknown size');
    expect(formatExportedFileSize(undefined)).toBe('Unknown size');
  });
});

// P04: a practical (not a claimed Rise-enforced) paste-size threshold — the Export modal
// warns instead of always rendering enormous code as an expanded field.
describe('buildLargePasteWarning', () => {
  test('below the threshold produces no warning', () => {
    expect(buildLargePasteWarning(0)).toBeNull();
    expect(buildLargePasteWarning(LARGE_PASTE_WARNING_BYTES)).toBeNull();
  });

  test('above the threshold warns about editor slowness, not a Rise limit', () => {
    const warning = buildLargePasteWarning(LARGE_PASTE_WARNING_BYTES + 1);
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/slow to work with/i);
    expect(warning.toLowerCase()).not.toMatch(/rise (limit|rejects|enforces|blocks)/);
    expect(warning).toContain(formatExportedFileSize(LARGE_PASTE_WARNING_BYTES + 1));
  });

  test('invalid input produces no warning rather than a broken message', () => {
    expect(buildLargePasteWarning(NaN)).toBeNull();
    expect(buildLargePasteWarning(undefined)).toBeNull();
  });
});

function pngBlob(bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

function fakeStore(records) {
  return { get: async id => records[id] };
}

describe('prepareMediaExport filename and cache handling', () => {
  test('two media references that sanitize to the same filename get distinct, collision-free names', async () => {
    const store = fakeStore({
      'media-a': { id: 'media-a', blob: pngBlob([1]), sanitizedName: 'photo.png', kind: 'image', mimeType: 'image/png', size: 1, name: 'photo.png' },
      'media-b': { id: 'media-b', blob: pngBlob([2]), sanitizedName: 'photo.png', kind: 'image', mimeType: 'image/png', size: 1, name: 'photo.png' }
    });
    const reference = id => ({ source: 'upload', mediaId: id, schemaVersion: 1, kind: 'image', name: 'photo.png', mimeType: 'image/png', size: 1, createdAt: new Date().toISOString() });
    const config = { items: [{ content: reference('media-a') }, { content: reference('media-b') }] };
    const result = await prepareMediaExport(config, { store, mode: 'package' });
    const filenames = result.manifest.map(entry => entry.filename);
    expect(new Set(filenames).size).toBe(2);
    expect(filenames).toContain('photo.png');
    expect(filenames).toContain('photo-2.png');
  });

  // NOTE: prepareMediaExport's `resolvedMedia` cache is intended to dedupe a media
  // reference used in more than one field, but its recursive walk resolves every branch
  // concurrently via Promise.all, so both branches reach the `resolvedMedia.has(...)`
  // check before either has resolved and populated the cache — the cache never actually
  // hits. This is a known, minor inefficiency (the same uploaded file is packaged twice,
  // under two distinct filenames, instead of once) rather than a correctness bug: both
  // occurrences still resolve to a valid, working reference. Fixing the concurrency model
  // is a behavioral change out of scope for expanding test coverage; documented here so
  // the gap is visible rather than silently assumed away.
  test('the same mediaId referenced twice still resolves both occurrences correctly (each is fetched and packaged independently)', async () => {
    let fetchCount = 0;
    const record = { id: 'shared', blob: pngBlob(), sanitizedName: 'shared.png', kind: 'image', mimeType: 'image/png', size: 8, name: 'shared.png' };
    const store = { get: async () => { fetchCount += 1; return record; } };
    const reference = { source: 'upload', mediaId: 'shared', schemaVersion: 1, kind: 'image', name: 'shared.png', mimeType: 'image/png', size: 8, createdAt: new Date().toISOString() };
    const config = { items: [{ content: reference }, { content: reference }] };
    const result = await prepareMediaExport(config, { store, mode: 'package' });
    expect(fetchCount).toBe(2);
    expect(result.manifest.map(entry => entry.filename)).toEqual(['shared.png', 'shared-2.png']);
    expect(result.config.items[0].content).toBe('assets/shared.png');
    expect(result.config.items[1].content).toBe('assets/shared-2.png');
  });

  test('resolves item.media attachments correctly in package mode', async () => {
    const record = { id: 'item-img', blob: pngBlob(), sanitizedName: 'diagram.png', kind: 'image', mimeType: 'image/png', size: 8, name: 'diagram.png' };
    const store = fakeStore({ 'item-img': record });
    const config = {
      items: [
        {
          title: 'Panel 1',
          content: 'Some text',
          media: {
            type: 'image',
            sourceType: 'upload',
            mediaId: 'item-img',
            fileName: 'diagram.png',
            src: '',
            placement: 'above',
            aspectRatio: 'original',
            fit: 'contain'
          }
        }
      ]
    };
    const result = await prepareMediaExport(config, { store, mode: 'package' });
    expect(result.manifest.length).toBe(1);
    expect(result.manifest[0].filename).toBe('diagram.png');
    expect(result.assets.length).toBe(1);
    expect(result.config.items[0].media.src).toBe('assets/diagram.png');
  });

  test('resolves item.media attachments to data URLs in inline mode', async () => {
    const record = { id: 'item-img', blob: pngBlob(), sanitizedName: 'diagram.png', kind: 'image', mimeType: 'image/png', size: 8, name: 'diagram.png' };
    const store = fakeStore({ 'item-img': record });
    const config = {
      items: [
        {
          title: 'Panel 1',
          content: 'Some text',
          media: {
            type: 'image',
            sourceType: 'upload',
            mediaId: 'item-img',
            fileName: 'diagram.png',
            src: '',
            placement: 'above',
            aspectRatio: 'original',
            fit: 'contain'
          }
        }
      ]
    };
    const result = await prepareMediaExport(config, { store, mode: 'inline' });
    expect(result.config.items[0].media.src).toMatch(/^data:image\/png;base64,/);
  });
});

describe('buildRiseProjectZip', () => {
  test('assembles index.html at the root, packaged assets, and an asset manifest', async () => {
    const asset = { relativePath: 'assets/photo.png', blob: pngBlob(), filename: 'photo.png', sourceMediaId: 'm1', mimeType: 'image/png' };
    const { blob, size, warnings } = await buildRiseProjectZip({
      html: '<html></html>', assets: [asset], manifest: [{ filename: 'photo.png', sourceMediaId: 'm1', mimeType: 'image/png', relativePath: 'assets/photo.png' }]
    });
    expect(size).toBe(blob.size);
    expect(warnings).toEqual([]);
    const entries = await readZip(blob);
    expect(entries[0].path).toBe('index.html');
    expect(entries.some(entry => entry.path === 'assets/photo.png')).toBe(true);
    expect(entries.some(entry => entry.path === 'assets/manifest.json')).toBe(true);
  });

  test('omits the manifest entry when includeManifest is false', async () => {
    const { blob } = await buildRiseProjectZip({ html: '<html></html>', assets: [], manifest: [], includeManifest: false });
    const entries = await readZip(blob);
    expect(entries.some(entry => entry.path === 'assets/manifest.json')).toBe(false);
  });

  test('warns when the packaged ZIP exceeds the advisory large-package size', async () => {
    const bigAsset = { relativePath: 'assets/big.bin', blob: new Blob([new Uint8Array(51 * 1024 * 1024)]) };
    const { warnings } = await buildRiseProjectZip({ html: '<html></html>', assets: [bigAsset], manifest: [] });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/50 MB/);
  });
});

describe('buildRiseEmbedSnippet', () => {
  test('generates a compliant responsive iframe snippet for Rise Multimedia Embed', async () => {
    const { buildRiseEmbedSnippet } = await import('../../js/export.js');
    const snippet = buildRiseEmbedSnippet({
      url: 'https://example.com/courses/onboarding/accordion.html',
      title: 'Customer Service Policy Accordion',
      height: '620px'
    });
    expect(snippet).toContain('<iframe src="https://example.com/courses/onboarding/accordion.html"');
    expect(snippet).toContain('title="Customer Service Policy Accordion"');
    expect(snippet).toContain('height="620px"');
    expect(snippet).toContain('width="100%"');
    expect(snippet).toContain('allowfullscreen');
    expect(snippet).toContain('allow="autoplay"');
  });

  test('falls back safely when optional parameters are omitted', async () => {
    const { buildRiseEmbedSnippet } = await import('../../js/export.js');
    const snippet = buildRiseEmbedSnippet({ url: 'https://example.com/block.html' });
    expect(snippet).toContain('src="https://example.com/block.html"');
    expect(snippet).toContain('height="560px"');
    expect(snippet).toContain('title="AT&amp;T Interactive Block"');
  });
});

describe('buildStorylineWebObjectZip', () => {
  test('packages a valid Storyline 360 web object archive with manifest and assets', async () => {
    const { buildStorylineWebObjectZip } = await import('../../js/export.js');
    const asset = { relativePath: 'assets/badge.png', blob: pngBlob(), filename: 'badge.png', sourceMediaId: 'm1', mimeType: 'image/png' };
    const { blob, size } = await buildStorylineWebObjectZip({
      html: '<!DOCTYPE html><html><body><h1>Storyline Web Object</h1></body></html>',
      assets: [asset],
      manifest: [{ filename: 'badge.png', relativePath: 'assets/badge.png' }],
      title: 'Safety Procedure Simulation'
    });
    expect(size).toBe(blob.size);
    const entries = await readZip(blob);
    expect(entries.some(e => e.path === 'index.html')).toBe(true);
    expect(entries.some(e => e.path === 'assets/badge.png')).toBe(true);
    expect(entries.some(e => e.path === 'assets/storyline-manifest.json')).toBe(true);
    const manifestEntry = entries.find(e => e.path === 'assets/storyline-manifest.json');
    const manifestJson = JSON.parse(new TextDecoder().decode(manifestEntry.data));
    expect(manifestJson.format).toBe('articulate-storyline-web-object');
    expect(manifestJson.title).toBe('Safety Procedure Simulation');
  });
});

describe('buildCoursePackZip', () => {
  test('packages multiple components into a course pack with master catalog course-index.html', async () => {
    const { buildCoursePackZip } = await import('../../js/export.js');
    const comp1 = {
      name: 'Network Ops Hierarchy',
      componentId: 'accordion',
      title: 'Network Ops Hierarchy',
      html: '<html><body>Accordion Content</body></html>',
      assets: []
    };
    const comp2 = {
      name: 'Field Safety Check',
      componentId: 'checklist',
      title: 'Field Safety Check',
      html: '<html><body>Checklist Content</body></html>',
      assets: [{ relativePath: 'assets/icon.png', blob: pngBlob(), filename: 'icon.png' }]
    };

    const { blob, size } = await buildCoursePackZip({
      courseTitle: 'Fiber Operations 101',
      components: [comp1, comp2]
    });
    expect(size).toBe(blob.size);
    const entries = await readZip(blob);
    expect(entries.some(e => e.path === 'index.html')).toBe(true);
    expect(entries.some(e => e.path === 'course-index.html')).toBe(true);
    expect(entries.some(e => e.path === 'course-manifest.json')).toBe(true);
    expect(entries.some(e => e.path === 'components/network-ops-hierarchy/index.html')).toBe(true);
    expect(entries.some(e => e.path === 'components/field-safety-check/index.html')).toBe(true);
    expect(entries.some(e => e.path === 'components/field-safety-check/assets/icon.png')).toBe(true);

    const indexEntry = entries.find(e => e.path === 'course-index.html');
    const indexHtml = new TextDecoder().decode(indexEntry.data);
    expect(indexHtml).toContain('Fiber Operations 101');
    expect(indexHtml).toContain('components/network-ops-hierarchy/index.html');
    expect(indexHtml).toContain('components/field-safety-check/index.html');
  });
});

describe('download helpers', () => {
  const originalCreateObjectURL = globalThis.URL?.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;

  afterEach(() => {
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  function stubObjectURL() {
    let counter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:local-${++counter}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  }

  test('downloadHtml creates and clicks a slugified .html download link, then revokes its object URL', async () => {
    stubObjectURL();
    const { downloadHtml } = await import('../../js/export.js');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadHtml('My Cool Component!', '<html></html>');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1');
    clickSpy.mockRestore();
  });

  test('downloadZipFile downloads a .zip file named after the slugified title', async () => {
    stubObjectURL();
    const { downloadZipFile } = await import('../../js/export.js');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture() { this.__downloadName = this.download; });
    downloadZipFile('Flip Cards', new Blob(['zip-bytes']));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  test('downloadStorylineWebObjectZip downloads storyline-web-object zip', async () => {
    stubObjectURL();
    const { downloadStorylineWebObjectZip } = await import('../../js/export.js');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadStorylineWebObjectZip('Scenario Simulation', new Blob(['zip']));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  test('downloadCoursePackZip downloads course-pack zip', async () => {
    stubObjectURL();
    const { downloadCoursePackZip } = await import('../../js/export.js');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCoursePackZip('Field Operations', new Blob(['zip']));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  test('downloadProjectJson and downloadAssetManifest each produce and revoke one object URL', async () => {
    stubObjectURL();
    const { downloadAssetManifest, downloadProjectJson } = await import('../../js/export.js');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadProjectJson({ name: 'My Project' });
    downloadAssetManifest('My Component', [{ filename: 'a.png' }]);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });

  // Every helper above substitutes a generic, slugified name when the caller has no title
  // to hand it — an untitled project, or a component exported before it was named. The
  // tests above always pass one, so without this the fallback arms never run and a broken
  // filename would reach an author mid-export.
  test('each download helper falls back to a generic filename when no title is supplied', async () => {
    stubObjectURL();
    const exportModule = await import('../../js/export.js');
    const downloadNames = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function record() { downloadNames.push(this.download); });

    exportModule.downloadZipFile(undefined, new Blob(['zip']));
    exportModule.downloadStorylineWebObjectZip('', new Blob(['zip']));
    exportModule.downloadCoursePackZip(undefined, new Blob(['zip']));
    exportModule.downloadHtml('', '<html></html>');
    exportModule.downloadProjectJson({});
    exportModule.downloadAssetManifest(undefined, []);

    expect(downloadNames).toEqual([
      'rise-component.zip',
      'storyline-web-object.storyline.zip',
      'course-pack.course-pack.zip',
      'rise-component.html',
      'rise-project.rise.json',
      'rise-component.assets.json'
    ]);
    clickSpy.mockRestore();
  });
});

// The suites above drive export.js's happy paths. The ones below cover its defaulting and
// skip-this-entry arms — the shapes that only turn up with an untitled project, a
// partially-written config, or an asset whose blob never loaded. They are easy to get
// wrong precisely because no well-formed export reaches them.

describe('buildRiseEmbedSnippet placeholder defaults', () => {
  test('with no arguments at all, emits the placeholder host URL for the author to replace', async () => {
    const { buildRiseEmbedSnippet } = await import('../../js/export.js');
    const snippet = buildRiseEmbedSnippet();
    expect(snippet).toContain('src="https://your-server.com/path-to-component/index.html"');
    expect(snippet).toContain('title="AT&amp;T Interactive Block"');
    expect(snippet).toContain('height="560px"');
  });
});

describe('buildExportPayload', () => {
  const compiled = '<html><body>Compiled "block" output</body></html>';

  test('defaults manifest and warnings to empty arrays when no options are supplied', async () => {
    const { buildExportPayload } = await import('../../js/export.js');
    const payload = buildExportPayload(compiled);
    expect(payload.manifest).toEqual([]);
    expect(payload.warnings).toEqual([]);
    expect(payload.iframe).toContain('<iframe srcdoc="');
    expect(payload.fragment).toBeTruthy();
  });

  // Both lists are rendered straight into the Export modal, so a non-array (a caller that
  // passed one warning as a bare string) has to collapse to an empty list rather than
  // being spread character by character.
  test('discards non-array manifest and warnings instead of passing them through', async () => {
    const { buildExportPayload } = await import('../../js/export.js');
    const payload = buildExportPayload(compiled, { manifest: 'not-an-array', warnings: null });
    expect(payload.manifest).toEqual([]);
    expect(payload.warnings).toEqual([]);
  });

  test('passes real arrays through untouched', async () => {
    const { buildExportPayload } = await import('../../js/export.js');
    const manifest = [{ filename: 'badge.png' }];
    const warnings = ['This package is large.'];
    const payload = buildExportPayload(compiled, { manifest, warnings });
    expect(payload.manifest).toEqual(manifest);
    expect(payload.warnings).toEqual(warnings);
  });
});

describe('prepareMediaExport defaulting and malformed references', () => {
  test('falls back to the shared mediaStore when no options are supplied', async () => {
    // A config with no media references never reaches the store, so this exercises the
    // `options.store || mediaStore` default without needing IndexedDB under jsdom.
    const result = await prepareMediaExport({ items: [{ content: 'Plain text only' }] });
    expect(result.manifest).toEqual([]);
    expect(result.assets).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.config.items[0].content).toBe('Plain text only');
  });

  // The collision suffix is normally spliced in ahead of the extension. An asset stored
  // without one has no dot to split on, so the suffix has to land at the very end.
  test('de-duplicates colliding asset filenames that have no extension', async () => {
    const store = fakeStore({
      'clip-a': { id: 'clip-a', blob: pngBlob([1]), sanitizedName: 'recording', kind: 'audio', mimeType: 'audio/mpeg', size: 1, name: 'recording' },
      'clip-b': { id: 'clip-b', blob: pngBlob([2]), sanitizedName: 'recording', kind: 'audio', mimeType: 'audio/mpeg', size: 1, name: 'recording' }
    });
    const reference = id => ({ source: 'upload', mediaId: id, schemaVersion: 1, kind: 'audio', name: 'recording', mimeType: 'audio/mpeg', size: 1, createdAt: new Date().toISOString() });
    const config = { items: [{ content: reference('clip-a') }, { content: reference('clip-b') }] };
    const result = await prepareMediaExport(config, { store, mode: 'package' });
    expect(result.manifest.map(entry => entry.filename)).toEqual(['recording', 'recording-2']);
  });

  // A hotspot whose audio was cleared mid-edit can leave a blank audioMediaId behind.
  // That is an empty attachment, not missing media, so it must not raise the "missing
  // from local storage" warning that a genuinely unresolvable id does.
  test('a whitespace-only audioMediaId resolves to an empty URL without reporting missing media', async () => {
    const store = fakeStore({});
    const config = { items: [{ hotspot: { audioMediaId: '   ', label: 'Antenna' } }] };
    const result = await prepareMediaExport(config, { store, mode: 'package' });
    expect(result.config.items[0].hotspot.audioUrl).toBe('');
    expect(result.config.items[0].hotspot.label).toBe('Antenna');
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('zip builders skip asset entries that have no blob', () => {
  // prepareMediaExport still emits a manifest entry for an asset it could not resolve, so
  // the packagers do receive descriptors with no blob attached. Those must be skipped
  // quietly rather than throwing on `undefined.arrayBuffer()` and failing the export.
  test('buildStorylineWebObjectZip omits blob-less assets but still writes the manifest', async () => {
    const { buildStorylineWebObjectZip } = await import('../../js/export.js');
    const { blob } = await buildStorylineWebObjectZip({
      html: '<html><body>Web object</body></html>',
      assets: [{ relativePath: 'assets/missing.png', filename: 'missing.png' }, null],
      manifest: [{ filename: 'missing.png', relativePath: 'assets/missing.png' }],
      title: 'Partial Export'
    });
    const paths = (await readZip(blob)).map(entry => entry.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('assets/storyline-manifest.json');
    expect(paths).not.toContain('assets/missing.png');
  });

  test('buildCoursePackZip skips blob-less assets and components with no assets array', async () => {
    const { buildCoursePackZip } = await import('../../js/export.js');
    const { blob } = await buildCoursePackZip({
      courseTitle: 'Partial Course',
      components: [
        { name: 'No Assets Key', html: '<html><body>A</body></html>' },
        { name: 'Unresolved Asset', html: '<html><body>B</body></html>', assets: [{ relativePath: 'assets/gone.png' }] }
      ]
    });
    const paths = (await readZip(blob)).map(entry => entry.path);
    expect(paths).toContain('components/no-assets-key/index.html');
    expect(paths).toContain('components/unresolved-asset/index.html');
    expect(paths).not.toContain('components/unresolved-asset/assets/gone.png');
  });

  // The component slug falls back name -> id -> 'component'. An unnamed component still
  // has to land at a stable, non-empty path rather than 'components//index.html'.
  test('buildCoursePackZip slugs an unnamed component from its id, then a generic fallback', async () => {
    const { buildCoursePackZip } = await import('../../js/export.js');
    const { blob } = await buildCoursePackZip({
      components: [
        { id: 'accordion-7', html: '<html><body>A</body></html>' },
        { html: '<html><body>B</body></html>' }
      ]
    });
    const paths = (await readZip(blob)).map(entry => entry.path);
    expect(paths).toContain('components/accordion-7/index.html');
    expect(paths).toContain('components/component/index.html');
  });
});
