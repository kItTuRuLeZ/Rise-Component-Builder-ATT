import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import * as confidenceMatrix from '../../components/confidence-matrix.js';

const INSTANCE_ID = 'test-confidence-inst';

describe('confidence & skills self-assessment component', () => {
  test('exports standard component properties and functions', () => {
    expect(confidenceMatrix.id).toBe('confidence-matrix');
    expect(confidenceMatrix.name).toBe('Confidence & Skills Self-Assessment');
    expect(confidenceMatrix.category).toBe('knowledge');
    expect(typeof confidenceMatrix.generateHTML).toBe('function');
    expect(typeof confidenceMatrix.generateCSS).toBe('function');
    expect(typeof confidenceMatrix.generateJS).toBe('function');
    expect(typeof confidenceMatrix.validate).toBe('function');
    expect(confidenceMatrix.defaultConfig).toBeDefined();
  });

  test('generates matrix items with accessible radiogroups and options', () => {
    const html = confidenceMatrix.generateHTML(confidenceMatrix.defaultConfig, INSTANCE_ID);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = document.querySelectorAll('.confidence-item-row');
    expect(rows.length).toBe(4);

    const radiogroups = document.querySelectorAll('.confidence-rating-group');
    expect(radiogroups.length).toBe(4);

    radiogroups.forEach(rg => {
      expect(rg.getAttribute('role')).toBe('radiogroup');
      const buttons = rg.querySelectorAll('.confidence-rating-btn');
      expect(buttons.length).toBe(4);
      buttons.forEach(btn => {
        expect(btn.getAttribute('role')).toBe('radio');
        expect(btn.getAttribute('aria-checked')).toBe('false');
      });
    });
  });

  test('generates diagnostic panel with reflection notes and print action when showBreakdown is true', () => {
    const html = confidenceMatrix.generateHTML({ showBreakdown: true }, INSTANCE_ID);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const panel = document.querySelector('.confidence-diagnostic-panel');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.strengths-col')).toBeTruthy();
    expect(panel.querySelector('.growth-col')).toBeTruthy();

    const notesTextarea = document.querySelector('.confidence-reflection-input');
    expect(notesTextarea).toBeTruthy();
    expect(notesTextarea.getAttribute('id')).toBe(`${INSTANCE_ID}-reflection-notes`);

    const printBtn = document.querySelector('.confidence-print-btn');
    expect(printBtn).toBeTruthy();
    expect(printBtn.getAttribute('id')).toBe(`${INSTANCE_ID}-print-btn`);
  });

  test('omits diagnostic panel when showBreakdown is false', () => {
    const html = confidenceMatrix.generateHTML({ showBreakdown: false }, INSTANCE_ID);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const panel = document.querySelector('.confidence-diagnostic-panel');
    expect(panel).toBeNull();
  });

  test('generates valid CSS and JS with print rules and print handlers', () => {
    const css = confidenceMatrix.generateCSS(confidenceMatrix.defaultConfig);
    expect(typeof css).toBe('string');
    expect(css).toContain('.confidence-matrix-card');
    expect(css).toContain('.confidence-rating-btn');
    expect(css).toContain('@media print');
    expect(css).toContain('.confidence-print-btn');

    const js = confidenceMatrix.generateJS(confidenceMatrix.defaultConfig, INSTANCE_ID);
    expect(typeof js).toBe('string');
    expect(js).toContain('updateMatrixState');
    expect(js).toContain('handleRatingSelect');
    expect(js).toContain('window.print');
    expect(js).toContain('viewedItems.add');
    expect(() => new Function(js)).not.toThrow();
  });

  test('validation accurately validates configs', () => {
    expect(confidenceMatrix.validate(confidenceMatrix.defaultConfig).valid).toBe(true);

    const emptyItems = confidenceMatrix.validate({ items: [] });
    expect(emptyItems.valid).toBe(false);

    const missingTitle = confidenceMatrix.validate({ items: [{ content: 'Missing title' }] });
    expect(missingTitle.valid).toBe(false);
  });
});

