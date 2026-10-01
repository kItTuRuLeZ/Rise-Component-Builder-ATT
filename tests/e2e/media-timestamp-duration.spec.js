import { expect, test } from '@playwright/test';

// Audit 2026-09-30, section 3, in the real app: upload a real 12-second audio file, leave a
// chapter at 0:45, and Preflight must say so; replacing the file must re-check; an unknown length
// must be reported as unverified. The file is a real WAV (the browser reads its length from the
// file's own metadata), generated here so no binary fixture is needed.

function wavSeconds(seconds) {
  const sampleRate = 8000;
  const dataBytes = sampleRate * seconds * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return { name: `clip-${seconds}s.wav`, mimeType: 'audio/wav', buffer };
}

async function openAudioBlock(page) {
  await page.goto('/?dashboard');
  await page.evaluate(async () => {
    const { buildProjectSchemaV3, createComponentInstance, createSection } = await import('/js/project-schema.js');
    const { saveProject } = await import('/js/storage.js');
    const config = { blockTitle: 'M', blockHeadline: 'Audio', items: [{ title: 'Track', content: '' }], colorPrimary: '#00388F', colorAccent: '#009FDB', colorBg: '#FFFFFF', colorText: '#000000', borderRadius: '8', shadowDepth: 'none' };
    saveProject(buildProjectSchemaV3({
      name: 'Audio course', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) },
      components: { c1: createComponentInstance({ id: 'c1', name: 'Audio', type: 'audio-player', config }) }
    }));
  });
  await page.reload();
  await page.locator('.project-card').filter({ hasText: 'Audio course' }).locator('[data-action="open"]').first().click();
  await page.locator('.component-row [data-action="edit-comp"]').first().click();
  await expect(page.locator('#editor-state')).toBeVisible();
}

async function preflightText(page) {
  await page.locator('#btn-preflight').click();
  const results = page.locator('#preflight-results');
  await expect(results.locator('.preflight-summary-line')).toBeVisible();
  // Wait out the background layout measurement so the list is final.
  await expect(results.locator('.preflight-layout-pending')).toHaveCount(0, { timeout: 30000 });
  return results;
}

async function closePreflight(page) {
  await page.locator('#modal-preflight .modal-close-btn').click();
}

test('a 45-second chapter on an uploaded 12-second file is flagged, then clears when the file is replaced with a longer one', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit-on-Windows cannot store Blobs in IndexedDB in this test environment (see editor-preview.spec.js), so no upload can happen there. The rule itself is covered by tests/unit/media-timestamp-duration.test.js.');
  await openAudioBlock(page);
  await page.locator('[data-field-id="chapters"]').fill('0:05 | Intro\n0:45 | Late chapter');
  const audioInput = page.locator('#editor-state input[type=file][accept*="audio"]').first();

  await audioInput.setInputFiles(wavSeconds(12));
  await expect(page.locator('#editor-state')).toContainText('clip-12s.wav');

  let results = await preflightText(page);
  await expect(results).toContainText('Chapter timestamp is past the end of the audio');
  await expect(results).toContainText('Chapter 2 ("Late chapter") starts at 0:45');
  await expect(results).toContainText('only 0:12 long');
  await expect(results).toContainText('0:00 to 0:12');
  // Valid chapter 1 (0:05) is not mentioned, and the file length is known, so it is not "unverified".
  await expect(results).not.toContainText('Chapter 1');
  await expect(results).not.toContainText('could not be checked against the audio length');
  // A Warning, so export is not blocked.
  await expect(results.locator('.preflight-section-title.is-blocking')).toHaveCount(0);
  await closePreflight(page);

  // Replacing the file with one that is long enough re-checks the same chapters.
  await audioInput.setInputFiles(wavSeconds(60));
  await expect(page.locator('#editor-state')).toContainText('clip-60s.wav');
  results = await preflightText(page);
  await expect(results).not.toContainText('Chapter timestamp is past the end of the audio');
  await expect(results).not.toContainText('could not be checked against the audio length');
});

test('with an external audio URL the length is unknown, so timestamps are reported as unverified, not as passing', async ({ page }) => {
  await openAudioBlock(page);
  await page.locator('[data-field-id="chapters"]').fill('0:05 | Intro\n0:45 | Late chapter');
  // A real external URL typed into the track's own URL field: nothing to read a length from.
  await page.getByPlaceholder('Enter external audio URL').fill('https://media.example.org/lesson.mp3');
  const results = await preflightText(page);
  await expect(results).toContainText('Timestamps could not be checked against the audio length');
  await expect(results).toContainText('have not been checked');
  await expect(results).not.toContainText('past the end of the audio');
});
