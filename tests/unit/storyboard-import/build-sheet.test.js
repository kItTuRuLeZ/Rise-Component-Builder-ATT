// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { buildRiseSheetText, showRiseBuildSheetDialog } from '../../../js/storyboard-import/build-sheet.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../../js/project-schema.js';

function project(overrides = {}) {
  return buildProjectSchemaV3({ id: 'p1', name: 'Warehouse Safety Basics', ...overrides });
}

describe('buildRiseSheetText', () => {
  test('a project with no RISE components says so explicitly, not an empty list', () => {
    const p = project({
      sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Getting Started', componentOrder: ['c1'] }) },
      components: { c1: createComponentInstance({ id: 'c1', name: 'Key Principles', type: 'accordion', kind: 'builder' }) }
    });
    const text = buildRiseSheetText(p);
    expect(text).toContain('No Rise-authored blocks in this course.');
    expect(text).toContain('0 Rise blocks.');
  });

  test('lists RISE rows grouped by section, in outline order, with block id, name, type, and note', () => {
    const p = project({
      sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Getting Started', componentOrder: ['c1', 'c2', 'c3'] }) },
      components: {
        c1: createComponentInstance({ id: 'c1', name: 'Welcome', type: 'Text', kind: 'rise', config: { blockId: 'S01-B01', notes: 'paste the approved introduction in Rise.' } }),
        c2: createComponentInstance({ id: 'c2', name: 'Key Principles', type: 'accordion', kind: 'builder' }),
        c3: createComponentInstance({ id: 'c3', name: 'Process diagram', type: 'Image', kind: 'rise', config: { blockId: 'S01-B03', notes: 'add approved image and alt text in Rise.' } })
      }
    });
    const text = buildRiseSheetText(p);

    expect(text).toContain('## Getting Started');
    expect(text).toContain('S01-B01 — Welcome (Text)');
    expect(text).toContain('paste the approved introduction in Rise.');
    expect(text).toContain('S01-B03 — Process diagram (Image)');
    expect(text).toContain('add approved image and alt text in Rise.');
    // The BUILDER row never appears in the Rise build sheet.
    expect(text).not.toContain('Key Principles');
    expect(text).toContain('2 Rise blocks.');

    const b01Index = text.indexOf('S01-B01');
    const b03Index = text.indexOf('S01-B03');
    expect(b01Index).toBeGreaterThan(-1);
    expect(b03Index).toBeGreaterThan(b01Index);
  });

  test('a section with zero RISE rows is omitted entirely, not listed with an empty body', () => {
    const p = project({
      sectionOrder: ['s1', 's2'],
      sections: {
        s1: createSection({ id: 's1', name: 'Builder-only Section', componentOrder: ['c1'] }),
        s2: createSection({ id: 's2', name: 'Mixed Section', componentOrder: ['c2'] })
      },
      components: {
        c1: createComponentInstance({ id: 'c1', name: 'Accordion', type: 'accordion', kind: 'builder' }),
        c2: createComponentInstance({ id: 'c2', name: 'Welcome', type: 'Text', kind: 'rise', config: { blockId: 'S02-B01' } })
      }
    });
    const text = buildRiseSheetText(p);
    expect(text).not.toContain('Builder-only Section');
    expect(text).toContain('Mixed Section');
  });

  test('a RISE row with no config.blockId falls back to its component id', () => {
    const p = project({
      sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'S', componentOrder: ['c9'] }) },
      components: { c9: createComponentInstance({ id: 'c9', name: 'Welcome', type: 'Text', kind: 'rise', config: {} }) }
    });
    expect(buildRiseSheetText(p)).toContain('c9 — Welcome (Text)');
  });
});

describe('showRiseBuildSheetDialog', () => {
  test('renders the build sheet text into the modal textarea and wires Copy/Download', () => {
    document.body.innerHTML = '<div id="modal-root"></div>';
    const p = project({
      sectionOrder: ['s1'],
      sections: { s1: createSection({ id: 's1', name: 'Getting Started', componentOrder: ['c1'] }) },
      components: { c1: createComponentInstance({ id: 'c1', name: 'Welcome', type: 'Text', kind: 'rise', config: { blockId: 'S01-B01', notes: 'note here' } }) }
    });

    showRiseBuildSheetDialog({ project: p, triggerElement: document.body });

    const textarea = document.getElementById('att-rise-sheet-text');
    expect(textarea).toBeTruthy();
    expect(textarea.value).toContain('S01-B01 — Welcome (Text)');
    expect(document.getElementById('att-rise-sheet-copy-btn')).toBeTruthy();
    expect(document.getElementById('att-rise-sheet-download-btn')).toBeTruthy();

    document.getElementById('att-modal-close-btn').click();
    expect(document.getElementById('att-dynamic-modal-overlay')).toBeNull();
  });
});
