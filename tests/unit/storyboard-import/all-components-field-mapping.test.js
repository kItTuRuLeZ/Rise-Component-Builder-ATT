// @vitest-environment jsdom
// Field mapping for all 26 component types (field-mapping.js v2), verified against the real
// reference template covering every type: "SB Template/Rise_Storyboard_All_Components.docx",
// committed as tests/fixtures/storyboard/all-components-template.docx. This is the authoritative
// source for the template's field-naming convention per type — not invented from the schema
// alone. Complements storyboard-import/field-mapping.test.js, which covers the original 4 types
// (and their malformed-input cases) in depth; this file covers the 22 added types plus the
// cross-cutting unmapped-field detection.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument } from '../../../js/storyboard-import/docx-parser.js';
import { extractStoryboard } from '../../../js/storyboard-import/storyboard-extract.js';
import { validateStoryboard } from '../../../js/storyboard-import/validation.js';
import { isMediaReference } from '../../../js/media.js';
import {
  mapContentRecordToComponent, SUPPORTED_COMPONENT_TYPES, FIELD_MAPPING_VERSION
} from '../../../js/storyboard-import/field-mapping.js';
import { buildProjectFromStoryboard } from '../../../js/storyboard-import/build-project.js';

const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'all-components-template.docx');

async function loadAllComponentsValidation() {
  const buffer = readFileSync(templatePath);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const blocks = extractBodyBlocks(await parseDocxDocument(blob));
  const storyboard = extractStoryboard(blocks);
  return { storyboard, validation: validateStoryboard(storyboard) };
}

const record = (blockId, component, fields) => ({ blockId, component, fields });
const f = (field, item, content) => ({ field, item, content });

describe('field mapping v2: all 26 component types are registered', () => {
  test('SUPPORTED_COMPONENT_TYPES has exactly 26 entries, matching the reference template\'s component names', () => {
    expect(FIELD_MAPPING_VERSION).toBe(2);
    expect(Object.keys(SUPPORTED_COMPONENT_TYPES)).toHaveLength(26);
  });
});

