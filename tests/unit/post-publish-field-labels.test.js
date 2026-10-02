// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { associateFieldLabels, keepFieldsLabelled } from '../../js/post-publish/field-labels.js';
import { createGlossaryEditor } from '../../js/post-publish/editors/glossary-editor.js';
import { createHelpEditor } from '../../js/post-publish/editors/help-editor.js';
import { createResourcesEditor } from '../../js/post-publish/editors/resources-editor.js';
import { createSettingsEditor } from '../../js/post-publish/editors/settings-editor.js';
import { createDefaultPostPublishConfig } from '../../js/post-publish/schema.js';

// The Post-Publish editors put `<label>` beside its control without associating them, so a screen
// reader announced the Support Email, Phone, Hours and Department fields (and every glossary,
// resource and style field) by placeholder at best and a select by nothing.

function nameOf(control) {
  const direct = control.getAttribute('aria-label');
  if (direct) return direct;
  const doc = control.ownerDocument;
  const label = control.id ? doc.querySelector(`label[for="${control.id}"]`) : control.closest('label');
  if (!label) return '';
  const clone = label.cloneNode(true);
  clone.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

const plainControls = root => [...root.querySelectorAll('input, select, textarea')].filter(c =>
  !['hidden', 'file', 'search'].includes(c.type) && !c.closest('.rich-text-editor-container'));

describe('associateFieldLabels', () => {
  test('links a label to the control beside it, and the accessible name is the label text', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>Support Email Address</label><input type="email" class="e"></div>';
    associateFieldLabels(document.body);
    const input = document.querySelector('.e');
    expect(nameOf(input)).toBe('Support Email Address');
    expect(document.querySelector('label').htmlFor).toBe(input.id);
  });

  test('works for selects and textareas, and picks the control after the label', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>Launcher Style</label><select class="s"><option>a</option></select></div><div class="input-wrapper"><label>Notes</label><textarea class="t"></textarea></div>';
    associateFieldLabels(document.body);
    expect(nameOf(document.querySelector('.s'))).toBe('Launcher Style');
    expect(nameOf(document.querySelector('.t'))).toBe('Notes');
  });

  test('a required field\'s asterisk is not part of the name, and the control is marked aria-required', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>Term <span class="required">*</span></label><input class="i"></div>';
    associateFieldLabels(document.body);
    const input = document.querySelector('.i');
    expect(nameOf(input)).toBe('Term');
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  test('an optional field is not marked required', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>Acronym</label><input class="i"></div>';
    associateFieldLabels(document.body);
    expect(document.querySelector('.i').hasAttribute('aria-required')).toBe(false);
  });

  test('leaves alone a label that already has `for`, one that wraps its control, and a control that already has a name', () => {
    document.body.innerHTML = `
      <label for="a">Already linked</label><input id="a">
      <label class="wrap">Wrapped <input class="w"></label>
      <div class="input-wrapper"><label>Visible</label><input class="n" aria-label="Explicit name"></div>`;
    associateFieldLabels(document.body);
    expect(document.querySelector('label[for="a"]').htmlFor).toBe('a');
    expect(document.querySelector('.w').id).toBe('');
    expect(nameOf(document.querySelector('.n'))).toBe('Explicit name');
    expect(document.querySelectorAll('label[for]').length).toBe(1);
  });

  test('is idempotent and never creates duplicate ids', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>A</label><input></div><div class="input-wrapper"><label>B</label><input></div>';
    associateFieldLabels(document.body);
    const first = [...document.querySelectorAll('input')].map(i => i.id);
    associateFieldLabels(document.body);
    expect([...document.querySelectorAll('input')].map(i => i.id)).toEqual(first);
    expect(new Set(first).size).toBe(2);
  });

  test('does not claim a rich-text editor\'s internals', () => {
    document.body.innerHTML = '<div class="input-wrapper"><label>Definition</label><div class="rich-text-editor-container"><input class="inner"></div></div>';
    associateFieldLabels(document.body);
    expect(document.querySelector('.inner').id).toBe('');
  });
});

describe('keepFieldsLabelled', () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));

  test('labels fields that are added later (a new FAQ, a redrawn list)', async () => {
    const host = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(host);
    const stop = keepFieldsLabelled(host);
    host.insertAdjacentHTML('beforeend', '<div class="input-wrapper"><label>Question</label><input class="q"></div>');
    await tick();
    expect(nameOf(host.querySelector('.q'))).toBe('Question');
    stop();
    host.insertAdjacentHTML('beforeend', '<div class="input-wrapper"><label>After stop</label><input class="late"></div>');
    await tick();
    expect(nameOf(host.querySelector('.late'))).toBe('');
  });

  test('typing in a rich-text field does not trigger a rescan', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div contenteditable="true" class="rte"><p>x</p></div>';
    document.body.innerHTML = '';
    document.body.appendChild(host);
    keepFieldsLabelled(host);
    // A control that would be labelled by a rescan: added without a mutation the observer should act on.
    host.insertAdjacentHTML('beforeend', '<div class="input-wrapper"><label>Late</label><input class="late"></div>');
    await tick();
    expect(nameOf(host.querySelector('.late'))).toBe('Late'); // structural change: handled
    host.querySelector('.rte').appendChild(document.createElement('span'));
    await tick();
    expect(host.querySelectorAll('input').length).toBe(1);
  });
});

describe('the real Post-Publish editors', () => {
  function render(factory) {
    const config = createDefaultPostPublishConfig();
    config.help.faqItems = [{ id: 'f1', question: 'Q1', answer: '<p>A1</p>' }];
    const element = factory(config, () => {});
    const host = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(host);
    host.appendChild(element);
    associateFieldLabels(host);
    return host;
  }

  test.each([
    ['Glossary', createGlossaryEditor],
    ['Resources', createResourcesEditor],
    ['Help & Support', createHelpEditor],
    ['Style & Position', createSettingsEditor]
  ])('%s: every field has a visible-label name and ids are unique', (_name, factory) => {
    const host = render(factory);
    const controls = plainControls(host);
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) expect(nameOf(control), `${control.className || control.tagName} has no name`).not.toBe('');
    const ids = controls.map(c => c.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('Help & Support: the contact fields are named as the screen shows them', () => {
    const host = render(createHelpEditor);
    const names = plainControls(host).map(nameOf);
    for (const expected of ['Support Email Address', 'Support Phone / Hotline', 'Support Portal URL', 'Support / Office Hours', 'Course Owner / Department']) {
      expect(names).toContain(expected);
    }
  });
});
