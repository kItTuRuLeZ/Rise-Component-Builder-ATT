// P1: Post-Publish must be honest about what it accepts. Previously any ZIP containing an
// index.html anywhere was labelled WEB, including this Builder's own course ZIP, which is not
// a published Rise export. These tests pin the input contract in js/post-publish/package-detector.js.
import { describe, expect, test } from 'vitest';
import { detectRisePackage } from '../../js/post-publish/package-detector.js';
import { enhanceRisePackage, planEnhancement } from '../../js/post-publish/zip-enhancer.js';
import { createDefaultPostPublishConfig } from '../../js/post-publish/schema.js';
import { createZip, readZip } from '../../js/zip.js';

const html = body => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
const zipOf = entries => createZip(entries);

describe('package input contract', () => {
  test("rejects this Builder's own course ZIP with an explanation, not a WEB label", async () => {
    const zip = zipOf([
      { path: '01-module/01-lesson/index.html', data: html('component') },
      { path: 'manifest.json', data: JSON.stringify({ courseName: 'C', sections: [{ sectionName: 'S', components: [] }] }) },
      { path: 'project-backup.json', data: '{}' },
      { path: 'README.md', data: '# c' }
    ]);
    const result = await detectRisePackage(zip);
    expect(result.valid).toBe(false);
    expect(result.kind).toBe('builder-course');
    expect(result.packageType).not.toBe('web');
    expect(result.error).toMatch(/not a published Rise course/i);
    expect(result.error).toMatch(/Web or SCORM export/i);
  });

  // A single wrapper folder (my-course/index.html with everything else beside it) is accepted as the
  // package root; see post-publish-wrapper-folder.test.js. What is still rejected is an archive whose
  // index.html is nested while other top-level folders exist, where there is no way to know which
  // folder is the course.
  test('rejects an archive whose only index.html is inside a subfolder alongside other folders, and says why', async () => {
    const result = await detectRisePackage(zipOf([
      { path: 'my-course/index.html', data: html('x') },
      { path: 'my-course/lib/main.js', data: '//' },
      { path: 'notes/readme.txt', data: 'x' }
    ]));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/root/i);
    expect(result.error).toMatch(/my-course\/index\.html/);
  });

  test('a root index.html without Rise structure is accepted but labelled generic, with a warning', async () => {
    const result = await detectRisePackage(zipOf([{ path: 'index.html', data: html('<h1>Hello</h1>') }, { path: 'style.css', data: 'a{}' }]));
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('generic-web');
    expect(result.packageType).toBe('generic-web');
    expect(result.label).toMatch(/not identified as a Rise export/i);
    expect(result.warnings.join(' ')).toMatch(/cannot be assumed/i);
  });

  test('Rise-style structure is recognised as a Rise Web export', async () => {
    const result = await detectRisePackage(zipOf([{ path: 'index.html', data: html('x') }, { path: 'lib/rise/main.js', data: '//' }]));
    expect(result.kind).toBe('rise-web');
    expect(result.packageType).toBe('web');
  });

  test('SCORM launch file comes from imsmanifest.xml, and a missing launch file is rejected', async () => {
    const manifest = href => `<manifest><resources><resource identifier="r1" type="webcontent" adlcp:scormType="sco" href="${href}"/></resources></manifest>`;
    const good = await detectRisePackage(zipOf([
      { path: 'imsmanifest.xml', data: manifest('scormcontent/index.html') },
      { path: 'scormcontent/index.html', data: html('x') },
      { path: 'index.html', data: html('decoy') }
    ]));
    expect(good.valid).toBe(true);
    expect(good.launchHtmlPath).toBe('scormcontent/index.html');

    const bad = await detectRisePackage(zipOf([
      { path: 'imsmanifest.xml', data: manifest('missing/launch.html') },
      { path: 'index.html', data: html('x') }
    ]));
    expect(bad.valid).toBe(false);
    expect(bad.error).toMatch(/missing\/launch\.html/);
    expect(bad.error).toMatch(/not in the package/i);
    // adlcp:scormType marks a resource as a "sco" in BOTH SCORM 1.2 and 2004 manifests, so its
    // mere presence (with no CAM 1.3 / Simple Sequencing markers) must not by itself imply 2004 —
    // audit 2026-09-27, section 4.
    expect(good.packageType).toBe('scorm12');
  });

  // 27 September 2026 functional audit, section 4: "review SCORM 1.2/2004 detection honesty".
  // The previous heuristic treated `adlcp:scormType`'s mere presence as a 2004 signal, but that
  // attribute is part of the Content Packaging extension both spec versions share — it appears
  // in nearly every valid manifest of either version, so it can't tell them apart. This would
  // have misclassified the plain 1.2 fixture above (and most real SCORM 1.2 packages) as 2004.
  test('SCORM version is read from genuinely 2004-exclusive markers, not from adlcp:scormType alone', async () => {
    const v12 = await detectRisePackage(zipOf([
      { path: 'imsmanifest.xml', data: '<manifest><metadata><schemaversion>1.2</schemaversion></metadata><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"/></resources></manifest>' },
      { path: 'index.html', data: html('x') }
    ]));
    expect(v12.packageType).toBe('scorm12');
    expect(v12.label).toBe('SCORM 1.2 package');

    // Simple Sequencing & Navigation (adlseq/adlnav/imsss) is a 2004-only extension — it does
    // not exist in 1.2 at all, so its presence is a genuine, exclusive 2004 signal even without
    // the literal string "2004" or "CAM 1.3" anywhere in the manifest.
    const v2004ViaSequencing = await detectRisePackage(zipOf([
      { path: 'imsmanifest.xml', data: '<manifest xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3" xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"/></resources></manifest>' },
      { path: 'index.html', data: html('x') }
    ]));
    expect(v2004ViaSequencing.packageType).toBe('scorm2004');

    const v2004ViaCam = await detectRisePackage(zipOf([
      { path: 'imsmanifest.xml', data: '<manifest><metadata><schema>ADL SCORM</schema><schemaversion>CAM 1.3</schemaversion></metadata><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"/></resources></manifest>' },
      { path: 'index.html', data: html('x') }
    ]));
    expect(v2004ViaCam.packageType).toBe('scorm2004');
    expect(v2004ViaCam.label).toBe('SCORM 2004 package');
  });
});

