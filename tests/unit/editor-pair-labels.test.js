// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { addEditorItem, createSchemaItemEditor } from '../../js/editor.js';

// A schema with `pairLabels` (flip-cards' Front/Back) pairs items up positionally: index 0+1
// make card 1, 2+3 make card 2, and so on (components/flip-cards.js#generateHTML). Add, move,
// duplicate and delete must all act on the whole pair a face belongs to — a lone Front with no
// Back renders against a placeholder back in the preview, which is never what an author wants.
function pairSchema() {
  return {
    itemLabel: 'Card Face',
    minItems: 2,
    pairLabels: ['Front', 'Back'],
    itemFields: [{ id: 'title', label: 'Title', type: 'text', default: 'New Face' }]
  };
}

function setup(items) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const fallback = document.createElement('button');
  fallback.id = 'fallback';
  document.body.appendChild(fallback);
  let changeCount = 0;
  const editor = createSchemaItemEditor({ container, onChange: () => { changeCount += 1; }, focusFallback: fallback });
  const config = { items };
  editor.render({ schema: pairSchema(), items: config.items, config, limits: {} });
  const rerender = () => editor.render({ schema: pairSchema(), items: config.items, config, limits: {} });
  return { container, config, rerender, changes: () => changeCount };
}

function clickAction(container, index, label) {
  const card = container.querySelectorAll('.dynamic-item-card')[index];
  card.querySelector(`[aria-label="${label}"], [title="${label}"]`).click();
}

describe('addEditorItem on a pairLabels schema', () => {
  test('adds a whole pair (both faces), not one lone face', () => {
    const state = { config: { items: [] } };
    addEditorItem(state, pairSchema());
    expect(state.config.items.length).toBe(2);
  });

  test('a plain schema (no pairLabels) still adds exactly one item', () => {
    const state = { config: { items: [] } };
    addEditorItem(state, { itemLabel: 'Item', itemFields: [{ id: 'title', default: '' }] });
    expect(state.config.items.length).toBe(1);
  });
});

describe('editing a pairLabels schema in the item editor', () => {
  test('Delete on either face removes the whole pair', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }, { title: 'F2' }, { title: 'B2' }];
    const { container, config, changes } = setup(items);
    clickAction(container, 2, 'Delete card'); // the "Back" face of the second pair
    expect(config.items.map(i => i.title)).toEqual(['F1', 'B1']);
    expect(changes()).toBe(1);
  });

  test('Duplicate on either face duplicates the whole pair, right after it', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }];
    const { container, config } = setup(items);
    clickAction(container, 1, 'Duplicate card'); // the "Back" face
    expect(config.items.map(i => i.title)).toEqual(['F1', 'B1', 'F1', 'B1']);
  });

  test('Move down moves the whole pair below the next pair, keeping Front/Back order', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }, { title: 'F2' }, { title: 'B2' }];
    const { container, config } = setup(items);
    clickAction(container, 0, 'Move card down');
    expect(config.items.map(i => i.title)).toEqual(['F2', 'B2', 'F1', 'B1']);
  });

  test('Move up moves the whole pair above the previous pair', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }, { title: 'F2' }, { title: 'B2' }];
    const { container, config } = setup(items);
    clickAction(container, 3, 'Move card up'); // the "Back" face of the second pair
    expect(config.items.map(i => i.title)).toEqual(['F2', 'B2', 'F1', 'B1']);
  });

  test('Move up is disabled on the first pair, Move down disabled on the last pair', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }, { title: 'F2' }, { title: 'B2' }];
    const { container } = setup(items);
    const cards = container.querySelectorAll('.dynamic-item-card');
    expect(cards[0].querySelector('[title="Move card up"]').disabled).toBe(true);
    expect(cards[1].querySelector('[title="Move card up"]').disabled).toBe(true);
    expect(cards[2].querySelector('[title="Move card down"]').disabled).toBe(true);
    expect(cards[3].querySelector('[title="Move card down"]').disabled).toBe(true);
  });

  test('Alt+Delete on a face keyboard-shortcuts the whole pair away', () => {
    const items = [{ title: 'F1' }, { title: 'B1' }, { title: 'F2' }, { title: 'B2' }];
    const { container, config } = setup(items);
    const card = container.querySelectorAll('.dynamic-item-card')[0];
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', altKey: true, bubbles: true }));
    expect(config.items.map(i => i.title)).toEqual(['F2', 'B2']);
  });

  test('a plain schema (no pairLabels) still moves/deletes/duplicates one item at a time', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fallback = document.createElement('button');
    document.body.appendChild(fallback);
    const editor = createSchemaItemEditor({ container, onChange: () => {}, focusFallback: fallback });
    const config = { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] };
    const schema = { itemLabel: 'Item', minItems: 0, itemFields: [{ id: 'title', default: '' }] };
    editor.render({ schema, items: config.items, config, limits: {} });
    clickAction(container, 1, 'Delete item');
    expect(config.items.map(i => i.title)).toEqual(['A', 'C']);
  });
});
