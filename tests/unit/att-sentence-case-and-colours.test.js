// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateIframeContent } from '../../js/preview.js';
import { COMPONENT_REGISTRY, getComponentById, getDefaultConfig } from '../../js/component-registry.js';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyThemeToConfig } from '../../js/themes.js';
import { toRgba } from '../../js/utilities.js';

// UAT (Oct 2026) AT&T brand decisions: sentence case for labels, headings and buttons (AT&T edition only),
// Cobalt kept for primary buttons, AT&T Blue (not cyan) for the marker label, and no gradient running into Cobalt.

const root = process.cwd();
const sources = [
  ...readdirSync(join(root, 'components')).filter(file => file.endsWith('.js')).map(file => `components/${file}`),
  'js/export-shell.js'
].map(file => [file, readFileSync(join(root, file), 'utf8')]);

describe('AT&T sentence case and colours', () => {
  test.each(sources)('%s does not force upper case on any label', (_file, text) => {
    expect(text).not.toMatch(/text-transform:\s*uppercase/);
  });

  test.each(sources)('%s has no gradient that runs into Cobalt', (_file, text) => {
    const gradients = text.match(/linear-gradient\([^;]*\)/g) || [];
    for (const gradient of gradients) expect(gradient).not.toMatch(/--primary|#00388F/i);
  });

  test('the hotspot marker label uses AT&T Blue, not cyan', () => {
    const hotspots = sources.find(([file]) => file.endsWith('hotspots.js'))[1];
    expect(hotspots).not.toMatch(/#00C9FF/i);
  });

  test('learner-facing button and heading text is sentence case', () => {
    const joined = sources.map(([, text]) => text).join('\n');
    for (const title of ['Check Answers', 'Reset Activity', 'Verify Sorting', 'Progress Completion', 'Try Again', 'Submit Answer', 'Show Transcript', 'Expand All', 'Restart Scenario']) {
      expect(joined, title).not.toContain(`>${title}<`);
      expect(joined, title).not.toContain(`'${title}'`);
    }
  });
});

describe('Scenario emotion badge', () => {
  const theme = BUILT_IN_THEMES.find(entry => entry.id === DEFAULT_THEME_ID);
  const registry = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, version: entry.version }]));

  test('starts with a capital letter now that the style sheet no longer upper-cases it', () => {
    const entry = getComponentById(COMPONENT_REGISTRY, 'scenario');
    const config = applyThemeToConfig({ blockTitle: 'B', blockHeadline: 'H', blockDesc: 'D', ...getDefaultConfig(entry) }, theme);
    config.items[0].emotion = 'thinking';
    const html = generateIframeContent({ selectedComponent: { id: 'scenario' }, activeTheme: theme, componentOverrides: {}, config, currentProjectId: 'p' }, registry, toRgba);
    const badge = new JSDOM(html).window.document.querySelector('.scenario-emotion-badge');
    expect(badge.textContent).toBe('Thinking');
  });
});

import { toSentenceCase } from '../../js/utilities.js';

describe('toSentenceCase (the default block label)', () => {
  test.each([
    ['Horizontal Tabs', 'Horizontal tabs'],
    ['Quick Link Buttons', 'Quick link buttons'],
    ['AT&T Interactive Block', 'AT&T interactive block'],
    ['multiple choice', 'Multiple choice'],
    ['Callout & Alert Matrix', 'Callout & alert matrix'],
    ['', '']
  ])('%j becomes %j', (input, expected) => {
    expect(toSentenceCase(input)).toBe(expected);
  });
});
