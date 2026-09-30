// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';
import { isMediaReference } from '../../../js/media.js';
import { mapContentRecordToComponent, SUPPORTED_COMPONENT_TYPES } from '../../../js/storyboard-import/field-mapping.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

async function loadTemplateContentRecords() {
  const buffer = readFileSync(templatePath);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const blocks = extractBodyBlocks(await parseDocxDocument(blob));
  return extractStoryboard(blocks).contentRecords;
}

const record = (blockId, component, fields) => ({ blockId, component, fields });
const f = (field, item, content) => ({ field, item, content });

describe('field-mapping: the real template\'s 4 content records', () => {
  test('Accordion (S01-B02) maps to blockHeadline/blockDesc + items[].title/content', async () => {
    const { 'S01-B02': accordion } = await loadTemplateContentRecords();
    const { type, config, findings } = mapContentRecordToComponent(accordion);
    expect(type).toBe('accordion');
    expect(findings.filter(x => x.severity === 'fatal')).toEqual([]);
    expect(config.blockHeadline).toBe('Key principles');
    expect(config.blockDesc).toBe('Select each principle to explore its application.');
    expect(config.items).toEqual([
      { title: 'Confirm the goal', content: 'Define the desired outcome before choosing a solution.' },
      { title: 'Check the evidence', content: 'Review the source and limitations of the evidence.' }
    ]);
  });

  test('Multiple Choice (S01-B04) maps Choice correct Yes/No to exactly one boolean true', async () => {
    const { 'S01-B04': mc } = await loadTemplateContentRecords();
    const { type, config, findings } = mapContentRecordToComponent(mc);
    expect(type).toBe('multiple-choice');
    expect(findings.filter(x => x.severity === 'fatal')).toEqual([]);
    expect(config.blockHeadline).toBe('What should the team do first?');
    expect(config.items).toEqual([
      { label: 'Define the desired outcome', content: 'Correct. Start with the goal.', correct: true },
      { label: 'Choose an image', content: 'Revisit the goal before selecting assets.', correct: false }
    ]);
  });

  test('Image Gallery (S01-B05) produces a pending, unresolvable media reference and preserves alt/caption', async () => {
    const { 'S01-B05': gallery } = await loadTemplateContentRecords();
    const { type, config, findings } = mapContentRecordToComponent(gallery);
    expect(type).toBe('image-gallery');
    expect(findings.filter(x => x.severity === 'fatal')).toEqual([]);
    expect(config.blockHeadline).toBe('Examples in practice');
    expect(config.items).toHaveLength(2);

    const [first, second] = config.items;
    expect(isMediaReference(first.content)).toBe(true);
    expect(first.content.name).toBe('example-before.png');
    expect(first.caption).toBe('Review the plan before work begins.');
    expect(first.altText).toBe('A team reviewing the project plan together.');
    // The template has no "Image title" row for either item — both titles are synthesized from
    // the caption, and that synthesis must be flagged, not silently treated as approved content.
    expect(first.title).toBe('Review the plan before work begins.');
    expect(second.content.name).toBe('example-after.png');
  });

  test('Horizontal Timeline (S01-B06) maps Step title/body to items[].title/content, in order', async () => {
    const { 'S01-B06': timeline } = await loadTemplateContentRecords();
    const { type, config, findings } = mapContentRecordToComponent(timeline);
    expect(type).toBe('horizontal-timeline');
    expect(findings.filter(x => x.severity === 'fatal')).toEqual([]);
    expect(config.blockHeadline).toBe('Project milestones');
    expect(config.items.map(i => i.title)).toEqual(['Discover', 'Design', 'Deliver']);
    expect(config.items.map(i => i.content)).toEqual([
      'Gather requirements and confirm the intended outcome.',
      'Agree on the proposed approach and review it.',
      'Release the solution and measure the result.'
    ]);
  });
});

describe('field-mapping: unsupported and malformed content records', () => {
  test('an unsupported component type produces no config, only an "unsupported-import-mapping" finding', () => {
    const rec = record('S01-B99', 'Knowledge Check', [f('Title', null, 'x')]);
    const { type, config, findings } = mapContentRecordToComponent(rec);
    expect(type).toBeNull();
    expect(config).toBeNull();
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'fatal', code: 'unsupported-import-mapping' })
    ]);
  });

  test('component name matching is case-insensitive', () => {
    expect(SUPPORTED_COMPONENT_TYPES['multiple choice']).toBe('multiple-choice');
    const rec = record('S01-B02', 'ACCORDION', [
      f('Item title', 1, 'A'), f('Item body', 1, 'B'),
      f('Item title', 2, 'C'), f('Item body', 2, 'D')
    ]);
    expect(mapContentRecordToComponent(rec).type).toBe('accordion');
  });

  test('a missing required field is a fatal "required-field-missing" finding, and the empty string still round-trips', () => {
    const rec = record('S01-B02', 'Accordion', [f('Item title', 1, ''), f('Item body', 1, 'Body only')]);
    const { config, findings } = mapContentRecordToComponent(rec);
    expect(config.items[0]).toEqual({ title: '', content: 'Body only' });
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'required-field-missing' }));
  });

  test('zero Multiple Choice items marked correct is a fatal "wrong-correct-count" finding', () => {
    const rec = record('S01-B04', 'Multiple Choice', [
      f('Choice text', 1, 'A'), f('Choice correct', 1, 'No'),
      f('Choice text', 2, 'B'), f('Choice correct', 2, 'No')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ code: 'wrong-correct-count', message: expect.stringContaining('0 choice') }));
  });

  test('two Multiple Choice items marked correct is a fatal "wrong-correct-count" finding', () => {
    const rec = record('S01-B04', 'Multiple Choice', [
      f('Choice text', 1, 'A'), f('Choice correct', 1, 'Yes'),
      f('Choice text', 2, 'B'), f('Choice correct', 2, 'Yes')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ code: 'wrong-correct-count', message: expect.stringContaining('2 choice') }));
  });

  test('non-sequential item numbering (a gap) is a warning, not silently accepted', () => {
    const rec = record('S01-B02', 'Accordion', [
      f('Item title', 1, 'A'), f('Item body', 1, 'B'),
      f('Item title', 3, 'C'), f('Item body', 3, 'D')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'non-sequential-item-numbering' }));
  });

  test('an image source with no bracketed filename still produces a valid (pending) media reference', () => {
    const rec = record('S01-B05', 'Image Gallery', [f('Image source', 1, 'photo.png (no brackets)')]);
    const { config } = mapContentRecordToComponent(rec);
    expect(isMediaReference(config.items[0].content)).toBe(true);
    expect(config.items[0].content.name).toBe('photo.png (no brackets)');
  });

  test('Horizontal Timeline with only 1 step is a fatal "too-few-items" finding', () => {
    const rec = record('S01-B06', 'Horizontal Timeline', [f('Step title', 1, 'Only step'), f('Step body', 1, 'Body')]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'too-few-items' }));
  });
});
