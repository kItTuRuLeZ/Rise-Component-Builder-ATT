// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

async function loadTemplateBlocks() {
  const buffer = readFileSync(templatePath);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return extractBodyBlocks(await parseDocxDocument(blob));
}

describe('storyboard-extract: the real template', () => {
  test('extracts the metadata table', async () => {
    const { metadata, findings } = extractStoryboard(await loadTemplateBlocks());
    expect(findings.filter(f => f.severity === 'fatal')).toEqual([]);
    expect(metadata['Storyboard version']).toBe('1');
    expect(metadata['Client edition']).toBe('AT&T / PMI — choose one');
    expect(metadata['Course title']).toBe('[Enter course title]');
    expect(metadata['Course ID']).toBe('[Stable short identifier, e.g., SAFETY-101]');
  });

  test('extracts exactly one section (S01) with its title and all 7 outline rows', async () => {
    const { sections } = extractStoryboard(await loadTemplateBlocks());
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionId).toBe('S01');
    expect(sections[0].sectionTitle).toBe('[Enter lesson or section title]');
    expect(sections[0].outlineRows).toHaveLength(7);
  });

  test('outline rows preserve kind, block type, and title/note verbatim, in document order', async () => {
    const { sections } = extractStoryboard(await loadTemplateBlocks());
    const rows = sections[0].outlineRows;
    expect(rows[0]).toEqual({ blockId: 'S01-B01', kind: 'RISE', blockType: 'Text', titleAndNote: 'Welcome — paste the approved introduction in Rise.' });
    expect(rows[1]).toEqual({ blockId: 'S01-B02', kind: 'BUILDER', blockType: 'Accordion', titleAndNote: 'Key principles — import the content record S01-B02.' });
    expect(rows[3]).toEqual({ blockId: 'S01-B04', kind: 'BUILDER', blockType: 'Multiple Choice', titleAndNote: 'Check understanding — import the content record S01-B04.' });
    expect(rows[4].blockType).toBe('Image Gallery');
    expect(rows[5].blockType).toBe('Horizontal Timeline');
  });

  test('the template\'s own blank placeholder outline row (S01-B07) passes through as-is — filtering it is validation\'s job, not extraction\'s', async () => {
    const { sections } = extractStoryboard(await loadTemplateBlocks());
    const placeholderRow = sections[0].outlineRows[6];
    expect(placeholderRow.blockId).toBe('S01-B07');
    // Bracketed, not a real "RISE"/"BUILDER" value — a later validation pass (not this module)
    // is expected to flag this as an unknown-kind finding, not silently drop or accept it.
    expect(placeholderRow.kind).toBe('[RISE / BUILDER]');
  });

  test('extracts all 4 target content records with exact field/item/content values', async () => {
    const { contentRecords } = extractStoryboard(await loadTemplateBlocks());
    expect(Object.keys(contentRecords).sort()).toEqual(['S01-B02', 'S01-B04', 'S01-B05', 'S01-B06']);

    const accordion = contentRecords['S01-B02'];
    expect(accordion.component).toBe('Accordion');
    expect(accordion.fields).toEqual([
      { field: 'Title', item: null, content: 'Key principles' },
      { field: 'Introduction', item: null, content: 'Select each principle to explore its application.' },
      { field: 'Item title', item: 1, content: 'Confirm the goal' },
      { field: 'Item body', item: 1, content: 'Define the desired outcome before choosing a solution.' },
      { field: 'Item title', item: 2, content: 'Check the evidence' },
      { field: 'Item body', item: 2, content: 'Review the source and limitations of the evidence.' }
    ]);

    const mc = contentRecords['S01-B04'];
    expect(mc.component).toBe('Multiple Choice');
    expect(mc.fields.filter(f => f.field === 'Choice correct')).toEqual([
      { field: 'Choice correct', item: 1, content: 'Yes' },
      { field: 'Choice correct', item: 2, content: 'No' }
    ]);

    const gallery = contentRecords['S01-B05'];
    expect(gallery.component).toBe('Image Gallery');
    // The bracketed filename note is legitimate approved content (a pending-media instruction),
    // not a placeholder row to exclude — field-mapping.js, not this module, interprets it.
    expect(gallery.fields[1]).toEqual({ field: 'Image source', item: 1, content: '[example-before.png — attach in Builder]' });

    const timeline = contentRecords['S01-B06'];
    expect(timeline.component).toBe('Horizontal Timeline');
    expect(timeline.fields.filter(f => f.field === 'Step title').map(f => f.content)).toEqual(['Discover', 'Design', 'Deliver']);
  });

  test('the template\'s own blank "copy for each additional block" example is not extracted as a content record', async () => {
    const { contentRecords } = extractStoryboard(await loadTemplateBlocks());
    expect(contentRecords['[Sxx-Bxx]']).toBeUndefined();
    expect(Object.keys(contentRecords)).not.toContain('Sxx-Bxx');
  });

  test('no fatal findings for the valid template', async () => {
    const { findings } = extractStoryboard(await loadTemplateBlocks());
    expect(findings.filter(f => f.severity === 'fatal')).toEqual([]);
  });
});