describe('field mapping v2: the real all-components template', () => {
  test('every BUILDER block maps to its real component type, with only the 2 genuinely-incomplete blocks left unresolved', async () => {
    const { validation } = await loadAllComponentsValidation();
    const mappedIds = Object.keys(validation.mappedComponentsByBlockId);
    expect(mappedIds).toHaveLength(26);

    const fatal = validation.findings.filter(x => x.severity === 'fatal');
    // S03-B08 (Interactive Video): the template's own item 2 has no "Marker title" — a real
    // content gap, correctly caught rather than silently defaulted.
    // S04-B03 (Interactive Gauge): the template's own example defines zero operating tiers —
    // a real content gap (dial-gauge requires at least 1).
    expect(fatal.map(x => x.code).sort()).toEqual(['required-field-missing', 'too-few-items']);
    expect(fatal.some(x => x.message.includes('S03-B08'))).toBe(true);
    expect(fatal.some(x => x.message.includes('S04-B03'))).toBe(true);
  });

  test('unmapped fields the template itself doesn\'t map (Metric label, Interpretation, Axis label) are flagged, not silently dropped', async () => {
    const { validation } = await loadAllComponentsValidation();
    const unmapped = validation.findings.filter(x => x.code === 'unmapped-field');
    const fieldNames = unmapped.map(x => x.message.match(/field "([^"]+)"/)[1]).sort();
    expect(fieldNames).toEqual(['Axis label', 'Interpretation', 'Metric label']);
  });

  test('Hotspots: background media, per-item position parsing, and its own title/content header', async () => {
    const { validation } = await loadAllComponentsValidation();
    const { type, config } = validation.mappedComponentsByBlockId['S01-B06'];
    expect(type).toBe('hotspots');
    expect(config.title).toBe('Site readiness map');
    expect(isMediaReference(config.backgroundImage)).toBe(true);
    expect(config.backgroundImage.name).toBe('site-map.png');
    expect(config.backgroundAltText).toContain('Site map showing');
    expect(config.items).toEqual([
      { title: 'Entry point', content: 'Verify access and escort requirements.', x: 20, y: 35 },
      { title: 'Work zone', content: 'Confirm barriers and local hazards.', x: 68, y: 55 }
    ]);
  });

  test('Scenario: the shared Prompt becomes item[0], Choice rows follow in order', async () => {
    const { validation } = await loadAllComponentsValidation();
    const { type, config } = validation.mappedComponentsByBlockId['S02-B08'];
    expect(type).toBe('scenario');
    expect(config.items).toHaveLength(3);
    expect(config.items[0]).toEqual({ title: 'Respond to a blocked permit', content: 'A crew arrives and the permit is still pending. What should the lead do?' });
    expect(config.items[1].title).toBe('Pause work and escalate');
    expect(config.items[2].title).toBe('Begin low impact work');
  });

  test('Sorting Activity: "Item category" (not the declared "Category" pool) is each item\'s stored category', async () => {
    const { validation } = await loadAllComponentsValidation();
    const { type, config } = validation.mappedComponentsByBlockId['S02-B03'];
    expect(type).toBe('sorting-activity');
    expect(config.items.map(i => i.category)).toEqual(['Before site visit', 'During site visit']);
  });

  test('Multiple Select: unlike Multiple Choice, more than one item may be marked correct with no fatal finding', async () => {
    const { validation } = await loadAllComponentsValidation();
    const { type, config } = validation.mappedComponentsByBlockId['S02-B01'];
    expect(type).toBe('multiple-select');
    expect(config.items.filter(i => i.correct)).toHaveLength(2);
    const relatedFindings = validation.findings.filter(x => x.message.includes('S02-B01'));
    expect(relatedFindings.filter(x => x.severity === 'fatal')).toEqual([]);
  });

  test('Learning Audio Player and Learning Video Player: the single shared Title is reused as the one item\'s required title', async () => {
    const { validation } = await loadAllComponentsValidation();
    const audio = validation.mappedComponentsByBlockId['S03-B05'];
    expect(audio.type).toBe('audio-player');
    expect(audio.config.items[0].title).toBe('Field briefing audio');
    expect(isMediaReference(audio.config.items[0].content)).toBe(true);
    expect(audio.config.items[0].content.kind).toBe('audio');

    const video = validation.mappedComponentsByBlockId['S03-B06'];
    expect(video.type).toBe('video-frame');
    expect(video.config.items[0].title).toBe('Safety walkthrough');
    expect(isMediaReference(video.config.items[0].posterImage)).toBe(true);
    expect(isMediaReference(video.config.items[0].captionsUrl)).toBe(true);
    expect(video.config.items[0].captionsUrl.kind).toBe('captions');
  });

  test('Interactive Video: component-level video/captions, per-item timestamp parsing and type-conditional fields', async () => {
    const { validation } = await loadAllComponentsValidation();
    const { type, config } = validation.mappedComponentsByBlockId['S03-B08'];
    expect(type).toBe('interactive-video');
    expect(config.title).toBe('Spot the readiness issue');
    expect(isMediaReference(config.videoMediaId)).toBe(true);
    expect(isMediaReference(config.captionsUrl)).toBe(true);
    expect(config.items[0]).toEqual({ type: 'information', timestamp: 30, title: 'Observe access', body: 'Check whether access has been confirmed.' });
    expect(config.items[1].type).toBe('multipleChoice');
    expect(config.items[1].timestamp).toBe(70);
    expect(config.items[1].answer1Label).toBe('Pause and verify the permit');
    expect(config.items[1].correctAnswerIndex).toBe('1');
  });

  test('Comparison Slider and Interactive Gauge use their own title/content header, not the generic block header', async () => {
    const { validation } = await loadAllComponentsValidation();
    const slider = validation.mappedComponentsByBlockId['S04-B02'];
    expect(slider.config.title).toBe('Before and after site setup');
    expect(slider.config.blockHeadline).toBeUndefined();
    expect(isMediaReference(slider.config.items[0].beforeImage)).toBe(true);
    expect(isMediaReference(slider.config.items[0].afterImage)).toBe(true);

    const gauge = validation.mappedComponentsByBlockId['S04-B03'];
    expect(gauge.config.title).toBe('Readiness score');
    expect(gauge.config.minValue).toBe(0);
    expect(gauge.config.maxValue).toBe(100);
    expect(gauge.config.initialValue).toBe(80);
    expect(gauge.config.items).toEqual([]);
  });

  test('Card Carousel and Confidence Matrix also use their own title/content header', async () => {
    const { validation } = await loadAllComponentsValidation();
    const carousel = validation.mappedComponentsByBlockId['S04-B05'];
    expect(carousel.config.title).toBe('Review the evidence');
    expect(carousel.config.items.map(i => i.title)).toEqual(['Approved package', 'Site photographs', 'Handoff record']);

    const matrix = validation.mappedComponentsByBlockId['S04-B06'];
    expect(matrix.config.title).toBe('Choose the next action');
    expect(matrix.config.items).toHaveLength(2);
  });
});

