// @vitest-environment jsdom
// A kind:"rise" component (storyboard import, docs/STORYBOARD-IMPORT-DESIGN.md) has no
// schema-driven config, so the course outline, canvas, and inspector must never try to compile
// or open a schema editor for one — they need their own distinct rendering instead.
import { beforeEach, describe, expect, test } from 'vitest';
import { ProjectOverviewView } from '../../../js/dashboard/project-overview.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../../js/project-schema.js';
import { saveProject } from '../../../js/storage.js';
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
  const section = createSection({ id: 's1', name: 'Getting Started', componentOrder: ['c1', 'c2'] });
  return buildProjectSchemaV3({
    id: 'p1', name: 'Mixed Course',
    sectionOrder: ['s1'], sections: { s1: section },
    components: { c1: builder, c2: rise }
  });
}

describe('course outline: kind:"rise" row rendering', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
    document.body.innerHTML = '<div id="container"></div>';
  });

  test('the RISE row shows a Rise badge and no Focus Edit / Open Focus Editor controls; the BUILDER row keeps both', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    const overview = new ProjectOverviewView({ container, projectId: 'p1' });
    overview.mount();

    const riseRow = container.querySelector('[data-comp-id="c2"]');
    const builderRow = container.querySelector('[data-comp-id="c1"]');
    expect(riseRow.textContent).toContain('Rise: Text');
    expect(riseRow.querySelector('[data-action="edit-comp"]')).toBeNull();
    expect(builderRow.querySelector('[data-action="edit-comp"]')).not.toBeNull();

    overview.unmount();
  });

  test('the RISE row\'s overflow menu has no "Open Focus Editor" or "Export This Block" item, but keeps Duplicate/Rename/Delete', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    const overview = new ProjectOverviewView({ container, projectId: 'p1' });
    overview.mount();
    overview.state.activeMenuId = 'c2';
    overview.render();

    const riseRow = container.querySelector('[data-comp-id="c2"]');
    expect(riseRow.querySelector('[data-action="open-focus-editor"]')).toBeNull();
    expect(riseRow.querySelector('[data-action="export-comp"]')).toBeNull();
    expect(riseRow.querySelector('[data-action="duplicate-comp"]')).not.toBeNull();
    expect(riseRow.querySelector('[data-action="delete-comp"]')).not.toBeNull();

    overview.unmount();
  });

  test('the BUILDER row\'s overflow menu keeps "Export This Block", which fires onExportComponent with the project and component', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    let exported = null;
    const overview = new ProjectOverviewView({
      container, projectId: 'p1',
      onExportComponent: (project, comp) => { exported = { project, comp }; }
    });
    overview.mount();
    overview.state.activeMenuId = 'c1';
    overview.render();

    const builderRow = container.querySelector('[data-comp-id="c1"]');
    const exportBtn = builderRow.querySelector('[data-action="export-comp"]');
    expect(exportBtn).not.toBeNull();
    expect(exportBtn.textContent).toBe('Export This Block');
    exportBtn.click();

    expect(exported).not.toBeNull();
    expect(exported.project.id).toBe('p1');
    expect(exported.comp.id).toBe('c1');

    overview.unmount();
  });

  test('selecting the RISE row shows the "authored in Rise" canvas panel, its build note, and no live-preview iframe', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    const overview = new ProjectOverviewView({ container, projectId: 'p1' });
    overview.mount();
    overview.selectNode('component', 'c2');

    expect(container.textContent).toContain('Authored directly in Rise');
    expect(container.textContent).toContain('paste the approved introduction in Rise.');
    expect(container.querySelector('.canvas-preview-iframe')).toBeNull();
    expect(container.querySelector('[data-action="open-focus-editor"]')).toBeNull();

    overview.unmount();
  });

  test('selecting the RISE row shows the inspector\'s Rise-only panel with no "Open Focus Editor" button', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    const overview = new ProjectOverviewView({ container, projectId: 'p1' });
    overview.mount();
    overview.selectNode('component', 'c2');

    expect(container.querySelector('.inspector-body').textContent).toContain('Authored in');
    expect(container.querySelector('[data-action="open-focus-editor"]')).toBeNull();
    expect(container.querySelector('#insp-comp-name').value).toBe('Welcome');

    overview.unmount();
  });

  test('selecting the BUILDER row still shows the normal canvas with a live-preview iframe and Open Focus Editor', () => {
    saveProject(mixedProject());
    const container = document.getElementById('container');
    const overview = new ProjectOverviewView({ container, projectId: 'p1' });
    overview.mount();
    overview.selectNode('component', 'c1');

    expect(container.querySelector('.canvas-preview-iframe')).not.toBeNull();
    expect(container.querySelector('[data-action="open-focus-editor"]')).not.toBeNull();

    overview.unmount();
  });
});
