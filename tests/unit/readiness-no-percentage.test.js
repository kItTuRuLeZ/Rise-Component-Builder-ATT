// @vitest-environment jsdom
//
// 27 September 2026 functional audit, section 2: "Avoid broad claims such as 100% Compliant
// from automated WCAG checks." overallScore (js/dashboard/project-qa.js) is an internal
// weighted heuristic, not a compliance measurement — course-readiness.js's own header comment
// explains why it deliberately keeps technical/editorial/export-readiness as three separate,
// non-percentage signals. The Course Outline's contextual inspector still rendered that score
// as "Ready to Export (100%)", which reads as a certified pass. The field itself stays (other
// code and tests read overallScore directly); only this one display is fixed.
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ProjectOverviewView } from '../../js/dashboard/project-overview.js';
import { buildProjectSchemaV3, createComponentInstance } from '../../js/project-schema.js';
import { memoryLocalStorage } from '../fixtures/index.js';
import { saveProject } from '../../js/storage.js';

describe('Course Outline: Pre-Export QA Health shows a status, never a percentage', () => {
  let container;

  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
    document.body.innerHTML = `
      <div class="app-container" id="app-shell">
        <header class="app-toolbar"><div class="toolbar-brand"><span class="logo-title">Component Builder</span></div></header>
        <div id="view-container"></div>
      </div>
      <div id="modal-root"></div>
    `;
    container = document.getElementById('view-container');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a fully-ready course shows "Ready to Export", not "Ready to Export (100%)"', () => {
    const comp = createComponentInstance({
      name: 'Ready Accordion', type: 'accordion', status: 'ready',
      config: { blockTitle: 'Header', items: [{ title: 'Item 1', content: 'Content 1' }] }
    });
    const project = buildProjectSchemaV3({ name: 'Score Display Test', components: { [comp.id]: comp } });
    saveProject(project);

    const overview = new ProjectOverviewView({ container, projectId: project.id, onNavigate: () => {}, onEditComponent: () => {} });
    overview.mount();

    const inspector = container.querySelector('.workspace-inspector-zone');
    expect(inspector.textContent).toContain('Ready to Export');
    expect(inspector.textContent).not.toMatch(/\(\d+%\)/);
  });
});
