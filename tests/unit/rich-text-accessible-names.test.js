// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { createSchemaItemEditor } from '../../js/editor.js';
import { createRichTextEditor, labelRichTextControl, upgradeTextareaToRichText } from '../../js/rich-text-editor.js';
import { createGlossaryEditor } from '../../js/post-publish/editors/glossary-editor.js';
import { createHelpEditor } from '../../js/post-publish/editors/help-editor.js';
import { createDefaultPostPublishConfig } from '../../js/post-publish/schema.js';

// The rich-text editor is a <div contenteditable role="textbox">. A <label for="…"> only reaches
// labelable form controls, so the visible label above it used to give the editor no accessible
// name at all (a screen reader announced just "edit text"). These tests resolve the name the way
// the accessible-name algorithm does for the attributes involved: aria-labelledby (ignoring
// aria-hidden descendants of the referenced label) first, then aria-label.

function accessibleName(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy.split(/\s+/).map(id => {
      const node = document.getElementById(id);
      if (!node) return '';
      const clone = node.cloneNode(true);
      clone.querySelectorAll('[aria-hidden="true"]').forEach(hidden => hidden.remove());
      return clone.textContent.trim();
    }).join(' ').trim();
  }
  return (element.getAttribute('aria-label') || '').trim();
}

const textboxes = root => [...root.querySelectorAll('[contenteditable="true"][role="textbox"]')];

describe('labelRichTextControl', () => {
  test('names the editor from its visible label and keeps the label id stable', () => {
    document.body.innerHTML = '<label id="given">Main Headline</label><div id="c" role="textbox" contenteditable="true"></div>';
    const control = document.getElementById('c');
    labelRichTextControl(control, document.getElementById('given'));
    expect(control.getAttribute('aria-labelledby')).toBe('given');
    expect(accessibleName(control)).toBe('Main Headline');
  });

  test('gives an id-less label a derived id', () => {
    document.body.innerHTML = '<label>Subtext</label><div id="sub" role="textbox" contenteditable="true"></div>';
    const label = document.querySelector('label');
    labelRichTextControl(document.getElementById('sub'), label);
    expect(label.id).toBe('sub-label');
    expect(accessibleName(document.getElementById('sub'))).toBe('Subtext');
  });

  test('clicking the label focuses the editor, like a native input, and only wires that once', () => {
    document.body.innerHTML = '<label>Headline</label><div id="c" role="textbox" contenteditable="true" tabindex="0"></div>';
    const control = document.getElementById('c');
    const label = document.querySelector('label');
    labelRichTextControl(control, label);
    labelRichTextControl(control, label);
    let focusCalls = 0;
    control.addEventListener('focus', () => { focusCalls += 1; });
    label.click();
    expect(document.activeElement).toBe(control);
    expect(focusCalls).toBe(1);
  });

  test('an explicit aria-label or aria-labelledby on the control is not overridden', () => {
    document.body.innerHTML = '<label id="l">Visible</label><div id="a" role="textbox" aria-label="Explicit"></div><div id="b" role="textbox" aria-labelledby="other"></div>';
    labelRichTextControl(document.getElementById('a'), document.getElementById('l'));
    labelRichTextControl(document.getElementById('b'), document.getElementById('l'));
    expect(document.getElementById('a').hasAttribute('aria-labelledby')).toBe(false);
    expect(document.getElementById('b').getAttribute('aria-labelledby')).toBe('other');
  });

  test('is a safe no-op when either side is missing', () => {
    expect(() => labelRichTextControl(null, document.createElement('label'))).not.toThrow();
    expect(() => labelRichTextControl(document.createElement('div'), null)).not.toThrow();
  });
});

describe('upgradeTextareaToRichText (the static editor fields)', () => {
  test('the upgraded editor is named from the label that pointed at the textarea', () => {
    document.body.innerHTML = '<label for="input-block-headline">Main Headline</label><textarea id="input-block-headline"></textarea>';
    const rte = upgradeTextareaToRichText(document.getElementById('input-block-headline'), { fieldId: 'blockHeadline', isSingleLine: true });
    expect(rte.validationControl.id).toBe('input-block-headline');
    expect(accessibleName(rte.validationControl)).toBe('Main Headline');
  });

  test('a textarea that already has aria-labelledby keeps it', () => {
    document.body.innerHTML = '<span id="x">Custom</span><label for="t">Visible</label><textarea id="t" aria-labelledby="x"></textarea>';
    const rte = upgradeTextareaToRichText(document.getElementById('t'), { fieldId: 't' });
    expect(accessibleName(rte.validationControl)).toBe('Custom');
  });
});

