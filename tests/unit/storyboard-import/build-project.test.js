// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';
import { validateStoryboard } from '../../../js/storyboard-import/validation.js';
import { buildProjectFromStoryboard } from '../../../js/storyboard-import/build-project.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

async function loadTemplateStoryboard() {
  const buffer = readFileSync(templatePath);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const blocks = extractBodyBlocks(await parseDocxDocument(blob));
  return extractStoryboard(blocks);
}

// A minimal, fully-filled-in (no placeholders) synthetic storyboard: one RISE row, one BUILDER
// (Accordion) row — enough to exercise every branch without depending on the real template's
// own unfilled example text.
function filledInStoryboard() {
  return {
    metadata: { 'Course title': 'Warehouse Safety Basics' },
    sections: [{
      sectionId: 'S01',
      sectionTitle: 'Getting Started',
      outlineRows: [
        { blockId: 'S01-B01', kind: 'RISE', blockType: 'Text', titleAndNote: 'Welcome — paste the approved introduction in Rise.' },
        { blockId: 'S01-B02', kind: 'BUILDER', blockType: 'Accordion', titleAndNote: 'Key principles — import the content record S01-B02.' }
      ]
    }],
    contentRecords: {
      'S01-B02': {
        blockId: 'S01-B02', component: 'Accordion',
        fields: [
          { field: 'Item title', item: 1, content: 'Confirm the goal' },
          { field: 'Item body', item: 1, content: 'Define the outcome first.' },
          { field: 'Item title', item: 2, content: 'Check the evidence' },
          { field: 'Item body', item: 2, content: 'Review the source.' }
        ]
      }
    },
    findings: []
  };
}

describe('buildProjectFromStoryboard: a filled-in, valid storyboard', () => {
  test('builds one section with one RISE component and one BUILDER component, in outline order', () => {
    const storyboard = filledInStoryboard();
    const validation = validateStoryboard(storyboard);
    expect(validation.findings.filter(f => f.severity === 'fatal')).toEqual([]);

    const project = buildProjectFromStoryboard(storyboard, validation);
    expect(project.schemaVersion).toBe(3);
    expect(project.name).toBe('Warehouse Safety Basics');
    expect(project.sectionOrder).toHaveLength(1);

    const section = project.sections[project.sectionOrder[0]];
    expect(section.name).toBe('Getting Started');
    expect(section.componentOrder).toHaveLength(2);

    const [riseId, builderId] = section.componentOrder;
    const riseComp = project.components[riseId];
    expect(riseComp.kind).toBe('rise');
    expect(riseComp.type).toBe('Text');
    expect(riseComp.name).toBe('Welcome');
    expect(riseComp.config).toEqual({ blockId: 'S01-B01', notes: 'paste the approved introduction in Rise.' });

    const builderComp = project.components[builderId];
    expect(builderComp.kind).toBe('builder');
    expect(builderComp.type).toBe('accordion');
    expect(builderComp.name).toBe('Key principles');
    expect(builderComp.config.items).toEqual([
      { title: 'Confirm the goal', content: 'Define the outcome first.' },
      { title: 'Check the evidence', content: 'Review the source.' }
    ]);
  });

  test('an explicit name option overrides the metadata course title', () => {
    const storyboard = filledInStoryboard();
    const validation = validateStoryboard(storyboard);
    const project = buildProjectFromStoryboard(storyboard, validation, { name: 'Custom Name' });
    expect(project.name).toBe('Custom Name');
  });

  test('falls back to "Imported Storyboard" when the metadata has no usable course title', () => {
    const storyboard = { ...filledInStoryboard(), metadata: { 'Course title': '[Enter course title]' } };
    const validation = validateStoryboard(storyboard);
    const project = buildProjectFromStoryboard(storyboard, validation);
    expect(project.name).toBe('Imported Storyboard');
  });

  test('clientLabel option is honored, defaulting to the edition label', () => {
    const storyboard = filledInStoryboard();
    const validation = validateStoryboard(storyboard);
    expect(buildProjectFromStoryboard(storyboard, validation).clientLabel).toBe('AT&T');
    expect(buildProjectFromStoryboard(storyboard, validation, { clientLabel: 'PMI' }).clientLabel).toBe('PMI');
  });
});

describe('buildProjectFromStoryboard: refuses to build past unresolved issues', () => {
  test('throws when any fatal finding remains, and never touches project-schema at all', () => {
    const storyboard = filledInStoryboard();
    const validation = { findings: [{ severity: 'fatal', code: 'x', message: 'x' }], mappedComponentsByBlockId: {} };
    expect(() => buildProjectFromStoryboard(storyboard, validation)).toThrow(/1 unresolved validation issue/);
  });

  test('warnings alone do not block building', () => {
    const storyboard = filledInStoryboard();
    const validation = validateStoryboard(storyboard);
    validation.findings.push({ severity: 'warning', code: 'orphan-content-record', message: 'x' });
    expect(() => buildProjectFromStoryboard(storyboard, validation)).not.toThrow();
  });

  test('the real (unfilled) template refuses to build until its placeholders are resolved', async () => {
    const storyboard = await loadTemplateStoryboard();
    const validation = validateStoryboard(storyboard);
    expect(validation.findings.some(f => f.severity === 'fatal')).toBe(true);
    expect(() => buildProjectFromStoryboard(storyboard, validation)).toThrow(/unresolved validation issue/);
  });
});
