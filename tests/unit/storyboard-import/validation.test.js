// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';
import { validateStoryboard } from '../../../js/storyboard-import/validation.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

async function loadTemplateStoryboard() {
  const buffer = readFileSync(templatePath);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const blocks = extractBodyBlocks(await parseDocxDocument(blob));
  return extractStoryboard(blocks);
}

describe('validateStoryboard: the real (unfilled) template', () => {
  test('flags the template\'s own unfilled section title and the blank example outline row, and still maps the 4 real content records', async () => {
    const { findings, mappedComponentsByBlockId } = validateStoryboard(await loadTemplateStoryboard());

    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'missing-section-title' }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'unknown-outline-kind', message: expect.stringContaining('S01-B07') }));
    expect(findings.filter(f => f.code === 'orphan-content-record')).toEqual([]);
    expect(findings.filter(f => f.code === 'missing-builder-content-record')).toEqual([]);
    expect(findings.filter(f => f.code === 'mismatched-type')).toEqual([]);

    expect(Object.keys(mappedComponentsByBlockId).sort()).toEqual(['S01-B02', 'S01-B04', 'S01-B05', 'S01-B06']);
    expect(mappedComponentsByBlockId['S01-B02'].type).toBe('accordion');
    expect(mappedComponentsByBlockId['S01-B04'].type).toBe('multiple-choice');
    expect(mappedComponentsByBlockId['S01-B05'].type).toBe('image-gallery');
    expect(mappedComponentsByBlockId['S01-B06'].type).toBe('horizontal-timeline');
  });
});

describe('validateStoryboard: cross-reference checks', () => {
  const storyboard = (overrides) => ({
    metadata: {},
    sections: [],
    contentRecords: {},
    findings: [],
    ...overrides
  });

  test('a real section title passes with no missing-section-title finding', () => {
    const { findings } = validateStoryboard(storyboard({
      sections: [{ sectionId: 'S01', sectionTitle: 'Onboarding Essentials', outlineRows: [] }]
    }));
    expect(findings.filter(f => f.code === 'missing-section-title')).toEqual([]);
  });

  test('a BUILDER outline row with no matching content record is a fatal "missing-builder-content-record"', () => {
    const { findings } = validateStoryboard(storyboard({
      sections: [{
        sectionId: 'S01', sectionTitle: 'Onboarding',
        outlineRows: [{ blockId: 'S01-B02', kind: 'BUILDER', blockType: 'Accordion', titleAndNote: 'x' }]
      }],
      contentRecords: {}
    }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'missing-builder-content-record' }));
  });

  test('a RISE outline row is never checked against content records', () => {
    const { findings } = validateStoryboard(storyboard({
      sections: [{
        sectionId: 'S01', sectionTitle: 'Onboarding',
        outlineRows: [{ blockId: 'S01-B01', kind: 'RISE', blockType: 'Text', titleAndNote: 'x' }]
      }]
    }));
    expect(findings.filter(f => f.code === 'missing-builder-content-record')).toEqual([]);
  });

  test('outline blockType and content record component disagreeing is a fatal "mismatched-type"', () => {
    const { findings, mappedComponentsByBlockId } = validateStoryboard(storyboard({
      sections: [{
        sectionId: 'S01', sectionTitle: 'Onboarding',
        outlineRows: [{ blockId: 'S01-B02', kind: 'BUILDER', blockType: 'Multiple Choice', titleAndNote: 'x' }]
      }],
      contentRecords: {
        'S01-B02': { blockId: 'S01-B02', component: 'Accordion', fields: [] }
      }
    }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'mismatched-type' }));
    expect(mappedComponentsByBlockId['S01-B02']).toBeUndefined();
  });

  test('a content record no outline row references is a warning "orphan-content-record", and is excluded from the mapped output', () => {
    const { findings, mappedComponentsByBlockId } = validateStoryboard(storyboard({
      sections: [{ sectionId: 'S01', sectionTitle: 'Onboarding', outlineRows: [] }],
      contentRecords: {
        'S01-B99': { blockId: 'S01-B99', component: 'Accordion', fields: [] }
      }
    }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'orphan-content-record' }));
    expect(mappedComponentsByBlockId['S01-B99']).toBeUndefined();
  });

  test('an outline row whose kind is neither RISE nor BUILDER is a fatal "unknown-outline-kind"', () => {
    const { findings } = validateStoryboard(storyboard({
      sections: [{
        sectionId: 'S01', sectionTitle: 'Onboarding',
        outlineRows: [{ blockId: 'S01-B07', kind: '[RISE / BUILDER]', blockType: '[Exact type]', titleAndNote: 'x' }]
      }]
    }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'unknown-outline-kind' }));
  });

  test('a valid BUILDER row\'s field-mapping findings (e.g. required-field-missing) are merged into the overall findings', () => {
    const { findings } = validateStoryboard(storyboard({
      sections: [{
        sectionId: 'S01', sectionTitle: 'Onboarding',
        outlineRows: [{ blockId: 'S01-B02', kind: 'BUILDER', blockType: 'Accordion', titleAndNote: 'x' }]
      }],
      contentRecords: {
        'S01-B02': { blockId: 'S01-B02', component: 'Accordion', fields: [{ field: 'Item title', item: 1, content: '' }, { field: 'Item body', item: 1, content: 'Body' }] }
      }
    }));
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'required-field-missing' }));
  });

  test('extraction-level findings (e.g. duplicate-section-id) pass through unchanged', () => {
    const { findings } = validateStoryboard(storyboard({
      findings: [{ severity: 'fatal', code: 'duplicate-section-id', message: 'x' }]
    }));
    expect(findings).toContainEqual(expect.objectContaining({ code: 'duplicate-section-id' }));
  });
});
