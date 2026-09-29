// Assembles extractStoryboard()'s sections/outline rows plus validateStoryboard()'s mapped
// BUILDER component configs into a real buildProjectSchemaV3() project. Refuses to build while
// any fatal validation finding remains — this is the "confirm" step of the spec's
// parse -> validate -> review -> confirm workflow, and it must never produce a project that
// silently drops or invents content because a fatal issue was ignored.
//
// RISE rows become components in the same components map / componentOrder as BUILDER rows
// (kind: 'rise', js/project-schema.js, docs/STORYBOARD-IMPORT-DESIGN.md) — not a parallel
// structure — carrying no schema-driven config, just the block id and build note so the outline
// can render and explain what belongs there.

import { createSectionId, createComponentInstanceId, buildProjectSchemaV3 } from '../project-schema.js';

// "Welcome — paste the approved introduction in Rise." -> { title: 'Welcome', note: '...' }
function splitTitleAndNote(text) {
  const raw = (text || '').trim();
  const idx = raw.indexOf('—');
  if (idx === -1) return { title: raw, note: '' };
  return { title: raw.slice(0, idx).trim(), note: raw.slice(idx + 1).trim() };
}

/**
 * @param {{ sections: Array<{sectionId:string, sectionTitle:string, outlineRows: Array<{blockId:string,kind:string,blockType:string,titleAndNote:string}>}>, metadata: Record<string,string> }} storyboard extractStoryboard()'s output
 * @param {{ findings: Array<{severity:'fatal'|'warning',code:string,message:string}>, mappedComponentsByBlockId: Record<string,{type:string,config:any}> }} validation validateStoryboard()'s output for the same storyboard
 * @param {{ name?: string, clientLabel?: string }} [options]
 */
export function buildProjectFromStoryboard(storyboard, validation, options = {}) {
  const fatalCount = validation.findings.filter(f => f.severity === 'fatal').length;
  if (fatalCount > 0) {
    throw new Error(`Cannot build a project while ${fatalCount} unresolved validation issue(s) remain.`);
  }

  /** @type {Record<string, any>} */
  const sections = {};
  const sectionOrder = [];
  /** @type {Record<string, any>} */
  const components = {};

  for (const section of storyboard.sections) {
    const componentOrder = [];
    for (const row of section.outlineRows) {
      const { title, note } = splitTitleAndNote(row.titleAndNote);
      const compId = createComponentInstanceId();

      if (row.kind === 'RISE') {
        components[compId] = { name: title || row.blockId, type: row.blockType, kind: 'rise', config: { blockId: row.blockId, notes: note } };
        componentOrder.push(compId);
        continue;
      }

      // kind === 'BUILDER' — validateStoryboard() already refused to leave a BUILDER row
      // unmapped without a fatal finding, so a missing entry here would mean a fatal slipped
      // through; skip defensively rather than inventing a component.
      const mapped = validation.mappedComponentsByBlockId[row.blockId];
      if (!mapped) continue;
      components[compId] = { name: title || row.blockId, type: mapped.type, kind: 'builder', config: mapped.config };
      componentOrder.push(compId);
    }

    const sectionId = createSectionId();
    sections[sectionId] = { name: section.sectionTitle, componentOrder };
    sectionOrder.push(sectionId);
  }

  const courseTitle = (storyboard.metadata['Course title'] || '').trim();
  return buildProjectSchemaV3({
    name: options.name || (courseTitle && !/^\[.*\]$/.test(courseTitle) ? courseTitle : 'Imported Storyboard'),
    clientLabel: options.clientLabel || 'AT&T',
    sectionOrder,
    sections,
    components
  });
}
