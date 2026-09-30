// Generic .docx → flat block-list reader. Knows nothing about "storyboards" — that's
// js/storyboard-import/storyboard-extract.js's job. This file only knows how to get from a
// Blob/File to an ordered list of { kind: 'paragraph' | 'table', ... } blocks, the same shape
// regardless of what the document is used for.
//
// No new runtime dependency: a .docx is a ZIP archive (js/zip.js#readZip, already used
// elsewhere in this project against untrusted uploads) containing WordprocessingML XML
// (parsed with the browser's/jsdom's native DOMParser). See docs/STORYBOARD-IMPORT-DESIGN.md
// for why this was chosen over adding a docx-parsing library.

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function localName(el) {
  return el.localName || (el.tagName ? el.tagName.split(':').pop() : '');
}

function paragraphText(pElement) {
  let out = '';
  for (const t of pElement.getElementsByTagNameNS(WORD_NS, 't')) out += t.textContent;
  return out;
}

function paragraphStyle(pElement) {
  const pPr = pElement.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  if (!pPr) return null;
  const pStyle = pPr.getElementsByTagNameNS(WORD_NS, 'pStyle')[0];
  if (!pStyle) return null;
  // Word writes the style id as the (unprefixed-in-DOM) `val` attribute in the `w:` namespace —
  // getAttributeNS is the namespace-correct read; getAttribute('w:val') is a fallback for
  // parsers that surface it as a literal qualified attribute name instead.
  return pStyle.getAttributeNS(WORD_NS, 'val') || pStyle.getAttribute('w:val');
}

/** Direct-child `w:tr`/`w:tc` only (never rows from a table nested inside a cell) — this
    template has no nested tables, but being explicit avoids silently flattening one if a future
    template ever does. Each cell's text is every paragraph inside it, newline-joined. */
function tableRows(tblElement) {
  const rows = [];
  for (const tr of tblElement.children) {
    if (localName(tr) !== 'tr') continue;
    const cells = [];
    for (const tc of tr.children) {
      if (localName(tc) !== 'tc') continue;
      const cellParagraphs = [];
      for (const p of tc.getElementsByTagNameNS(WORD_NS, 'p')) cellParagraphs.push(paragraphText(p));
      cells.push(cellParagraphs.join('\n').trim());
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Unzips a .docx Blob/File and returns word/document.xml as a parsed XML Document.
 * @param {Blob} blob
 * @returns {Promise<Document>}
 */
export async function parseDocxDocument(blob) {
  if (!blob) throw new Error('No file was selected.');

  const { readZip } = await import('../zip.js');
  let entries;
  try {
    entries = await readZip(blob);
  } catch (error) {
    throw new Error(`This file could not be read as a .docx — it does not look like a valid ZIP archive. (${error.message})`);
  }

  const docEntry = entries.find(e => !e.isDirectory && e.path.toLowerCase() === 'word/document.xml');
  if (!docEntry) {
    throw new Error('This file does not look like a Word .docx document (missing word/document.xml).');
  }

  let xmlText;
  try {
    xmlText = new TextDecoder('utf-8', { fatal: true }).decode(docEntry.data);
  } catch {
    throw new Error('This document\'s content is not valid UTF-8 text and could not be read.');
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This document\'s content could not be parsed as XML — it may be corrupted.');
  }
  return doc;
}

/**
 * Walks a parsed word/document.xml Document into a flat, ordered list of blocks. This is the
 * full extent of what this module knows — no storyboard-specific interpretation happens here.
 * @param {Document} doc
 * @typedef {{kind:'paragraph', style:string|null, text:string}} ParagraphBlock
 * @typedef {{kind:'table', rows:string[][]}} TableBlock
 * @returns {Array<ParagraphBlock|TableBlock>}
 */
export function extractBodyBlocks(doc) {
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('This document has no readable body content.');

  /** @type {Array<ParagraphBlock|TableBlock>} */
  const blocks = [];
  for (const child of body.children) {
    const name = localName(child);
    if (name === 'p') {
      /** @type {ParagraphBlock} */
      const block = { kind: 'paragraph', style: paragraphStyle(child), text: paragraphText(child) };
      blocks.push(block);
    } else if (name === 'tbl') {
      /** @type {TableBlock} */
      const block = { kind: 'table', rows: tableRows(child) };
      blocks.push(block);
    }
    // Anything else at the body level (w:sectPr — page layout) carries no storyboard content.
  }
  return blocks;
}

/** Convenience wrapper: Blob → flat block list in one call. */
export async function parseDocxToBlocks(blob) {
  const doc = await parseDocxDocument(blob);
  return extractBodyBlocks(doc);
}
