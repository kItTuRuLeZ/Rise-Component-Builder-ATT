// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractBodyBlocks, parseDocxDocument, parseDocxToBlocks } from '../../../js/storyboard-import/docx-parser.js';

// Real fixture, not a hand-built stand-in: a byte-for-byte copy of the actual template the
// storyboard importer's contract is defined against (docs/STORYBOARD-IMPORT-DESIGN.md).
const templatePath = join(process.cwd(), 'tests', 'fixtures', 'storyboard', 'valid-template.docx');

function loadTemplateBlob() {
  const buffer = readFileSync(templatePath);
  // Node's Buffer isn't a Blob; wrap it the same way a real <input type="file"> File object
  // would present itself (.arrayBuffer()) so parseDocxDocument's own Blob-shaped input is
  // exercised unchanged, not a Node-only code path.
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

describe('docx-parser: parseDocxDocument', () => {
  test('unzips the real template and parses word/document.xml without error', async () => {
    const doc = await parseDocxDocument(loadTemplateBlob());
    expect(doc).toBeTruthy();
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
  });

  test('rejects a file that is not a ZIP archive at all', async () => {
    const notAZip = new Blob(['this is just plain text, not a docx'], { type: 'text/plain' });
    await expect(parseDocxDocument(notAZip)).rejects.toThrow(/not.*valid ZIP archive|could not be read/i);
  });

  test('rejects a ZIP archive with no word/document.xml (e.g. a plain .zip, not a .docx)', async () => {
    const { createZip } = await import('../../../js/zip.js');
    const notADocx = await createZip([{ path: 'readme.txt', data: 'hello' }]);
    await expect(parseDocxDocument(notADocx)).rejects.toThrow(/does not look like a Word/i);
  });

  test('rejects with no file selected', async () => {
    await expect(parseDocxDocument(null)).rejects.toThrow(/no file was selected/i);
  });
});

describe('docx-parser: extractBodyBlocks', () => {
  test('walks the real template into an ordered list of paragraph and table blocks', async () => {
    const doc = await parseDocxDocument(loadTemplateBlob());
    const blocks = extractBodyBlocks(doc);

    expect(blocks.length).toBeGreaterThan(10);
    expect(blocks.every(b => b.kind === 'paragraph' || b.kind === 'table')).toBe(true);

    // The template's own title paragraph, verbatim.
    const title = blocks.find(b => b.kind === 'paragraph' && b.style === 'Title');
    expect(title?.text).toBe('Rise Storyboard Import Template');

    // Both heading levels the template actually uses (course-level "Course details" /
    // "Section and block outline" as Heading1; "Section ID: S01 ..." as Heading2).
    const heading1s = blocks.filter(b => b.kind === 'paragraph' && b.style === 'Heading1').map(b => b.text);
    expect(heading1s).toContain('Course details');
    expect(heading1s).toContain('Section and block outline');
    const heading2s = blocks.filter(b => b.kind === 'paragraph' && b.style === 'Heading2').map(b => b.text);
    expect(heading2s.some(t => t.includes('Section ID: S01'))).toBe(true);

    // 7 tables: metadata + outline + 4 content records + the "copy for each additional block"
    // template table — matches what was counted directly from the raw XML while designing this
    // (docs/STORYBOARD-IMPORT-DESIGN.md).
    const tables = blocks.filter(b => b.kind === 'table');
    expect(tables.length).toBe(7);
  });

  test('reads real table cell text correctly, including the metadata table', async () => {
    const doc = await parseDocxDocument(loadTemplateBlob());
    const blocks = extractBodyBlocks(doc);
    const metadataTable = blocks.find(b => b.kind === 'table').rows;

    expect(metadataTable[0]).toEqual(['Field', 'Value']);
    const rowsByLabel = Object.fromEntries(metadataTable.slice(1).map(r => [r[0], r[1]]));
    expect(rowsByLabel['Storyboard version']).toBe('1');
    expect(rowsByLabel['Client edition']).toBe('AT&T / PMI — choose one');
    expect(rowsByLabel['Course ID']).toBe('[Stable short identifier, e.g., SAFETY-101]');
  });

  test('reads the first outline table (RISE and BUILDER rows) with Kind/Block type columns intact', async () => {
    const doc = await parseDocxDocument(loadTemplateBlob());
    const blocks = extractBodyBlocks(doc);
    const tables = blocks.filter(b => b.kind === 'table');
    const outlineTable = tables[1].rows; // metadata table is [0], outline is [1]

    expect(outlineTable[0]).toEqual(['Block ID', 'Kind', 'Block type', 'Title and build note']);
    const accordionRow = outlineTable.find(r => r[0] === 'S01-B02');
    expect(accordionRow).toEqual(['S01-B02', 'BUILDER', 'Accordion', 'Key principles — import the content record S01-B02.']);
    const riseRow = outlineTable.find(r => r[0] === 'S01-B01');
    expect(riseRow[1]).toBe('RISE');
  });

  test('parseDocxToBlocks is the equivalent one-call convenience wrapper', async () => {
    const direct = extractBodyBlocks(await parseDocxDocument(loadTemplateBlob()));
    const viaWrapper = await parseDocxToBlocks(loadTemplateBlob());
    expect(viaWrapper).toEqual(direct);
  });

  test('throws a clear error for a document with no body (malformed XML structure)', () => {
    const doc = new DOMParser().parseFromString('<root/>', 'application/xml');
    expect(() => extractBodyBlocks(doc)).toThrow(/no readable body content/i);
  });
});
