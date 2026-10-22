import { describe, expect, test } from 'vitest';
import { generateIframeContent } from '../../js/preview.js';
import { COMPONENT_REGISTRY, getComponentById, getDefaultConfig } from '../../js/component-registry.js';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, applyThemeToConfig } from '../../js/themes.js';
import { toRgba, generateHtmlFragment } from '../../js/utilities.js';
import { validateProject, migrateProject } from '../../js/storage.js';

const theme = BUILT_IN_THEMES.find(entry => entry.id === DEFAULT_THEME_ID);
const componentRegistry = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, version: entry.version }]));

function compileComponent(componentId, configOverrides = {}, currentProjectId = 'test-proj') {
  const entry = getComponentById(COMPONENT_REGISTRY, componentId);
  const baseConfig = {
    blockTitle: 'TEST BLOCK',
    blockHeadline: 'Test Headline',
    blockDesc: 'Test description text.',
    headerStyle: 'minimal',
    headerCyanRule: false,
    spacingDensity: 'standard',
    contextBandEnabled: false,
    contextBandText: '',
    contextBandAlignment: 'left',
    colorPrimary: '#00388F',
    colorAccent: '#009FDB',
    colorBg: '#FFFFFF',
    colorText: '#000000',
    borderRadius: '12',
    shadowDepth: 'none',
    borderOutline: true,
    accordionMulti: true,
    accordionAnimation: true,
    iconStyle: 'chevron',
    trackCompletion: false,
    completionMsg: 'Done!'
  };
  const config = applyThemeToConfig({ ...baseConfig, ...getDefaultConfig(entry), ...configOverrides }, theme);
  const appState = {
    selectedComponent: { id: componentId },
    activeTheme: theme,
    componentOverrides: {},
    config,
    currentProjectId
  };
  return generateIframeContent(appState, componentRegistry, toRgba);
}

describe('Density presets', () => {
  test('compact density applies density-compact class and 0.82 spacing-scale', () => {
    const html = compileComponent('accordion', { spacingDensity: 'compact' });
    expect(html).toContain('class="rise-block-wrapper density-compact"');
    expect(html).toContain('--spacing-scale: 0.82');
  });

  test('standard density applies clean wrapper and 1 spacing-scale', () => {
    const html = compileComponent('accordion', { spacingDensity: 'standard' });
    expect(html).toContain('class="rise-block-wrapper"');
    expect(html).toContain('--spacing-scale: 1');
  });

  test('spacious density applies density-spacious class and 1.18 spacing-scale', () => {
    const html = compileComponent('accordion', { spacingDensity: 'spacious' });
    expect(html).toContain('class="rise-block-wrapper density-spacious"');
    expect(html).toContain('--spacing-scale: 1.18');
  });

  test('legacy "comfortable" density or missing density safely falls back to standard (1)', () => {
    const htmlWithComfortable = compileComponent('accordion', { spacingDensity: 'comfortable' });
    expect(htmlWithComfortable).toContain('class="rise-block-wrapper"');
    expect(htmlWithComfortable).toContain('--spacing-scale: 1');

    const htmlWithout = compileComponent('accordion', { spacingDensity: undefined });
    expect(htmlWithout).toContain('class="rise-block-wrapper"');
    expect(htmlWithout).toContain('--spacing-scale: 1');
  });
});

describe('Header presentation styles', () => {
  test('minimal header renders header-minimal class without cyan rule', () => {
    const html = compileComponent('accordion', { headerStyle: 'minimal', headerCyanRule: true });
    expect(html).toContain('class="block-header header-minimal"');
    expect(html).not.toContain('<div class="header-cyan-rule"');
    expect(html).toContain('class="block-label">TEST BLOCK</div>');
    expect(html).toContain('class="block-headline" id="rcb-test-proj-block-headline">Test Headline</h2>');
    expect(html).toContain('class="block-desc">Test description text.</div>');
  });

  test('editorial header without cyan rule renders header-editorial class', () => {
    const html = compileComponent('accordion', { headerStyle: 'editorial', headerCyanRule: false });
    expect(html).toContain('class="block-header header-editorial"');
    expect(html).not.toContain('<div class="header-cyan-rule"');
    expect(html).toContain('class="block-label">TEST BLOCK</div>');
    expect(html).toContain('class="block-headline" id="rcb-test-proj-block-headline">Test Headline</h2>');
  });

  test('editorial header with cyan rule renders short cyan rule element', () => {
    const html = compileComponent('accordion', { headerStyle: 'editorial', headerCyanRule: true });
    expect(html).toContain('class="block-header header-editorial"');
    expect(html).toContain('<div class="header-cyan-rule" aria-hidden="true"></div>');
  });

  test('the headline is always an h2, in both header styles', () => {
    const html = compileComponent('accordion', { headerStyle: 'editorial' });
    expect(html).toContain('<h2 class="block-headline" id="rcb-test-proj-block-headline">Test Headline</h2>');
  });
});

