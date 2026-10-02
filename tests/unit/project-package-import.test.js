// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { describeNonProjectZip, exportProjectPackage, importProjectPackage } from '../../js/project-package.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../js/project-schema.js';
import { getProject, loadProjects, saveProject } from '../../js/storage.js';
import { createZip } from '../../js/zip.js';
import { memoryLocalStorage } from '../fixtures/index.js';

// Audit 2026-09-30, section 8. importProjectPackage() rebuilt every project with the single-component
// (Schema v2) builder, so a course project (Schema v3: sections + components) lost its structure and
// failed with '"undefined" is not valid JSON': a course's .rise-project.zip could never be imported.

function courseProject() {
  const a = createComponentInstance({ id: 'c1', name: 'First lesson', type: 'accordion', config: { blockTitle: 'A', items: [{ title: 'One', content: 'Body' }] } });
  const b = createComponentInstance({ id: 'c2', name: 'Second lesson', type: 'flip-cards', config: { blockTitle: 'B', items: [{ title: 'Front', content: 'Back' }] } });
  return buildProjectSchemaV3({
    name: 'Roundtrip Course', clientLabel: 'Test', sectionOrder: ['s1', 's2'],
    sections: { s1: createSection({ id: 's1', name: 'Module 1', componentOrder: ['c1'] }), s2: createSection({ id: 's2', name: 'Module 2', componentOrder: ['c2'] }) },
    components: { c1: a, c2: b }
  });
}

const entry = path => ({ path, data: 'x' });
const kind = paths => describeNonProjectZip(paths.map(p => ({ path: p, data: new Uint8Array() })));

describe('importProjectPackage: course (Schema v3) projects', () => {
  beforeEach(() => { globalThis.localStorage = memoryLocalStorage(); });

  test('a course project survives export and import with its sections, order and components', async () => {
    const saved = saveProject(courseProject());
    const { blob } = await exportProjectPackage(getProject(saved.id));
    globalThis.localStorage = memoryLocalStorage();
    expect(loadProjects()).toHaveLength(0);

    const { project, restoredMediaCount, missingMedia } = await importProjectPackage(blob);
    expect(restoredMediaCount).toBe(0);
    expect(missingMedia).toEqual([]);
    expect(project.schemaVersion).toBe(3);
    expect(project.name).toBe('Roundtrip Course');
    expect(project.sectionOrder).toHaveLength(2);
    const names = project.sectionOrder.map(id => project.sections[id].name);
    expect(names).toEqual(['Module 1', 'Module 2']);
    const lessons = project.sectionOrder.flatMap(id => project.sections[id].componentOrder.map(cid => project.components[cid].name));
    expect(lessons).toEqual(['First lesson', 'Second lesson']);
    expect(loadProjects()).toHaveLength(1);
  });

  test('it is imported as a new project, not over an existing one', async () => {
    const saved = saveProject(courseProject());
    const { blob } = await exportProjectPackage(getProject(saved.id));
    const { project } = await importProjectPackage(blob);
    expect(project.id).not.toBe(saved.id);
    expect(loadProjects()).toHaveLength(2);
  });
});

describe('describeNonProjectZip: what a ZIP that is not a project backup is, and what to use instead', () => {
  test('a hosted web package', () => {
    const message = kind(['index.html', 'assets/a.js']);
    expect(message).toContain('hosted web package');
    expect(message).toContain('not an editable project backup');
    expect(message).toContain('Export Backup');
  });

  test('a hosted package inside one folder is still recognised', () => {
    expect(kind(['content/index.html', 'content/lib/a.js'])).toContain('hosted web package');
  });

  test('a SCORM package points to Post-Publish', () => {
    const message = kind(['imsmanifest.xml', 'index_lms.html']);
    expect(message).toContain('SCORM package');
    expect(message).toContain('Post-Publish');
  });

  test('a course pack', () => {
    const message = kind(['manifest.json', 'accordion/index.html']);
    expect(message).toContain('course pack');
    expect(message).toContain('Export Backup');
  });

  test('anything else', () => {
    expect(kind(['notes.txt'])).toContain('has no project.json');
  });

  test('importProjectPackage throws that message for a ZIP with no project.json', async () => {
    await expect(importProjectPackage(createZip([entry('index.html'), entry('a.js')]))).rejects.toThrow(/hosted web package/);
  });
});