describe('storyboard-extract: malformed input', () => {
  const p = (style, text) => ({ kind: 'paragraph', style, text });
  const t = rows => ({ kind: 'table', rows });

  test('flags a document with no sections at all', () => {
    const { findings, sections } = extractStoryboard([
      t([['Field', 'Value'], ['Storyboard version', '1']])
    ]);
    expect(sections).toEqual([]);
    expect(findings.some(f => f.code === 'no-sections-found')).toBe(true);
  });

  test('flags a duplicate section id', () => {
    const blocks = [
      t([['Field', 'Value']]),
      p('Heading2', 'Section ID: S01     Section title: First'),
      t([['Block ID', 'Kind', 'Block type', 'Title and build note'], ['S01-B01', 'RISE', 'Text', 'x']]),
      p('Heading2', 'Section ID: S01     Section title: Duplicate'),
      t([['Block ID', 'Kind', 'Block type', 'Title and build note'], ['S01-B02', 'RISE', 'Text', 'y']])
    ];
    const { sections, findings } = extractStoryboard(blocks);
    expect(sections).toHaveLength(1); // only the first is kept
    expect(findings.some(f => f.code === 'duplicate-section-id')).toBe(true);
  });

  test('flags a section heading with no outline table right after it', () => {
    const blocks = [
      t([['Field', 'Value']]),
      p('Heading2', 'Section ID: S01     Section title: Orphan'),
      p('Normal', 'oops, a paragraph instead of a table')
    ];
    const { findings } = extractStoryboard(blocks);
    expect(findings.some(f => f.code === 'missing-outline-table')).toBe(true);
  });

  test('flags a duplicate content record block id', () => {
    const blocks = [
      t([['Field', 'Value']]),
      p('Heading2', 'Section ID: S01     Section title: A'),
      t([['Block ID', 'Kind', 'Block type', 'Title and build note'], ['S01-B01', 'BUILDER', 'Accordion', 'x']]),
      p('Heading2', 'Block ID: S01-B01     Component: Accordion'),
      t([['Field', 'Item', 'Approved content'], ['Title', '—', 'First']]),
      p('Heading2', 'Block ID: S01-B01     Component: Accordion'),
      t([['Field', 'Item', 'Approved content'], ['Title', '—', 'Second']])
    ];
    const { contentRecords, findings } = extractStoryboard(blocks);
    expect(contentRecords['S01-B01'].fields[0].content).toBe('First'); // only the first is kept
    expect(findings.some(f => f.code === 'duplicate-content-record')).toBe(true);
  });

  test('flags an unrecognized Heading2 that matches neither convention (the fragility this module exists to catch)', () => {
    const blocks = [
      t([['Field', 'Value']]),
      p('Heading2', 'Section: S01 — Onboarding'), // missing "Section ID: ... Section title: ..." structure entirely
      t([['Field', 'Value']])
    ];
    const { findings, sections } = extractStoryboard(blocks);
    expect(sections).toEqual([]);
    expect(findings.some(f => f.code === 'unrecognized-heading2')).toBe(true);
  });

  test('the template\'s own bracketed example IDs never produce a section or content record', () => {
    const blocks = [
      t([['Field', 'Value']]),
      p('Heading2', 'Section ID: [Sxx]     Section title: [Enter lesson or section title]'),
      t([['Field', 'Value']]),
      p('Heading2', 'Block ID: [Sxx-Bxx]     Component: [Exact name from picker]'),
      t([['Field', 'Value']])
    ];
    const { sections, contentRecords, findings } = extractStoryboard(blocks);
    expect(sections).toEqual([]);
    expect(Object.keys(contentRecords)).toEqual([]);
    // A bracketed placeholder heading is recognized and silently skipped, not reported as an
    // "unrecognized heading" — it matched the real convention, it just isn't real content.
    expect(findings.some(f => f.code === 'unrecognized-heading2')).toBe(false);
  });
});