// Audit 2026-09-30, section 2: PMI's project-management matrix ended with "lead complex architectures and
// mentor engineering teams". The diagnostic is now worded for whatever competencies the author configures,
// and a score over only some of them is labelled as partial. These tests run the component's real script.
describe('confidence matrix: diagnostic wording and results', () => {
  const BANNED = /engineer|architect|\blab\b|troubleshoot|enterprise|operational|blueprint|deployment/i;
  const PRIORITISE = /Prioriti[sz]e foundational learning and guided practice/;

  function mount(config = confidenceMatrix.defaultConfig) {
    const html = confidenceMatrix.generateHTML(config, INSTANCE_ID);
    const js = confidenceMatrix.generateJS(config, INSTANCE_ID);
    const dom = new JSDOM(`<!doctype html><body>${html}<script>var viewedItems = new Set(); function updateProgress() {}\n${js}\ninitComponent();</script></body>`, { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const rate = (item, value) => doc.querySelector(`.confidence-rating-btn[data-item-index="${item}"][data-rating-value="${value}"]`).click();
    const text = id => doc.getElementById(`${INSTANCE_ID}-${id}`).textContent.trim();
    return { doc, rate, text, panel: () => doc.getElementById(`${INSTANCE_ID}-diagnostic-panel`), print: () => doc.getElementById(`${INSTANCE_ID}-print-btn`) };
  }
  const rateAll = (m, values) => values.forEach((value, item) => m.rate(item, value));

  test.each([
    [[4, 4, 4, 4], 'Advanced subject matter expert', 'Overall Score: 100%'],
    [[3, 3, 3, 3], 'Proficient practitioner', 'Overall Score: 75%'],
    [[4, 3, 2, 1], 'Developing specialist', 'Overall Score: 63%'],
    [[1, 1, 1, 1], 'Foundational explorer', 'Overall Score: 25%']
  ])('ratings %j give the %s tier and the unchanged score', (values, tier, score) => {
    const m = mount();
    rateAll(m, values);
    expect(m.panel().style.display).toBe('flex');
    expect(m.text('tier-badge')).toBe(tier);
    expect(m.text('overall-score')).toBe(score);
  });

  test('no tier\'s guidance names a discipline: nothing about engineering, architecture, labs or enterprises', () => {
    for (const values of [[4, 4, 4, 4], [3, 3, 3, 3], [4, 3, 2, 1], [1, 1, 1, 1]]) {
      const m = mount();
      rateAll(m, values);
      expect(m.text('tier-desc')).not.toMatch(BANNED);
      expect(m.text('tier-desc').length).toBeGreaterThan(40);
    }
    // The competency titles are the author's content (AT&T's defaults are engineering topics on purpose),
    // so scan the script with neutral titles: only the component's own wording is under test.
    const neutral = { ...confidenceMatrix.defaultConfig, items: [{ title: 'Competency one', content: 'x' }, { title: 'Competency two', content: 'y' }] };
    expect(confidenceMatrix.generateJS(neutral, INSTANCE_ID)).not.toMatch(BANNED);
  });

  test('the guidance fits any competency set the author configures, because it never names the domains', () => {
    const finance = { ...confidenceMatrix.defaultConfig, items: [{ title: 'Budget forecasting', content: 'x' }, { title: 'Variance analysis', content: 'y' }] };
    const m = mount(finance);
    rateAll(m, [4, 4]);
    expect(m.text('tier-desc')).toContain('competencies you rated');
    expect(m.text('tier-desc')).not.toMatch(BANNED);
  });

  test('the lowest tier uses this edition\'s spelling', () => {
    const m = mount();
    rateAll(m, [1, 1, 1, 1]);
    expect(m.text('tier-desc')).toMatch(PRIORITISE);
  });

  test('partial results are supported and labelled as partial, not as the overall result', () => {
    const m = mount();
    expect(m.print().disabled).toBe(true);
    m.rate(0, 4);
    m.rate(1, 2);
    expect(m.text('overall-score')).toBe('Partial score: 75% (2 of 4 rated)');
    expect(m.text('overall-score')).not.toMatch(/overall/i);
    expect(m.print().disabled).toBe(false);          // printing a partial result remains possible
    expect(m.panel().style.display).toBe('none');    // but the full diagnostic waits for every rating
  });

  test('completing the rating switches the label from partial to overall', () => {
    const m = mount();
    rateAll(m, [4, 4, 4]);
    expect(m.text('overall-score')).toMatch(/^Partial score:/);
    m.rate(3, 4);
    expect(m.text('overall-score')).toBe('Overall Score: 100%');
  });
});
