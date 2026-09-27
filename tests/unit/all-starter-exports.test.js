// @vitest-environment node
//
// 27 September 2026 functional audit, section 1 ("Make all 26 starter blocks exportable"):
// a fresh, UNTOUCHED course containing all 26 registered block types failed to export a course
// ZIP. Two root causes:
//
//   1. Horizontal Timeline and Image Gallery both ship a `<img src="">` lightbox placeholder
//      that JS populates only once the reader opens it — present in every export regardless of
//      content, unrelated to any uploaded media. The course-export gate's "no file attached"
//      check (js/dashboard/project-export.js) can't tell that apart from a genuinely dropped
//      blob: reference, so it refused every export of either component.
//   2. Course QA's "Blank Item Titles" check (js/dashboard/project-qa.js) looked for a fixed
//      set of key names (title/label/text/prompt/heading/name). Comparison Slider's items use
//      beforeLabel/afterLabel instead, so it flagged every Comparison Slider item as unnamed
//      even with both filled in.
//
// This file proves the fix at the level each defect was actually observed at: the compiled
// export markup (no empty src), the real course-ZIP pipeline (all 26 export together), and the
// QA aggregator (no false-positive blank-title error).
import { beforeEach, describe, expect, test } from 'vitest';
import { buildCourseProjectZip } from '../../js/dashboard/project-export.js';
import { COMPONENT_REGISTRY, getDefaultConfig } from '../../js/component-registry.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../js/project-schema.js';
import { saveProject } from '../../js/storage.js';
import { readZip } from '../../js/zip.js';
import { auditCourseProject } from '../../js/dashboard/project-qa.js';
import { memoryLocalStorage } from '../fixtures/index.js';
import * as horizontalTimeline from '../../components/horizontal-timeline.js';
import * as imageGallery from '../../components/image-gallery.js';
import * as comparisonSlider from '../../components/comparison-slider.js';

beforeEach(() => {
  globalThis.localStorage = memoryLocalStorage();
});

function buildAllStartersProject() {
  const components = {};
  const componentOrder = [];
  COMPONENT_REGISTRY.forEach((entry, idx) => {
    const compId = `c${idx + 1}`;
    components[compId] = createComponentInstance({
      id: compId, name: entry.name, type: entry.id, status: 'ready',
      config: getDefaultConfig(entry)
    });
    componentOrder.push(compId);
  });
  const project = buildProjectSchemaV3({
    name: 'All Starters Course',
    sectionOrder: ['s1'],
    sections: { s1: createSection({ id: 's1', name: 'Module One', componentOrder }) },
    components
  });
  saveProject(project);
  return project;
}

describe('every untouched starter compiles with no empty media src', () => {
  test('Horizontal Timeline never emits src="" (the lightbox placeholder has no src attribute at all)', () => {
    const html = horizontalTimeline.generateHTML(horizontalTimeline.defaultConfig, 'rcb-ht');
    expect(html).not.toMatch(/<(?:img|source|video|audio)\b[^>]*\ssrc=(?:""|'')/i);
    expect(html).toContain('class="timeline-lightbox-img"');
  });

  test('Image Gallery never emits src="" (the lightbox placeholder has no src attribute at all)', () => {
    const html = imageGallery.generateHTML(imageGallery.defaultConfig, 'rcb-ig');
    expect(html).not.toMatch(/<(?:img|source|video|audio)\b[^>]*\ssrc=(?:""|'')/i);
    expect(html).toContain('class="lightbox-img"');
  });
});

describe('a course with all 26 untouched starter blocks exports a valid ZIP (P0)', () => {
  test('every component compiles into its own entry page, and the archive is well-formed', async () => {
    const project = buildAllStartersProject();
    const blob = await buildCourseProjectZip(project.id);
    const entries = await readZip(blob);
    const indexPages = entries.filter(e => e.path.endsWith('/index.html'));
    expect(indexPages.length).toBe(COMPONENT_REGISTRY.length);
    expect(entries.some(e => e.path === 'manifest.json')).toBe(true);
    // Well-formed: every entry page decodes to non-empty HTML naming the component.
    const decode = data => new TextDecoder().decode(data);
    for (const page of indexPages) {
      const html = decode(page.data);
      expect(html.length).toBeGreaterThan(0);
      expect(html).not.toMatch(/<(?:img|source|video|audio)\b[^>]*\ssrc=(?:""|'')/i);
    }
  });
});

describe('Comparison Slider: no false-positive "Blank Item Titles" on the untouched starter', () => {
  test('the starter’s beforeLabel/afterLabel are recognised, not just title/label', () => {
    const comp = createComponentInstance({
      id: 'cs1', name: 'Comparison Slider', type: 'comparison-slider', status: 'ready',
      config: structuredClone(comparisonSlider.defaultConfig)
    });
    const project = buildProjectSchemaV3({
      name: 'Slider Course', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['cs1'] }) },
      components: { cs1: comp }
    });
    const audit = auditCourseProject(project);
    const findings = audit.componentReports.flatMap(r => r.issues.map(i => i.title));
    expect(findings).not.toContain('Blank Item Titles');
  });

  test('a genuinely blank beforeLabel is still caught', () => {
    const config = structuredClone(comparisonSlider.defaultConfig);
    config.items[0].beforeLabel = '';
    const comp = createComponentInstance({ id: 'cs1', name: 'Comparison Slider', type: 'comparison-slider', status: 'ready', config });
    const project = buildProjectSchemaV3({
      name: 'Slider Course', sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['cs1'] }) },
      components: { cs1: comp }
    });
    const audit = auditCourseProject(project);
    const findings = audit.componentReports.flatMap(r => r.issues.map(i => i.title));
    expect(findings).toContain('Blank Item Titles');
  });
});
