// Turns the generic block list from docx-parser.js into the storyboard-shaped structure the
// spec defines: metadata, sections + their outline rows, and Builder content records. Knows
// nothing about component schemas or project format — that's field-mapping.js and
// build-project.js. This is the one place that understands the template's own conventions,
// including the fragile one: Section ID/title and Block ID/Component are inline free text in
// one Heading2 paragraph (e.g. "Section ID: S01     Section title: Onboarding"), not separate
// structured cells — confirmed by reading the real template's raw XML while designing this
// (docs/STORYBOARD-IMPORT-DESIGN.md). A typo in that label text breaks extraction for that one
// heading; findings from extractStoryboard() surface exactly that rather than silently
// dropping content.

const SECTION_HEADING_RE = /^Section ID:\s*([^\s]+)\s+Section title:\s*(.*)$/i;
const BLOCK_HEADING_RE = /^Block ID:\s*([^\s]+)\s+Component:\s*(.*)$/i;
// A real block/section id looks like S01, S01-B02, SAFETY-101-B01 — word characters and
// hyphens only. The template's own blank placeholder row uses literal brackets
// ("[Sxx-Bxx]", "[Exact name from picker]"), which this pattern deliberately rejects so the
// template's own example never becomes "content" (the spec's own requirement).
const REAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isPlaceholderBracketed(text) {
  return /^\[.*\]$/.test(text.trim());
}

/**
 * @param {import('./docx-parser.js').TableBlock|null} tableBlock the metadata table (first row
 *   is the "Field | Value" header)
 * @param {Array<{severity:'fatal'|'warning', code:string, message:string}>} findings
 */
function extractMetadata(tableBlock, findings) {
  /** @type {Record<string,string>} */
  const metadata = {};
  if (!tableBlock) {
    findings.push({ severity: 'fatal', code: 'missing-metadata-table', message: 'No course metadata table was found (expected the first table in the document).' });
    return metadata;
  }
  const rows = tableBlock.rows.slice(1); // drop "Field | Value" header
  for (const [fieldRaw, valueRaw] of rows) {
    const field = (fieldRaw || '').trim();
    const value = (valueRaw || '').trim();
    if (!field) continue;
    metadata[field] = value;
  }
  return metadata;
}

/**
 * @returns {{
 *   metadata: Record<string,string>,
 *   sections: Array<{ sectionId: string, sectionTitle: string, outlineRows: Array<{blockId:string, kind:string, blockType:string, titleAndNote:string}> }>,
 *   contentRecords: Record<string, { blockId: string, component: string, fields: Array<{field:string, item:number|null, content:string}> }>,
 *   findings: Array<{ severity: 'fatal'|'warning', code: string, message: string }>
 * }}
 */
export function extractStoryboard(blocks) {
  /** @type {Array<{severity:'fatal'|'warning', code:string, message:string}>} */
  const findings = [];

  const firstTableIndex = blocks.findIndex(b => b.kind === 'table');
  const metadata = extractMetadata(firstTableIndex === -1 ? null : blocks[firstTableIndex], findings);

  /** @type {Array<{sectionId:string, sectionTitle:string, outlineRows: any[]}>} */
  const sections = [];
  /** @type {Record<string, {blockId:string, component:string, fields: any[]}>} */
  const contentRecords = {};
  const seenSectionIds = new Set();
  const seenBlockContentRecordIds = new Set();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind !== 'paragraph' || block.style !== 'Heading2') continue;
    const text = block.text.trim();

    const sectionMatch = SECTION_HEADING_RE.exec(text);
    if (sectionMatch) {
      const [, sectionId, sectionTitle] = sectionMatch;
      if (isPlaceholderBracketed(sectionId) || !REAL_ID_RE.test(sectionId)) continue; // template's own blank example row

      const nextBlock = blocks[i + 1];
      if (!nextBlock || nextBlock.kind !== 'table') {
        findings.push({ severity: 'fatal', code: 'missing-outline-table', message: `Section "${sectionId}" has no outline table immediately after its heading.` });
        continue;
      }
      if (seenSectionIds.has(sectionId)) {
        findings.push({ severity: 'fatal', code: 'duplicate-section-id', message: `Section ID "${sectionId}" is used more than once.` });
        continue;
      }
      seenSectionIds.add(sectionId);

      const outlineRows = nextBlock.rows.slice(1) // drop header row
        .filter(row => row.some(cell => cell.trim()))
        .map(([blockId, kind, blockType, titleAndNote]) => ({
          blockId: (blockId || '').trim(),
          kind: (kind || '').trim().toUpperCase(),
          blockType: (blockType || '').trim(),
          titleAndNote: (titleAndNote || '').trim()
        }));
      sections.push({ sectionId, sectionTitle: sectionTitle.trim(), outlineRows });
      continue;
    }

    const blockMatch = BLOCK_HEADING_RE.exec(text);
    if (blockMatch) {
      const [, blockId, component] = blockMatch;
      if (isPlaceholderBracketed(blockId) || !REAL_ID_RE.test(blockId)) continue; // template's own blank example row

      const nextBlock = blocks[i + 1];
      if (!nextBlock || nextBlock.kind !== 'table') {
        findings.push({ severity: 'fatal', code: 'missing-content-record-table', message: `Content record "${blockId}" has no field table immediately after its heading.` });
        continue;
      }
      if (seenBlockContentRecordIds.has(blockId)) {
        findings.push({ severity: 'fatal', code: 'duplicate-content-record', message: `Block ID "${blockId}" has more than one content record.` });
        continue;
      }
      seenBlockContentRecordIds.add(blockId);

      const fields = nextBlock.rows.slice(1) // drop "Field | Item | Approved content" header
        .filter(row => row.some(cell => cell.trim()))
        .map(([fieldRaw, itemRaw, contentRaw]) => {
          const itemText = (itemRaw || '').trim();
          const item = /^\d+$/.test(itemText) ? Number(itemText) : null;
          return { field: (fieldRaw || '').trim(), item, content: (contentRaw || '').trim() };
        });
      contentRecords[blockId] = { blockId, component: component.trim(), fields };
      continue;
    }

    // A Heading2 that matches neither convention — surfaced, not silently skipped, since it
    // could be a real section/block heading with a typo in its label text (the fragility this
    // module's file-level comment describes).
    if (text) {
      findings.push({ severity: 'warning', code: 'unrecognized-heading2', message: `Heading "${text}" does not match "Section ID: ... Section title: ..." or "Block ID: ... Component: ...".` });
    }
  }

  if (sections.length === 0) {
    findings.push({ severity: 'fatal', code: 'no-sections-found', message: 'No sections were found in the document.' });
  }

  return { metadata, sections, contentRecords, findings };
}