describe('createRichTextEditor without a controlId', () => {
  test('does not stamp id="undefined" or data-field-id="undefined"', () => {
    const rte = createRichTextEditor({ onChange: () => {} });
    expect(rte.validationControl.hasAttribute('id')).toBe(false);
    expect(rte.validationControl.dataset.fieldId).toBeUndefined();
  });

  test('an ariaLabel passed in is the accessible name', () => {
    const rte = createRichTextEditor({ ariaLabel: 'Welcome text', onChange: () => {} });
    expect(accessibleName(rte.validationControl)).toBe('Welcome text');
  });
});

describe('schema-driven item editor', () => {
  test('every richtext and single-line text field in a repeated item has a meaningful name', () => {
    const container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    const fallback = document.createElement('button');
    document.body.appendChild(fallback);
    const schema = {
      itemLabel: 'Tab', minItems: 1,
      itemFields: [
        { id: 'title', label: 'Tab Label', type: 'text', required: true, default: 'T' },
        { id: 'content', label: 'Tab Content', type: 'richtext', required: true, default: 'C' },
        { id: 'note', label: 'Optional note', type: 'richtext', default: '' }
      ]
    };
    const config = { items: [{ title: 'One', content: 'Body', note: '' }, { title: 'Two', content: 'Body 2', note: '' }] };
    const editor = createSchemaItemEditor({ container, onChange: () => {}, focusFallback: fallback });
    editor.render({ schema, items: config.items, config, limits: {} });

    const boxes = textboxes(container);
    expect(boxes.length).toBe(6);
    // A required field's visual asterisk is aria-hidden, so it is not part of the name.
    expect(boxes.map(accessibleName).sort()).toEqual(
      ['Optional note', 'Optional note', 'Tab Content', 'Tab Content', 'Tab Label', 'Tab Label']
    );
    // Each name must resolve to an element in the document (no dangling aria-labelledby), and no
    // two editors may share an id.
    boxes.forEach(box => expect(document.getElementById(box.getAttribute('aria-labelledby'))).not.toBeNull());
    const ids = boxes.map(box => box.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Post-Publish editors', () => {
  test('Help & Support: the introduction and every FAQ answer editor is named, with no duplicate ids', () => {
    const config = createDefaultPostPublishConfig();
    config.help.faqItems = [
      { id: 'f1', question: 'Q1', answer: '<p>A1</p>' },
      { id: 'f2', question: 'Q2', answer: '<p>A2</p>' }
    ];
    const element = createHelpEditor(config, () => {});
    document.body.innerHTML = '';
    document.body.appendChild(element);
    const names = textboxes(element).map(accessibleName);
    expect(names).toContain('Welcome / Introductory Instructions');
    expect(names).toContain('Answer / Resolution Steps for FAQ 1');
    expect(names).toContain('Answer / Resolution Steps for FAQ 2');
    expect(names.every(Boolean)).toBe(true);
    expect(element.querySelector('#undefined')).toBeNull();
  });

  test('Glossary: each definition editor is named by its entry number', () => {
    const config = createDefaultPostPublishConfig();
    const element = createGlossaryEditor(config, () => {});
    document.body.innerHTML = '';
    document.body.appendChild(element);
    const names = textboxes(element).map(accessibleName);
    expect(names.length).toBeGreaterThan(0);
    names.forEach((name, index) => expect(name).toBe(`Definition for glossary entry ${index + 1}`));
  });
});

describe('toolbar ids are unique per editor', () => {
  test('editors created without a controlId (Post-Publish) do not share "rt-color-indicator-undefined"', () => {
    document.body.innerHTML = '';
    for (let i = 0; i < 3; i += 1) document.body.appendChild(createRichTextEditor({ value: '<p>x</p>', ariaLabel: `Field ${i}`, onChange: () => {} }).element);
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(ids.some(id => id.includes('undefined'))).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('an editor that has a controlId keeps the id derived from it', () => {
    document.body.innerHTML = '';
    document.body.appendChild(createRichTextEditor({ controlId: 'field-a', value: '', onChange: () => {} }).element);
    expect(document.getElementById('rt-color-indicator-field-a')).not.toBeNull();
  });
});
