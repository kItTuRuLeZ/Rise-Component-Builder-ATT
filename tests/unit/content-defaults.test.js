// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import * as pricingComparison from '../../components/pricing-comparison.js';
import * as flipCards from '../../components/flip-cards.js';
import { DashboardView } from '../../js/dashboard/dashboard-view.js';
import { editorSchemas } from '../../js/editor-schemas.js';
import { collectSyncIssues } from '../../js/validation.js';

// Audit 2026-09-30, section 6: default/sample content that looked broken or described behaviour
// the component does not have.

describe('Comparison Matrix: tooltip markup is never shown to learners', () => {
  const render = (config = pricingComparison.defaultConfig) => pricingComparison.generateHTML({ ...pricingComparison.defaultConfig, ...config }, 'inst');
  const tooltips = html => [...html.matchAll(/data-tooltip="([^"]*)"/g)].map(match => match[1]);

  test('the default plans render no literal [info: …] text, in either layout', () => {
    expect(render()).not.toMatch(/\[info:/i);
    expect(render({ pricingMatrixMode: true })).not.toMatch(/\[info:/i);
  });

  test('every default tooltip becomes a real tooltip trigger, including the first features that used to fail', () => {
    // 2 on Starter (one mid-list, one followed by another feature), 1 on Professional, 1 on Enterprise.
    expect(tooltips(render())).toEqual([
      'Single user seat license', 'Monthly export allotment', '24/7 turnaround SLA', 'Direct phone & Slack bridge'
    ].map(text => text.replace(/&/g, '&amp;')));
  });

  test('a tooltip is parsed whether or not the feature is surrounded by spaces, and trailing &nbsp; is ignored', () => {
    const html = render({ items: [{ title: 'Plan', content: 'Alpha [info: first] • Beta [info: second]&nbsp; •  Gamma [info: third]  ' }] });
    expect(html).not.toMatch(/\[info:/i);
    expect(tooltips(html)).toEqual(['first', 'second', 'third']);
    expect(html).toContain('Alpha');
    expect(html).toContain('Gamma');
  });

  test('tooltips are keyboard reachable and named', () => {
    const html = render();
    const triggers = [...html.matchAll(/<span class="feature-tooltip-trigger"[^>]*>/g)].map(match => match[0]);
    expect(triggers.length).toBe(4);
    for (const trigger of triggers) {
      expect(trigger).toContain('tabindex="0"');
      expect(trigger).toMatch(/aria-label="[^"]+"/);
    }
  });

  test('text that merely mentions "info" without the bracket syntax is left alone', () => {
    const html = render({ items: [{ title: 'Plan', content: 'Product info sheet • Priority support' }] });
    expect(html).toContain('Product info sheet');
    expect(tooltips(html)).toEqual([]);
  });
});

describe('Study Cards: the default text matches how the cards actually work', () => {
  test('no default card says "hover": cards are revealed by click, tap or keyboard', () => {
    const text = flipCards.defaultConfig.items.map(item => item.content).join(' ');
    expect(text).not.toMatch(/hover/i);
    expect(text).toMatch(/click/i);
    expect(text).toMatch(/tap/i);
    expect(text).toMatch(/enter/i);
  });

  test('the cards are real keyboard-operable buttons (so the wording above is true)', () => {
    const html = flipCards.generateHTML(flipCards.defaultConfig, 'inst');
    expect(html).toMatch(/class="flip-card[^"]*" role="button" tabindex="0"/);
    expect(html).not.toMatch(/hover to reveal/i);
  });
});

describe('the AT&T starter course ships without false "unsupported formatting" warnings', () => {
  test('no component in the standard starter course has rich text the sanitizer would rewrite', () => {
    const view = new DashboardView({ container: document.createElement('div') });
    const project = view.createNewProjectFromTemplate({ name: 'Starter', client: 'AT&T', desc: '', template: 'standard' });
    const components = Object.values(project.components);
    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      const issues = collectSyncIssues({
        componentId: component.type, schema: editorSchemas[component.type], config: component.config,
        theme: {}, componentOverrides: {}, settings: {}
      });
      expect(issues.filter(issue => issue.ruleId === 'general-unsupported-rich-html'), `${component.name}`).toEqual([]);
    }
  });
});
