import { expect, test } from '@playwright/test';

// Audit 2026-09-30, section 8. The dashboard's "Import Project Package" card promised "JSON / ZIP" but
// its file inputs accepted only .json, so a .rise-project.zip (the backup that includes media) failed
// with "The selected file is not valid JSON". Both dashboard imports now accept either file, report
// what was actually restored, and say what a ZIP that is not a backup is and what to use instead.

const PROJECT_NAME = 'Roundtrip Course';

async function seedProjectWithMedia(page, { withMedia }) {
  await page.goto('/?dashboard');
  return page.evaluate(async ({ name, withMedia: media }) => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject, getProject } = await import('/js/storage.js');
    const { createMediaReference, computeFileHash } = await import('/js/media.js');
    const { saveMediaRecord } = await import('/js/media-storage.js');
    const { exportProjectPackage } = await import('/js/project-package.js');

    let content = '';
    if (media) {
      const blob = new Blob([new Uint8Array(64).fill(7)], { type: 'audio/wav' });
      const record = {
        id: 'media-roundtrip-1', schemaVersion: 1, name: 'clip.wav', sanitizedName: 'clip.wav', mimeType: 'audio/wav',
        size: blob.size, createdAt: new Date().toISOString(), kind: 'audio', duration: 12, dimensions: null, altText: '',
        decorative: false, caption: '', transcript: '', resized: false, contentHash: await computeFileHash(blob), blob
      };
      content = createMediaReference(await saveMediaRecord(record));
    }
    const config = { blockTitle: 'M', blockHeadline: 'H', items: [{ title: 'Track', content }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none' };
    const component = createComponentInstance({ id: 'c1', name: 'Audio', type: 'audio-player', config });
    const saved = saveProject(buildProjectSchemaV3({
      name, sectionOrder: ['s1'], sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) }, components: { c1: component }
    }));
    const project = getProject(saved.id);
    const pkg = await exportProjectPackage(project);
    const bytes = new Uint8Array(await pkg.blob.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return { zip: btoa(binary), json: JSON.stringify(project) };
  }, { name: PROJECT_NAME, withMedia });
}

async function wipe(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    const { deleteMediaRecord } = await import('/js/media-storage.js');
    await deleteMediaRecord('media-roundtrip-1').catch(() => {});
  });
  await page.reload();
}

const toast = page => page.locator('.toast').last();
const upload = (page, name, mimeType, buffer) => page.locator('#dash-import-file-input').setInputFiles({ name, mimeType, buffer });

test('a .rise-project.zip imports from the dashboard and restores its media', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit-on-Windows cannot store Blobs in IndexedDB in this test environment (see editor-preview.spec.js).');
  const { zip } = await seedProjectWithMedia(page, { withMedia: true });
  await wipe(page);
  await upload(page, 'roundtrip.rise-project.zip', 'application/zip', Buffer.from(zip, 'base64'));
  await expect(toast(page)).toContainText(`Imported “${PROJECT_NAME}” and restored 1 media file(s)`);
  const restored = await page.evaluate(async () => {
    const { getMediaRecord } = await import('/js/media-storage.js');
    const record = await getMediaRecord('media-roundtrip-1');
    return { present: Boolean(record?.blob), size: record?.blob?.size, duration: record?.duration };
  });
  expect(restored).toEqual({ present: true, size: 64, duration: 12 });
});

test('a project ZIP without media imports and opens', async ({ page }) => {
  const { zip } = await seedProjectWithMedia(page, { withMedia: false });
  await wipe(page);
  await upload(page, 'plain.rise-project.zip', 'application/zip', Buffer.from(zip, 'base64'));
  await expect(toast(page)).toContainText(`Imported “${PROJECT_NAME}”`);
  await expect(toast(page)).not.toContainText('not in the package');
});

test('a .json import says plainly that the media files are not in it, instead of claiming a full restore', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit-on-Windows cannot store Blobs in IndexedDB in this test environment (see editor-preview.spec.js).');
  const { json } = await seedProjectWithMedia(page, { withMedia: true });
  await wipe(page);
  await upload(page, 'roundtrip.rise.json', 'application/json', Buffer.from(json));
  await expect(toast(page)).toContainText(`Imported “${PROJECT_NAME}”, but 1 media file(s) it uses are not in this browser`);
  await expect(toast(page)).toContainText('a JSON file holds the content, not the media files');
});

test('a hosted web-package ZIP is refused with a message that names what it is and what to use instead', async ({ page }) => {
  await page.goto('/?dashboard');
  const zip = await page.evaluate(async () => {
    const { createZip } = await import('/js/zip.js');
    const blob = createZip([{ path: 'index.html', data: '<html></html>' }, { path: 'assets/a.js', data: '//' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  });
  await upload(page, 'hosted-component.zip', 'application/zip', Buffer.from(zip, 'base64'));
  await expect(toast(page)).toContainText('hosted web package');
  await expect(toast(page)).toContainText('not an editable project backup');
  await expect(toast(page)).toContainText('Export Package');
  await expect(toast(page)).not.toContainText('not valid JSON');
  await expect(page.locator('.project-card')).toHaveCount(0);
});

test('the New Project > Import path accepts the same files', async ({ page }) => {
  const { zip } = await seedProjectWithMedia(page, { withMedia: false });
  await wipe(page);
  await page.locator('#dash-create-btn').first().click();
  await page.locator('[data-starter-tpl="import"]').click();
  const input = page.locator('#np-import-file');
  await expect(input).toHaveAttribute('accept', /\.zip/);
  await input.setInputFiles({ name: 'plain.rise-project.zip', mimeType: 'application/zip', buffer: Buffer.from(zip, 'base64') });
  await page.locator('button[type=submit]', { hasText: /Import/ }).click();
  await expect(toast(page)).toContainText(`Imported “${PROJECT_NAME}”`);
});