describe('field mapping v2: full pipeline once the template\'s own 2 content gaps are filled in', () => {
  test('buildProjectFromStoryboard succeeds end to end for all 26 real component types', async () => {
    const { storyboard } = await loadAllComponentsValidation();
    // Patch the two genuine content gaps the real template itself has (see the "2 genuinely-
    // incomplete blocks" test above) so this exercises a fully clean, real-world import.
    storyboard.contentRecords['S03-B08'].fields.push({ field: 'Marker title', item: 2, content: 'Confirm next step' });
    storyboard.contentRecords['S04-B03'].fields.push(
      { field: 'Tier title', item: 1, content: 'Ready' },
      { field: 'Tier minimum', item: 1, content: '70' },
      { field: 'Tier maximum', item: 1, content: '100' },
      { field: 'Tier insight', item: 1, content: 'Dispatch is authorized.' }
    );

    const validation = validateStoryboard(storyboard);
    expect(validation.findings.filter(x => x.severity === 'fatal')).toEqual([]);

    const project = buildProjectFromStoryboard(storyboard, validation, { name: 'All Components Course' });
    const builderComponents = Object.values(project.components).filter(c => c.kind === 'builder');
    const riseComponents = Object.values(project.components).filter(c => c.kind === 'rise');
    expect(builderComponents).toHaveLength(26);
    expect(riseComponents.length).toBeGreaterThan(0);
    expect(project.sectionOrder).toHaveLength(4);
    // Every real component type from the registry made it into the built project.
    const types = new Set(builderComponents.map(c => c.type));
    expect(types.size).toBe(26);
  });
});

describe('field mapping v2: synthetic edge cases for the trickier new mappers', () => {
  test('Hotspots: an unparseable "Item position" is left at the default center and flagged, not fatal', () => {
    const rec = record('S01-B06', 'Hotspots', [
      f('Item title', 1, 'A'), f('Item body', 1, 'B'), f('Item position', 1, 'somewhere on the left')
    ]);
    const { config, findings } = mapContentRecordToComponent(rec);
    expect(config.items[0]).toMatchObject({ x: 50, y: 50 });
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'unparseable-position' }));
  });

  test('Interactive Video: an unrecognized "Marker type" is a fatal finding, not a silent default', () => {
    const rec = record('S03-B08', 'Interactive Video', [
      f('Title', null, 'T'), f('Video source', null, '[x.mp4]'),
      f('Marker time', 1, '00:10'), f('Marker type', 1, 'Essay'), f('Marker title', 1, 'M')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'unknown-marker-type' }));
  });

  test('Interactive Video: an unparseable "Marker time" is a fatal finding', () => {
    const rec = record('S03-B08', 'Interactive Video', [
      f('Title', null, 'T'), f('Video source', null, '[x.mp4]'),
      f('Marker time', 1, 'not a time'), f('Marker type', 1, 'Information'), f('Marker title', 1, 'M'), f('Marker body', 1, 'B')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'fatal', code: 'required-field-missing', message: expect.stringContaining('Marker time') }));
  });

  test('Sorting Activity: an item category not in the declared "Category" pool is flagged as a warning', () => {
    const rec = record('S02-B03', 'Sorting Activity', [
      f('Category', 1, 'Phase A'), f('Category', 2, 'Phase B'),
      f('Item title', 1, 'X'), f('Item category', 1, 'Phase C')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'category-not-declared' }));
  });

  test('unmapped-field detection: an unrecognized field name for a known type is flagged once, not once per item', () => {
    const rec = record('S01-B02', 'Accordion', [
      f('Item title', 1, 'A'), f('Item body', 1, 'B'), f('Unexpected Column', 1, 'x'),
      f('Item title', 2, 'C'), f('Item body', 2, 'D'), f('Unexpected Column', 2, 'y')
    ]);
    const { findings } = mapContentRecordToComponent(rec);
    const unmapped = findings.filter(x => x.code === 'unmapped-field');
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].message).toContain('Unexpected Column');
  });

  test('a genuinely unknown component name is still an explicit "unsupported-import-mapping" finding, not a guess', () => {
    const rec = record('S01-B99', 'Some Future Component', [f('Title', null, 'x')]);
    const { type, config, findings } = mapContentRecordToComponent(rec);
    expect(type).toBeNull();
    expect(config).toBeNull();
    expect(findings).toEqual([expect.objectContaining({ severity: 'fatal', code: 'unsupported-import-mapping' })]);
  });
});
