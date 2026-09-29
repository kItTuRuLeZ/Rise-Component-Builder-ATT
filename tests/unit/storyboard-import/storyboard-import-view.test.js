// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { StoryboardImportView } from '../../../js/dashboard/storyboard-import-view.js';
import { createZip } from '../../../js/zip.js';
import { getProject } from '../../../js/storage.js';
import { memoryLocalStorage } from '../../fixtures/index.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

function realTemplateFile() {
  const buffer = readFileSync(templatePath);
  return new File([buffer], 'valid-template.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// A minimal, hand-built word/document.xml with every placeholder filled in — the same shape as
// the real template (metadata table, one "Section ID:.../Section title:..." heading + outline
// table, one "Block ID:.../Component:..." heading + Accordion content record table) but with
// real values, so extractStoryboard()/validateStoryboard() report zero fatal findings and the
// full confirm flow can be exercised without depending on a template fixture that's always
// (correctly) unfilled.
function cell(text) {
  return `<w:tc><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}
function row(cells) {
  return `<w:tr>${cells.map(cell).join('')}</w:tr>`;
}
function heading2(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}
function table(rows) {
  return `<w:tbl>${rows.map(row).join('')}</w:tbl>`;
}

async function validDocxFile(overrides = {}) {
  const courseTitle = overrides.courseTitle ?? 'Warehouse Safety Basics';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${table([['Field', 'Value'], ['Course title', courseTitle]])}
    ${heading2('Section ID: S01     Section title: Getting Started')}
    ${table([
      ['Block ID', 'Kind', 'Component', 'Title and note'],
      ['S01-B01', 'RISE', 'Text', 'Welcome — paste the approved introduction in Rise.'],
      ['S01-B02', 'BUILDER', 'Accordion', 'Key principles — import the content record S01-B02.']
    ])}
    ${heading2('Block ID: S01-B02     Component: Accordion')}
    ${table([
      ['Field', 'Item', 'Approved content'],
      ['Item title', '1', 'Confirm the goal'],
      ['Item body', '1', 'Define the outcome first.'],
      ['Item title', '2', 'Check the evidence'],
      ['Item body', '2', 'Review the source.']
    ])}
  </w:body>
</w:document>`;
  const blob = createZip([{ path: 'word/document.xml', data: xml }]);
  return new File([blob], 'valid.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let backCalled = false;
  let importedProjectId = null;
  const view = new StoryboardImportView({
    container,
    onBack: () => { backCalled = true; },
    onImported: (id) => { importedProjectId = id; }
  });
  view.mount();
  return { view, container, calls: () => ({ backCalled, importedProjectId }) };
}

// Each mount() appends a fresh container with fixed element ids (#sbi-file-input, etc.) to
// document.body. Without removing it, duplicate ids pile up across tests in this file and
// jsdom/nwsapi's id-selector fast path (querySelector('#id')) can resolve against the wrong
// (stale, disconnected-in-spirit but still-attached) element instead of scoping to the container
// it was called on — confirmed by comparing against an equivalent [id="..."] attribute selector,
// which isn't affected, while the app itself never accumulates stale containers this way.
afterEach(() => {
  document.body.innerHTML = '';
});

describe('StoryboardImportView: select step', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('renders the file picker and the Back button navigates out', () => {
    const { container, calls } = mount();
    expect(container.querySelector('#sbi-file-input')).toBeTruthy();
    expect(container.textContent).toContain('Import Storyboard (.docx)');
    container.querySelector('#sbi-back-btn').click();
    expect(calls().backCalled).toBe(true);
  });
});

describe('StoryboardImportView: parsing a malformed file', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('a non-docx file shows the parse-error step with a "choose a different file" recovery', async () => {
    const { view, container } = mount();
    const badFile = new File(['not a zip at all'], 'notes.txt', { type: 'text/plain' });
    await view.handleFile(badFile);
    expect(container.textContent).toContain('Could not import');
    expect(container.textContent).toMatch(/not.*valid ZIP archive|could not be read/i);

    container.querySelector('#sbi-retry-btn').click();
    expect(container.querySelector('#sbi-file-input')).toBeTruthy();
  });
});

describe('StoryboardImportView: reviewing the real (unfilled) template', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('shows the fatal findings and disables Confirm', async () => {
    const { view, container } = mount();
    await view.handleFile(realTemplateFile());

    expect(container.textContent).toContain('issue');
    expect(container.textContent).toContain('must be fixed before this can be imported');
    const confirmBtn = container.querySelector('#sbi-confirm-btn');
    expect(confirmBtn.disabled).toBe(true);
  });
});

describe('StoryboardImportView: reviewing and confirming a fully filled-in storyboard', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('review step pre-fills the project name from the metadata course title and enables Confirm', async () => {
    const { view, container } = mount();
    await view.handleFile(await validDocxFile());

    const nameInput = container.querySelector('#sbi-project-name');
    expect(nameInput.value).toBe('Warehouse Safety Basics');
    expect(container.querySelector('#sbi-confirm-btn').disabled).toBe(false);
    expect(container.textContent).toContain('S01-B02');
    expect(container.textContent).toContain('S01-B01');
  });

  test('confirming saves a real project and fires onImported with its id', async () => {
    const { view, container, calls } = mount();
    await view.handleFile(await validDocxFile());

    container.querySelector('#sbi-confirm-btn').click();

    const { importedProjectId } = calls();
    expect(importedProjectId).toBeTruthy();
    const project = getProject(importedProjectId);
    expect(project).toBeTruthy();
    expect(project.name).toBe('Warehouse Safety Basics');
    expect(project.clientLabel).toBe('AT&T');
    expect(Object.values(project.components).map(c => c.kind).sort()).toEqual(['builder', 'rise']);
  });

  test('an edited project name is used instead of the metadata title', async () => {
    const { view, container, calls } = mount();
    await view.handleFile(await validDocxFile());

    const nameInput = container.querySelector('#sbi-project-name');
    nameInput.value = 'My Custom Course Name';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('#sbi-confirm-btn').click();

    const project = getProject(calls().importedProjectId);
    expect(project.name).toBe('My Custom Course Name');
  });

  test('"Choose a different file" returns to the select step without importing anything', async () => {
    const { view, container } = mount();
    await view.handleFile(await validDocxFile());
    container.querySelector('#sbi-choose-different-btn').click();
    expect(container.querySelector('#sbi-file-input')).toBeTruthy();
    expect(container.textContent).not.toContain('Warehouse Safety Basics');
  });
});

describe('StoryboardImportView: the file input wiring itself', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  test('selecting a file through the real input element triggers parsing', async () => {
    const { view, container } = mount();
    const file = await validDocxFile();
    const input = container.querySelector('#sbi-file-input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    const changeHandled = new Promise(resolve => {
      const original = view.handleFile.bind(view);
      view.handleFile = async (f) => { await original(f); resolve(); };
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await changeHandled;

    expect(container.querySelector('#sbi-project-name')).toBeTruthy();
  });
});
