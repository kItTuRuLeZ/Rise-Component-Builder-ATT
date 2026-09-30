// Cross-references extractStoryboard()'s output against itself and against
// field-mapping.js's per-content-record mapping, producing the finding categories from the
// spec's "Validation and review" section that only make sense with the *whole* document in view
// (an outline row referencing a content record that doesn't exist, a content record nothing
// references, a type that doesn't match between the two). Per-content-record checks (required
// fields, item numbering, Multiple Choice correct count) already happen in field-mapping.js and
// are merged in here rather than duplicated.

import { mapContentRecordToComponent } from './field-mapping.js';

function finding(severity, code, message) {
  return { severity, code, message };
}

function isBlankOrPlaceholder(text) {
  const trimmed = (text || '').trim();
  return !trimmed || /^\[.*\]$/.test(trimmed);
}

/**
 * @param {{ metadata: Record<string,string>, sections: Array<{sectionId:string, sectionTitle:string, outlineRows: Array<{blockId:string,kind:string,blockType:string,titleAndNote:string}>}>, contentRecords: Record<string, {blockId:string,component:string,fields:any[]}>, findings: Array<{severity:'fatal'|'warning',code:string,message:string}> }} storyboard
 * @returns {{ findings: Array<{severity:'fatal'|'warning',code:string,message:string}>, mappedComponentsByBlockId: Record<string, {type:string, config:any}> }}
 */
export function validateStoryboard(storyboard) {
  const { sections, contentRecords } = storyboard;
  /** @type {Array<{severity:'fatal'|'warning',code:string,message:string}>} */
  const findings = [...storyboard.findings];
  /** @type {Record<string, {type:string, config:any}>} */
  const mappedComponentsByBlockId = {};
  const referencedBlockIds = new Set();

  for (const section of sections) {
    if (isBlankOrPlaceholder(section.sectionTitle)) {
      findings.push(finding('fatal', 'missing-section-title', `Section "${section.sectionId}" has no real section title — the template's placeholder text was left in place.`));
    }

    for (const row of section.outlineRows) {
      if (row.kind !== 'RISE' && row.kind !== 'BUILDER') {
        findings.push(finding('fatal', 'unknown-outline-kind', `Section "${section.sectionId}", block "${row.blockId}": kind "${row.kind}" is neither RISE nor BUILDER.`));
        continue;
      }
      if (row.kind !== 'BUILDER') continue;

      referencedBlockIds.add(row.blockId);
      const record = contentRecords[row.blockId];
      if (!record) {
        findings.push(finding('fatal', 'missing-builder-content-record', `Section "${section.sectionId}", block "${row.blockId}" is marked BUILDER but has no content record.`));
        continue;
      }
      if (record.component.trim().toLowerCase() !== row.blockType.trim().toLowerCase()) {
        findings.push(finding('fatal', 'mismatched-type', `Block "${row.blockId}": outline lists "${row.blockType}" but its content record says "${record.component}".`));
        continue;
      }

      const mapped = mapContentRecordToComponent(record);
      findings.push(...mapped.findings);
      if (mapped.type) {
        mappedComponentsByBlockId[row.blockId] = { type: mapped.type, config: mapped.config };
      }
    }
  }

  for (const blockId of Object.keys(contentRecords)) {
    if (!referencedBlockIds.has(blockId)) {
      findings.push(finding('warning', 'orphan-content-record', `Content record "${blockId}" is not referenced by any section's outline row and will not be imported.`));
    }
  }

  return { findings, mappedComponentsByBlockId };
}
