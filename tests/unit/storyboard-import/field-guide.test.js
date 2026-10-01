// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';
import { validateStoryboard } from '../../../js/storyboard-import/validation.js';
import { buildProjectFromStoryboard } from '../../../js/storyboard-import/build-project.js';
import { buildRiseSheetText } from '../../../js/storyboard-import/build-sheet.js';
import {
  COMPONENT_NOTES, buildFieldGuideMarkdown, describeStoryboardCounts, formatComponentName, getSupportedComponents
} from '../../../js/storyboard-import/field-guide.js';
import { KNOWN_TEMPLATE_FIELDS, SUPPORTED_COMPONENT_TYPES, isSharedTemplateField } from '../../../js/storyboard-import/field-mapping.js';
import { editorSchemas as COMPONENT_SCHEMAS } from '../../../js/editor-schemas.js';

// Audit 2026-09-30, section 5: the import help listed 4 component types, there was no template or
// field guide to download, and the reference template did not import. The in-app help and the
// guide are now generated from the importer's own tables, and the templates the app ships are
// checked here against the real importer so they cannot drift apart again.

const templatesDir = join(process.cwd(), 'templates', 'storyboard');

async function load(file) {
  const buffer = readFileSync(join(templatesDir, file));
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return extractStoryboard(extractBodyBlocks(await parseDocxDocument(blob)));
}

const components = getSupportedComponents();
const byId = id => components.find(c => c.builderId === id);

describe('supported components are generated from the importer, not hand-listed', () => {
  test('every supported component type is listed, each maps to a real Builder editor schema', () => {
    expect(components).toHaveLength(Object.keys(SUPPORTED_COMPONENT_TYPES).length);
    expect(components.length).toBe(26);
    expect(new Set(components.map(c => c.name)).size).toBe(components.length);
    for (const component of components) {
      expect(COMPONENT_SCHEMAS[component.builderId], `${component.name} has an editor schema`).toBeTruthy();
    }
  });

  test('component names are display-cased the way the template spells them', () => {
    expect(formatComponentName('accordion')).toBe('Accordion');
    expect(formatComponentName('fill in the blank')).toBe('Fill in the Blank');
    expect(formatComponentName('policy & alert cards')).toBe('Policy & Alert Cards');
    expect(formatComponentName('guided vertical timeline')).toBe('Guided Vertical Timeline');
  });

  test('every field the guide lists comes from the importer\'s own table, with a once/per-item scope', () => {
    for (const component of components) {
      expect(component.fields.map(f => f.label)).toEqual(KNOWN_TEMPLATE_FIELDS[component.builderId]);
      component.fields.forEach(f => expect(f.scope).toBe(isSharedTemplateField(component.builderId, f.label) ? 'block' : 'item'));
    }
  });

  test('required fields and minimum item counts are derived from what the real mappers reject', () => {
    const required = id => byId(id).fields.filter(f => f.required).map(f => f.label);
    expect(required('accordion')).toEqual(['Item title', 'Item body']);
    expect(required('dial-gauge')).toEqual(expect.arrayContaining(['Value', 'Minimum', 'Maximum', 'Tier title', 'Tier minimum', 'Tier maximum', 'Tier insight']));
    expect(required('interactive-video')).toEqual(expect.arrayContaining(['Title', 'Video source', 'Marker title']));
    expect(required('button-list')).toEqual(['Item title', 'Destination URL']);
    expect(byId('dial-gauge').minItems).toBe(1);
    expect(byId('flip-cards').minItems).toBe(2);
  });

  test('component notes only describe real components', () => {
    for (const id of Object.keys(COMPONENT_NOTES)) expect(byId(id), `notes for ${id}`).toBeTruthy();
  });
});

describe('storyboard counts are described as Builder components + Rise references', () => {
  test('26 + 8 is not presented as 34 exportable components', () => {
    expect(describeStoryboardCounts(26, 8)).toBe('26 Builder components + 8 Rise references (34 outline rows)');
  });

  test('singular forms and no Rise references', () => {
    expect(describeStoryboardCounts(1, 1)).toBe('1 Builder component + 1 Rise reference (2 outline rows)');
    expect(describeStoryboardCounts(4, 0)).toBe('4 Builder components + 0 Rise references (4 outline rows)');
  });
});

