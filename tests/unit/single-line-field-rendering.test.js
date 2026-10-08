// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateIframeContent } from '../../js/preview.js';
import { COMPONENT_REGISTRY, getComponentById, getDefaultConfig } from '../../js/component-registry.js';
import { getEditorSchema } from '../../js/editor-schemas.js';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyThemeToConfig } from '../../js/themes.js';
import { isRichTextEmpty, richInline, richTextToPlain, sanitizeRichText, toRgba } from '../../js/utilities.js';

// UAT (Oct 2026): clearing an optional field showed "<br>" on screen, bold/italic in a name showed "<b>",
// and an ampersand showed "&amp;". A single-line editor stores sanitised HTML, which several components
// then escaped a second time. Also: a cleared rich-text editor left "<br>" behind instead of nothing.

describe('empty rich text is empty', () => {
  test.each(['<br>', '<p><br></p>', '<div><br></div>', ' &nbsp; ', '<p></p>', ''])('%j sanitises to nothing', value => {
    expect(sanitizeRichText(value)).toBe('');
    expect(isRichTextEmpty(value)).toBe(true);
  });

  test('real content and a divider are not empty', () => {
    expect(isRichTextEmpty('<p>Hello</p>')).toBe(false);
    expect(isRichTextEmpty('<hr>')).toBe(false);
    expect(sanitizeRichText('<p>Hello</p>')).toBe('<p>Hello</p>');
  });

  test('richTextToPlain keeps a typed "<b>" as text but drops real tags', () => {
    expect(richTextToPlain('<p>Hi <b>there</b></p>')).toBe('Hi there');
    expect(richTextToPlain('A &amp; B')).toBe('A & B');
    expect(richTextToPlain('&lt;b&gt;literal')).toBe('<b>literal');
  });

  test('richInline: formatting kept, ampersand not double-escaped, blocks flattened, empty uses the plain-text fallback', () => {
    expect(richInline('<b>Bold</b>', 'x')).toBe('<b>Bold</b>');
    expect(richInline('A &amp; B', 'x')).toBe('A &amp; B');
    expect(richInline('<p>One</p><p>Two</p>', 'x')).toBe('One Two');
    expect(richInline('<br>', 'Fallback')).toBe('Fallback');
    expect(richInline('<br>', 'R&D')).toBe('R&amp;D');
    expect(richInline('<script>alert(1)</script>', '')).not.toContain('<script>');
  });
});

const theme = BUILT_IN_THEMES.find(entry => entry.id === DEFAULT_THEME_ID);
const registry = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, version: entry.version }]));

function bodyMarkup(componentId, mutate) {
  const entry = getComponentById(COMPONENT_REGISTRY, componentId);
  const schema = getEditorSchema(componentId);
  const config = applyThemeToConfig({
    blockTitle: 'Block', blockHeadline: 'Headline', blockDesc: 'Description', completionMsg: 'Done',
    colorPrimary: '#2563EB', colorAccent: '#F59E0B', colorBg: '#FFFFFF', colorText: '#1F2937', borderRadius: '12', shadowDepth: 'soft',
    ...getDefaultConfig(entry)
  }, theme);
  const textFields = (schema.fields || []).filter(field => field.type === 'text').map(field => field.id);
  const itemTextFields = (schema.itemFields || []).filter(field => field.type === 'text').map(field => field.id);
  textFields.forEach(id => { config[id] = mutate(id, config[id]); });
  (config.items || []).forEach(item => itemTextFields.forEach(id => { item[id] = mutate(id, item[id]); }));
  const html = generateIframeContent({ selectedComponent: { id: componentId }, activeTheme: theme, componentOverrides: {}, config, currentProjectId: 'p' }, registry, toRgba);
  const dom = new JSDOM(html);
  dom.window.document.querySelectorAll('script, style').forEach(node => node.remove());
  return dom.window.document.body.innerHTML;
}

const componentIds = COMPONENT_REGISTRY.map(entry => entry.id);
// Fields whose value is a URL or an internal key: tags there are not shown to the learner as text.
const KEEP = new Set(['contactUrl', 'content', 'branches']);

describe('single-line text fields never show markup on screen', () => {
  test.each(componentIds)('%s: a cleared field ("<br>") shows no escaped tag', componentId => {
    const markup = bodyMarkup(componentId, (id, value) => (KEEP.has(id) ? value : '<br>'));
    expect(markup).not.toContain('&lt;br');
    expect(markup).not.toContain('&lt;p&gt;');
  });

  test.each(componentIds)('%s: bold in a field is formatting, not the text "<b>"', componentId => {
    const markup = bodyMarkup(componentId, (id, value) => (KEEP.has(id) ? value : '<b>Marked</b>'));
    expect(markup).not.toContain('&lt;b&gt;');
  });

  test.each(componentIds)('%s: an ampersand is not escaped twice', componentId => {
    const markup = bodyMarkup(componentId, (id, value) => (KEEP.has(id) ? value : 'Q &amp; A'));
    expect(markup).not.toContain('&amp;amp;');
  });
});

describe('the completion message', () => {
  test('is plain text, so the editor\'s markup is not printed to the learner', () => {
    const entry = getComponentById(COMPONENT_REGISTRY, 'accordion');
    const config = applyThemeToConfig({ blockTitle: 'B', blockHeadline: 'H', blockDesc: 'D', trackCompletion: true, completionMsg: '<p>Activity <b>Complete!</b></p>', ...getDefaultConfig(entry) }, theme);
    const html = generateIframeContent({ selectedComponent: { id: 'accordion' }, activeTheme: theme, componentOverrides: {}, config, currentProjectId: 'p' }, registry, toRgba);
    expect(html).toContain('"Activity Complete!"');
    expect(html).not.toContain('<p>Activity');
  });
});