describe('enhanced package integrity', () => {
  const riseZip = () => zipOf([{ path: 'index.html', data: html('course') }, { path: 'lib/rise/main.js', data: '//' }]);

  test('every injected reference resolves to a file in the enhanced ZIP, and only index.html is modified', async () => {
    const original = await readZip(riseZip());
    const result = await enhanceRisePackage(riseZip(), createDefaultPostPublishConfig());
    expect(result.success).toBe(true);
    const enhanced = await readZip(result.enhancedBlob);
    const files = new Map(enhanced.map(e => [e.path, e.data]));

    const launch = new TextDecoder().decode(files.get('index.html'));
    const refs = [...launch.matchAll(/(?:src|href)="(assets\/rcb-ppt\/[^"]+)"/g)].map(m => m[1]);
    expect(refs).toHaveLength(3);
    for (const ref of refs) expect(files.has(ref), ref).toBe(true);

    // Nothing else from the original package was touched.
    for (const entry of original) {
      if (entry.path === 'index.html') continue;
      expect(Array.from(files.get(entry.path))).toEqual(Array.from(entry.data));
    }
  });

  test('launch file in a subfolder: injected assets land beside it so the relative links resolve', async () => {
    const scorm = zipOf([
      { path: 'imsmanifest.xml', data: '<manifest><resources><resource href="scormcontent/index.html"/></resources></manifest>' },
      { path: 'scormcontent/index.html', data: html('course') }
    ]);
    const result = await enhanceRisePackage(scorm, createDefaultPostPublishConfig());
    expect(result.success).toBe(true);
    const files = new Set((await readZip(result.enhancedBlob)).map(e => e.path));
    for (const name of ['rcb-ppt-styles.css', 'rcb-ppt-config.js', 'rcb-ppt-runtime.js']) {
      expect(files.has(`scormcontent/assets/rcb-ppt/${name}`), name).toBe(true);
    }
  });

  test('the pre-download plan lists the modified file and every added file', async () => {
    const detection = await detectRisePackage(riseZip());
    const plan = await planEnhancement(riseZip(), detection, createDefaultPostPublishConfig());
    expect(plan.modifiedFile).toBe('index.html');
    expect(plan.addedFiles).toEqual(expect.arrayContaining([
      'assets/rcb-ppt/rcb-ppt-styles.css', 'assets/rcb-ppt/rcb-ppt-config.js', 'assets/rcb-ppt/rcb-ppt-runtime.js',
      'rcb-ppt-enhancement-report.txt'
    ]));
    expect(plan.enabledTools).toEqual(['Glossary', 'Resources', 'Help & Support']);
  });

  test('an uploaded resource whose file is gone stops the export instead of shipping a dead link', async () => {
    const config = createDefaultPostPublishConfig();
    config.resources.items = [{
      id: 'r1', title: 'Field guide', description: '', type: 'document', sourceType: 'upload', url: '',
      fileRef: { mediaId: 'gone-file', name: 'guide.pdf', mimeType: 'application/pdf', size: 10 },
      category: '', featured: false, actionLabel: '', openBehavior: 'new-tab'
    }];
    const result = await enhanceRisePackage(riseZip(), config);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Field guide/);
    expect(result.error).toMatch(/no longer in local storage/i);
  });
});