describe('the field guide download', () => {
  const guide = buildFieldGuideMarkdown({ editionLabel: 'TEST' });

  test('names every supported component and says how the document must be laid out', () => {
    for (const component of components) expect(guide).toContain(`### ${component.name}`);
    expect(guide).toContain('## Supported Builder components (26)');
    expect(guide).toContain('Section ID: <id>');
    expect(guide).toContain('Block ID: <id>');
    expect(guide).toContain('The Item column');
    expect(guide).toContain('# Rise Component Builder (TEST): storyboard field guide');
  });

  test('is explicit about what filling does and does not do, and about native Rise references', () => {
    expect(guide).toMatch(/does \*\*not\*\* write content for you/);
    expect(guide).toMatch(/does \*\*not\*\* author native Rise blocks/);
    expect(guide).toMatch(/excluded from the Builder's preview, QA and export/);
    expect(guide).toContain('Rise Build Sheet');
    expect(guide).toMatch(/media/i);
    expect(guide).toContain('attach in Builder');
  });

  test('is deterministic', () => {
    expect(buildFieldGuideMarkdown({ editionLabel: 'TEST' })).toBe(guide);
  });
});

describe('the shipped example storyboard imports as-is (the template matches the parser)', () => {
  test('26 Builder components + 8 Rise references, no blocking findings, no unmapped fields', async () => {
    const storyboard = await load('Rise_Storyboard_All_Components_Example.docx');
    const validation = validateStoryboard(storyboard);
    const rows = storyboard.sections.flatMap(section => section.outlineRows);

    expect(rows).toHaveLength(34);
    expect(rows.filter(r => r.kind === 'BUILDER')).toHaveLength(26);
    expect(rows.filter(r => r.kind === 'RISE')).toHaveLength(8);
    expect(validation.findings.filter(f => f.severity === 'fatal')).toEqual([]);
    expect(Object.keys(validation.mappedComponentsByBlockId)).toHaveLength(26);
    expect(validation.findings.filter(f => f.code === 'unmapped-field')).toEqual([]);
    // The one honest limitation: an Interactive Video question marker imports only its correct answer.
    expect(validation.findings.map(f => f.code)).toEqual(['single-answer-marker']);
  });

  test('every one of the 26 supported component types appears exactly once', async () => {
    const validation = validateStoryboard(await load('Rise_Storyboard_All_Components_Example.docx'));
    const types = Object.values(validation.mappedComponentsByBlockId).map(m => m.type).sort();
    expect(types).toEqual(Object.values(SUPPORTED_COMPONENT_TYPES).sort());
  });

  test('the field guide agrees with the example: shared fields have a blank Item column, repeated fields are numbered', async () => {
    const storyboard = await load('Rise_Storyboard_All_Components_Example.docx');
    const disagreements = [];
    for (const record of Object.values(storyboard.contentRecords)) {
      const id = SUPPORTED_COMPONENT_TYPES[record.component.trim().toLowerCase()];
      for (const { field, item } of record.fields) {
        const shared = isSharedTemplateField(id, field);
        if (shared !== (item === null)) disagreements.push(`${record.blockId} ${field}: item=${item}, guide says ${shared ? 'once' : 'per item'}`);
        if (!KNOWN_TEMPLATE_FIELDS[id].includes(field)) disagreements.push(`${record.blockId} ${field}: not a known field`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  test('imports into a project that keeps all 34 rows in section and outline order, with Rise rows excluded from Builder components', async () => {
    const storyboard = await load('Rise_Storyboard_All_Components_Example.docx');
    const project = buildProjectFromStoryboard(storyboard, validateStoryboard(storyboard));

    const expectedOrder = storyboard.sections.flatMap(section => section.outlineRows.map(row => `${row.kind}:${row.blockId}`));
    const actualOrder = project.sectionOrder.flatMap(sectionId => project.sections[sectionId].componentOrder
      .map(compId => `${project.components[compId].kind === 'rise' ? 'RISE' : 'BUILDER'}:${project.components[compId].config?.blockId ?? '(builder)'}`));
    expect(actualOrder).toHaveLength(34);
    // Rise rows keep their block id; Builder rows keep their position.
    expectedOrder.forEach((entry, index) => {
      const [kind, blockId] = entry.split(':');
      expect(actualOrder[index].startsWith(kind)).toBe(true);
      if (kind === 'RISE') expect(actualOrder[index]).toBe(`RISE:${blockId}`);
    });
    expect(Object.values(project.components).filter(c => c.kind === 'builder')).toHaveLength(26);
    expect(Object.values(project.components).filter(c => c.kind === 'rise')).toHaveLength(8);
  });

  test('the Rise Build Sheet keeps all 8 references, in outline order, with their build notes', async () => {
    const storyboard = await load('Rise_Storyboard_All_Components_Example.docx');
    const project = buildProjectFromStoryboard(storyboard, validateStoryboard(storyboard));
    const sheet = buildRiseSheetText(project);

    const riseRows = storyboard.sections.flatMap(section => section.outlineRows.filter(row => row.kind === 'RISE'));
    expect(riseRows).toHaveLength(8);
    let cursor = -1;
    for (const row of riseRows) {
      const at = sheet.indexOf(row.blockId, cursor + 1);
      expect(at, `${row.blockId} appears after the previous reference`).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(sheet).toContain('8 Rise blocks');
  });
});

describe('the shipped blank template', () => {
  test('is the real template: it parses, and only its own unfilled placeholders block the import', async () => {
    const storyboard = await load('Rise_Storyboard_Blank_Template.docx');
    const { findings, mappedComponentsByBlockId } = validateStoryboard(storyboard);
    expect(storyboard.sections.length).toBeGreaterThan(0);
    expect(Object.keys(mappedComponentsByBlockId).length).toBeGreaterThan(0);
    // Until the author fills it in, the placeholders are reported; nothing else is wrong with it.
    expect(findings.filter(f => f.severity === 'fatal').map(f => f.code).sort()).toEqual(['missing-section-title', 'unknown-outline-kind']);
  });
});