describe('Optional Context Band', () => {
  test('context band is omitted when disabled or empty', () => {
    const disabledHtml = compileComponent('accordion', { contextBandEnabled: false, contextBandText: 'Intro text' });
    expect(disabledHtml).not.toContain('<aside class="block-context-band');

    const emptyHtml = compileComponent('accordion', { contextBandEnabled: true, contextBandText: '   ' });
    expect(emptyHtml).not.toContain('<aside class="block-context-band');
  });

  test('context band renders with left alignment by default', () => {
    const html = compileComponent('accordion', {
      contextBandEnabled: true,
      contextBandText: 'This module introduces essential core concepts.',
      contextBandAlignment: 'left'
    });
    expect(html).toContain('<aside class="block-context-band align-left" role="note" aria-label="Context">');
    expect(html).toContain('<p class="context-band-text">This module introduces essential core concepts.</p>');
  });

  test('context band renders with center alignment when configured', () => {
    const html = compileComponent('accordion', {
      contextBandEnabled: true,
      contextBandText: 'Centered introductory guidance.',
      contextBandAlignment: 'center'
    });
    expect(html).toContain('<aside class="block-context-band align-center" role="note" aria-label="Context">');
    expect(html).toContain('<p class="context-band-text">Centered introductory guidance.</p>');
  });
});

describe('Responsive Accordion reference integration', () => {
  test('accordion CSS defines AT&T cyan active indicators, 44px min touch targets, and focus-visible', () => {
    const html = compileComponent('accordion');
    expect(html).toContain('.accordion-item.active {');
    expect(html).toContain('border-left: 4px solid var(--att-blue');
    expect(html).toContain('min-height: 44px');
    expect(html).toContain('.accordion-trigger:focus-visible');
    expect(html).toContain('outline: 3px solid var(--att-cobalt');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('accordion CSS includes density modifiers for compact, standard, and spacious modes', () => {
    const html = compileComponent('accordion');
    expect(html).toContain('.rise-block-wrapper.density-compact .accordion-group');
    expect(html).toContain('.rise-block-wrapper.density-standard .accordion-group');
    expect(html).toContain('.rise-block-wrapper.density-spacious .accordion-group');
  });
});

describe('CSS scoping and token isolation', () => {
  test('token block is dual-scoped to :root and .rise-block-wrapper', () => {
    const html = compileComponent('accordion');
    expect(html).toContain(':root, .rise-block-wrapper {');
    expect(html).toContain('--att-blue: #009FDB;');
    expect(html).toContain('--att-cobalt: #00388F;');
    expect(html).toContain('--primary:');
    expect(html).toContain('--accent:');
  });

  test('extracted HTML fragment maintains custom property definitions on .rise-block-wrapper', () => {
    const html = compileComponent('accordion');
    const fragment = generateHtmlFragment(html);
    expect(fragment).toContain(':root, .rise-block-wrapper {');
    expect(fragment).toContain('--att-blue: #009FDB;');
    expect(fragment).toContain('class="rise-block-wrapper');
  });

  test('two compiled components produce unique element and instance IDs', () => {
    const first = compileComponent('accordion', {}, 'proj-1');
    const second = compileComponent('accordion', {}, 'proj-2');
    expect(first).toContain('id="rcb-proj-1-block-headline"');
    expect(second).toContain('id="rcb-proj-2-block-headline"');
    expect(first).not.toContain('rcb-proj-2');
    expect(second).not.toContain('rcb-proj-1');
  });
});

describe('Saved-project compatibility and safe defaults', () => {
  test('legacy saved project without new fields migrates and validates successfully', () => {
    const legacyProject = {
      id: 'legacy-123',
      name: 'Old Project',
      componentId: 'accordion',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      config: {
        blockTitle: 'OLD ACCORDION',
        blockHeadline: 'Legacy Headline',
        blockDesc: 'Old description',
        colorPrimary: '#2563EB',
        colorAccent: '#F59E0B',
        colorBg: '#FFFFFF',
        colorText: '#1F2937',
        borderRadius: '12',
        shadowDepth: 'soft',
        borderOutline: true,
        accordionMulti: true,
        accordionAnimation: true,
        iconStyle: 'chevron',
        trackCompletion: false,
        completionMsg: 'Complete',
        items: [
          { title: 'Item 1', content: 'Content 1' }
        ]
      }
    };

    const migrated = migrateProject(legacyProject);
    expect(migrated.config.headerStyle).toBe('minimal');
    expect(migrated.config.headerCyanRule).toBe(false);
    expect(migrated.config.spacingDensity).toBe('standard');
    expect(migrated.config.contextBandEnabled).toBe(false);

    const validation = validateProject(legacyProject);
    expect(validation.valid).toBe(true);
    expect(validation.project.config.headerStyle).toBe('minimal');
    expect(validation.project.config.spacingDensity).toBe('standard');
  });
});
