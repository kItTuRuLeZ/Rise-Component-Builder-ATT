import { describe, expect, test } from 'vitest';
import { detectRisePackage, MANIFEST_FILENAME } from '../../js/post-publish/package-detector.js';
import { enhanceRisePackage } from '../../js/post-publish/zip-enhancer.js';
import { createDefaultPostPublishConfig } from '../../js/post-publish/schema.js';
import { createZip, readZip } from '../../js/zip.js';

// A real Rise export arrived as a ZIP whose files all sat inside one folder ("content/index.html",
// "content/lib/rise/…", "content/assets/…") with nothing at the ZIP root. The detector only looked
// at the root, so it rejected a valid package and, worse, quoted an unrelated asset page in its
// error. One wrapper folder is now treated as the package root, and the enhanced ZIP keeps its layout.

const text = value => new TextEncoder().encode(value);
const RISE_PAGE = '<!DOCTYPE html><html><head><title>Course</title></head><body><div id="app">Rise 360 course</div></body></html>';

function riseFiles(prefix = '') {
  return [
    { path: `${prefix}index.html`, data: text(RISE_PAGE) },
    { path: `${prefix}lib/rise/main.js`, data: text('console.log("rise");') },
    { path: `${prefix}assets/9783168f/index.html`, data: text('<html><body>block</body></html>') },
    { path: `${prefix}assets/9783168f/assets/manifest.json`, data: text('{}') }
  ];
}

const detect = files => detectRisePackage(createZip(files));
const realConfig = () => {
  const config = createDefaultPostPublishConfig();
  config.settings.sampleContentAcknowledged = true;
  return config;
};

describe('Post-Publish: a package inside one wrapper folder', () => {
  test('a Rise Web export under "content/" is accepted, with the launch file reported at its real path', async () => {
    const detection = await detect(riseFiles('content/'));
    expect(detection.valid).toBe(true);
    expect(detection.kind).toBe('rise-web');
    expect(detection.launchHtmlPath).toBe('content/index.html');
    expect(detection.isPreviouslyEnhanced).toBe(false);
  });

  test('the author is told the folder was treated as the package root', async () => {
    const { warnings } = await detect(riseFiles('content/'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('“content”');
    expect(warnings[0]).toContain('treated as the package root');
  });

  test('a package with files at the root is unchanged: no prefix and no wrapper warning', async () => {
    const detection = await detect(riseFiles(''));
    expect(detection.launchHtmlPath).toBe('index.html');
    expect(detection.warnings).toEqual([]);
  });

  test('zip-tool junk beside the wrapper folder (__MACOSX, .DS_Store) does not hide it', async () => {
    const detection = await detect([
      ...riseFiles('course/'),
      { path: '__MACOSX/course/._index.html', data: text('junk') },
      { path: '.DS_Store', data: text('junk') },
      { path: 'course/.DS_Store', data: text('junk') }
    ]);
    expect(detection.valid).toBe(true);
    expect(detection.launchHtmlPath).toBe('course/index.html');
  });

  test('two top-level folders are not a wrapper: still rejected, naming where the only index.html is', async () => {
    const detection = await detect([...riseFiles('a/'), { path: 'b/readme.txt', data: text('x') }]);
    expect(detection.valid).toBe(false);
    expect(detection.error).toMatch(/No launch file at the root/);
    expect(detection.error).toContain('a/index.html');
  });

  test('a wrapper folder with no launch file inside is still rejected', async () => {
    const detection = await detect([{ path: 'content/readme.txt', data: text('x') }, { path: 'content/lib/a.js', data: text('x') }]);
    expect(detection.valid).toBe(false);
  });

  test('a SCORM package in a wrapper resolves its launch file relative to the manifest, and reports the full path', async () => {
    const detection = await detect([
      { path: 'pkg/imsmanifest.xml', data: text('<manifest><resources><resource href="index_lms.html" /></resources></manifest>') },
      { path: 'pkg/index_lms.html', data: text(RISE_PAGE) }
    ]);
    expect(detection.valid).toBe(true);
    expect(detection.packageType).toBe('scorm12');
    expect(detection.launchHtmlPath).toBe('pkg/index_lms.html');
    expect(detection.warnings.join(' ')).toContain('“pkg”');
  });

  test('a SCORM manifest naming a missing launch file in a wrapper still gets the missing-file error', async () => {
    const detection = await detect([
      { path: 'pkg/imsmanifest.xml', data: text('<manifest><resources><resource href="gone.html" /></resources></manifest>') },
      { path: 'pkg/other.html', data: text(RISE_PAGE) }
    ]);
    expect(detection.valid).toBe(false);
    expect(detection.error).toContain('gone.html');
  });

  test('this Builder\'s own course pack is still named as such when it sits in a wrapper folder', async () => {
    const detection = await detect([{ path: 'export/project-backup.json', data: text('{}') }, { path: 'export/index.html', data: text(RISE_PAGE) }]);
    expect(detection.valid).toBe(false);
    expect(detection.kind).toBe('builder-course');
  });
});

describe('Post-Publish: enhancing a package inside a wrapper folder', () => {
  test('the tools are injected into the launch page and assets land beside it, keeping the wrapper layout', async () => {
    const result = await enhanceRisePackage(createZip(riseFiles('content/')), realConfig());
    expect(result.success).toBe(true);

    const entries = await readZip(result.enhancedBlob);
    const names = entries.map(e => e.path);
    for (const added of ['content/assets/rcb-ppt/rcb-ppt-runtime.js', 'content/assets/rcb-ppt/rcb-ppt-styles.css', 'content/assets/rcb-ppt/rcb-ppt-config.js']) {
      expect(names).toContain(added);
    }
    // Every original file is still where it was (nothing moved, nothing dropped).
    for (const original of riseFiles('content/')) expect(names).toContain(original.path);

    const page = new TextDecoder().decode(entries.find(e => e.path === 'content/index.html').data);
    expect(page).toContain('RCB-POST-PUBLISH-TOOLS:START');
    expect(page).toContain('assets/rcb-ppt/rcb-ppt-runtime.js');
  });

  test('the enhanced package can be uploaded again: it is recognised as a Rise export that was already enhanced', async () => {
    const first = await enhanceRisePackage(createZip(riseFiles('content/')), realConfig());
    // The tool adds files at the ZIP root (manifest, report); they must not defeat wrapper detection.
    expect((await readZip(first.enhancedBlob)).some(e => e.path === MANIFEST_FILENAME)).toBe(true);

    const detection = await detectRisePackage(first.enhancedBlob);
    expect(detection.valid).toBe(true);
    expect(detection.kind).toBe('rise-web');
    expect(detection.launchHtmlPath).toBe('content/index.html');
    expect(detection.isPreviouslyEnhanced).toBe(true);
  });

  test('re-enhancing replaces the tools instead of stacking a second copy', async () => {
    const first = await enhanceRisePackage(createZip(riseFiles('content/')), realConfig());
    const second = await enhanceRisePackage(first.enhancedBlob, realConfig());
    expect(second.success).toBe(true);
    const page = new TextDecoder().decode((await readZip(second.enhancedBlob)).find(e => e.path === 'content/index.html').data);
    expect(page.match(/RCB-POST-PUBLISH-TOOLS:START/g)).toHaveLength(1);
  });
});
