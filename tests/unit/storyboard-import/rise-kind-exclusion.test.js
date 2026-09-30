// @vitest-environment jsdom
// RISE-kind components (storyboard import, docs/STORYBOARD-IMPORT-DESIGN.md) stand for native
// Rise blocks: no schema-driven config, never compiled. Before this fix, course-readiness.js and
// project-export.js each independently walked every project.components entry and would have
// treated a RISE row as a broken/unknown Builder component (a blocking "Unknown component type"
// Preflight issue, and an attempt to compile it into the export ZIP) instead of silently skipping
// it, even though project-qa.js's own audit already excluded it.
import { beforeEach, describe, expect, test } from 'vitest';
import { auditCourseProject } from '../../../js/dashboard/project-qa.js';
import { collectPreflightIssues } from '../../../js/dashboard/course-readiness.js';
import { buildCourseProjectZip } from '../../../js/dashboard/project-export.js';
import { buildProjectSchemaV3, createComponentInstance } from '../../../js/project-schema.js';
import { saveProject } from '../../../js/storage.js';
import { readZip } from '../../../js/zip.js';
import { memoryLocalStorage } from '../../fixtures/index.js';

function mixedProject() {
  const builder = createComponentInstance({
    id: 'c1', name: 'Key Principles', type: 'accordion', kind: 'builder',
    config: { blockHeadline: 'Overview', items: [{ title: 'One', content: 'Body' }] }
  });
  const rise = createComponentInstance({
    id: 'c2', name: 'Welcome', type: 'Text', kind: 'rise',
    config: { blockId: 'S01-B01', notes: 'paste the approved introduction in Rise.' }
  });
  return buildProjectSchemaV3({
    id: 'p1', name: 'Mixed Course',
    unsectionedComponentOrder: ['c1', 'c2'],
    components: { c1: builder, c2: rise }
  });
}

describe('kind: "rise" exclusion from QA, Preflight, and export', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('auditCourseProject only reports the BUILDER component, not the RISE one', () => {
    const report = auditCourseProject(mixedProject());
    expect(report.totalComponents).toBe(1);
    expect(report.componentReports).toHaveLength(1);
    expect(report.componentReports[0].component.id).toBe('c1');
  });

  test('collectPreflightIssues never flags the RISE row as an unknown component type', async () => {
    const issues = await collectPreflightIssues(mixedProject(), { measure: false });
    expect(issues.has('c2')).toBe(false);
    expect(issues.has('c1')).toBe(true);
  });

  test('buildCourseProjectZip never compiles the RISE row into the archive or the manifest', async () => {
    const project = mixedProject();
    saveProject(project);

    const zipBlob = await buildCourseProjectZip(project.id);
    const entries = await readZip(zipBlob);
    const paths = entries.map(e => e.path);

    expect(paths.some(p => p.includes('welcome') || p.toLowerCase().includes('rise'))).toBe(false);

    const manifest = JSON.parse(new TextDecoder().decode(entries.find(e => e.path === 'manifest.json').data));
    expect(manifest.totalComponents).toBe(1);
    const listedComponentIds = manifest.sections.flatMap(s => s.components).map(c => c.componentId);
    expect(listedComponentIds).toEqual(['c1']);
  });
});
