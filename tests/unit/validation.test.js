import { afterEach, describe, expect, test } from 'vitest';
import { COMPONENT_REGISTRY, getComponentById, getDefaultConfig } from '../../js/component-registry.js';
import { applyThemeToConfig, BUILT_IN_THEMES, DEFAULT_THEME_ID } from '../../js/themes.js';
import {
  checkCompletionExportFormatIssue, collectSyncIssues, listRegisteredRuleIds, registerValidationRule,
  requiredContrastRatio, runPreflight, SEVERITY, summarizePreflight, summarizePreflightForAnnouncement,
  unregisterValidationRule
} from '../../js/validation.js';

const theme = BUILT_IN_THEMES.find(entry => entry.id === DEFAULT_THEME_ID);

function buildConfig(componentId, overrides = {}) {
  const entry = getComponentById(COMPONENT_REGISTRY, componentId);
  const config = applyThemeToConfig({
    blockTitle: 'TEST BLOCK', blockHeadline: 'Test Headline', blockDesc: 'Test description.',
    borderRadius: '12', shadowDepth: 'soft', borderOutline: true,
    trackCompletion: false, completionMsg: 'Done!',
    ...getDefaultConfig(entry)
  }, theme);
  return { ...config, ...overrides };
}

function issuesFor(componentId, config, extra = {}) {
  const entry = getComponentById(COMPONENT_REGISTRY, componentId);
  return collectSyncIssues({
    componentId, schema: entry.editorSchema, config, theme, componentOverrides: {},
    settings: { mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 }, completionParentOrigin: 'https://example.com' }, ...extra
  });
}

function ruleIds(issues) { return issues.map(item => item.ruleId); }
function bySeverity(issues, severity) { return issues.filter(item => item.severity === severity); }

describe('sanity: default configs produce no false-positive blocking issues', () => {
  test.each(['accordion', 'multiple-choice', 'multiple-select', 'hotspots', 'audio-player', 'video-frame', 'sorting-activity', 'fill-blank', 'interactive-video'])(
    '%s default config has zero blocking issues', componentId => {
      const config = buildConfig(componentId);
      const issues = issuesFor(componentId, config);
      expect(bySeverity(issues, SEVERITY.BLOCKING)).toEqual([]);
    });
});

describe('General: required fields', () => {
  test('an empty required item field is a blocking error', () => {
    const config = buildConfig('accordion');
    config.items[0].title = '';
    const issues = issuesFor('accordion', config);
    expect(ruleIds(issues)).toContain('general-required-field');
    expect(bySeverity(issues, SEVERITY.BLOCKING).some(i => i.itemIndex === 0)).toBe(true);
  });

  test('a cross-item requiredOne field (multiple-choice correct answer) reports once, not once per item', () => {
    const config = buildConfig('multiple-choice');
    config.items.forEach(item => { item.correct = false; });
    const issues = issuesFor('multiple-choice', config);
    const requiredOneIssues = issues.filter(i => i.ruleId === 'general-required-field' && i.explanation.includes('Select one'));
    expect(requiredOneIssues).toHaveLength(1);
  });
});

describe('General: empty component', () => {
  test('fewer items than minItems is a blocking error', () => {
    const config = buildConfig('accordion');
    config.items = [];
    const issues = issuesFor('accordion', config);
    expect(ruleIds(issues)).toContain('general-empty-component');
    expect(bySeverity(issues, SEVERITY.BLOCKING).some(i => i.ruleId === 'general-empty-component')).toBe(true);
  });
});

describe('General: excessively long content', () => {
  test('an unusually long short-text field is a warning', () => {
    const config = buildConfig('sorting-activity');
    config.items[0].title = 'x'.repeat(250);
    const issues = issuesFor('sorting-activity', config);
    const found = issues.find(i => i.ruleId === 'general-excessive-length' && i.itemIndex === 0);
    expect(found?.severity).toBe(SEVERITY.WARNING);
  });

  test('very long richtext content is a recommendation', () => {
    const config = buildConfig('accordion');
    config.items[0].content = '<p>' + 'x'.repeat(4500) + '</p>';
    const issues = issuesFor('accordion', config);
    const found = issues.find(i => i.ruleId === 'general-excessive-length' && i.itemIndex === 0);
    expect(found?.severity).toBe(SEVERITY.RECOMMENDATION);
  });

  test('a field with an explicit maxLength is not subject to the soft heuristic (handled as a required-field format error instead)', () => {
    const config = buildConfig('accordion');
    config.items[0].title = 'x'.repeat(200); // accordion title has maxLength: 120
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-excessive-length' && i.itemIndex === 0)).toBe(false);
    expect(issues.some(i => i.ruleId === 'general-required-field' && i.itemIndex === 0)).toBe(true);
  });
});

describe('General: unsupported rich HTML', () => {
  test('a richtext field containing an unsupported tag is flagged and the tag is actually stripped', () => {
    const config = buildConfig('accordion');
    config.items[0].content = '<div onclick="bad()">Hello</div>';
    const issues = issuesFor('accordion', config);
    const found = issues.find(i => i.ruleId === 'general-unsupported-rich-html' && i.itemIndex === 0);
    expect(found?.severity).toBe(SEVERITY.WARNING);
  });

  test('plain, fully-supported richtext markup is not flagged', () => {
    const config = buildConfig('accordion');
    config.items[0].content = '<p><strong>Bold</strong> and <em>italic</em>.</p>';
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-unsupported-rich-html')).toBe(false);
  });
});

describe('General: invalid URLs', () => {
  test('a malformed URL in a url-type field is a blocking error', () => {
    const config = buildConfig('button-list');
    config.items[0].content = 'not a url';
    const issues = issuesFor('button-list', config);
    const found = issues.find(i => i.ruleId === 'general-invalid-url' && i.itemIndex === 0);
    expect(found?.severity).toBe(SEVERITY.BLOCKING);
  });

  test('a javascript: URL is rejected as invalid, not silently accepted', () => {
    const config = buildConfig('button-list');
    config.items[0].content = 'javascript:alert(1)';
    const issues = issuesFor('button-list', config);
    expect(issues.some(i => i.ruleId === 'general-invalid-url' && i.itemIndex === 0)).toBe(true);
  });

  test('a valid https URL is not flagged', () => {
    const config = buildConfig('button-list');
    config.items[0].content = 'https://example.com/resource';
    const issues = issuesFor('button-list', config);
    expect(issues.some(i => i.ruleId === 'general-invalid-url')).toBe(false);
  });
});

describe('General: missing accessible names', () => {
  test('an empty block headline is a blocking error', () => {
    const config = buildConfig('accordion', { blockHeadline: '' });
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-missing-accessible-name' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('a whitespace-only block headline is also blocking', () => {
    const config = buildConfig('accordion', { blockHeadline: '   ' });
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-missing-accessible-name')).toBe(true);
  });
});

describe('General: missing alternative text', () => {
  test('a hotspot background image with no alt text and not marked decorative is a warning', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = 'https://example.com/image.png';
    config.backgroundAltText = '';
    config.backgroundDecorative = false;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'general-missing-alt-text' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('marking the image decorative suppresses the warning', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = 'https://example.com/image.png';
    config.backgroundDecorative = true;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'general-missing-alt-text')).toBe(false);
  });
});

describe('General: insufficient colour contrast', () => {
  test('near-identical text and background colors are flagged', () => {
    const config = buildConfig('accordion');
    const issues = issuesFor('accordion', config, {});
    const lowContrastIssues = collectSyncIssues({
      componentId: 'accordion', schema: getComponentById(COMPONENT_REGISTRY, 'accordion').editorSchema, config,
      theme, componentOverrides: { text: '#FFFFFF', background: '#FFFFFF' }, settings: {}
    });
    expect(lowContrastIssues.some(i => i.ruleId === 'general-insufficient-contrast' && i.severity === SEVERITY.WARNING)).toBe(true);
    // Sanity: the default (unmodified) theme should not trip this rule.
    expect(issues.some(i => i.ruleId === 'general-insufficient-contrast')).toBe(false);
  });
});

describe('General: duplicate items', () => {
  test('two items with identical title and content are a warning', () => {
    const config = buildConfig('accordion');
    config.items = [
      { title: 'Same Title', content: 'Same content.' },
      { title: 'Same Title', content: 'Same content.' },
      { title: 'Different', content: 'Different content.' }
    ];
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-duplicate-items' && i.severity === SEVERITY.WARNING && i.itemIndex === 1)).toBe(true);
  });
});

describe('General: invalid completion configuration', () => {
  test('completion required with zero items is blocking', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    config.items = [];
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-invalid-completion-config' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('completion required with an empty completion message is a warning', () => {
    const config = buildConfig('accordion', { trackCompletion: true, completionMsg: '' });
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-invalid-completion-config' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('no configured parent origin is only a recommendation, and only when completion is on', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    const issues = issuesFor('accordion', config, { settings: { mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 }, completionParentOrigin: '' } });
    expect(issues.some(i => i.ruleId === 'general-invalid-completion-config' && i.severity === SEVERITY.RECOMMENDATION)).toBe(true);
    const offConfig = buildConfig('accordion', { trackCompletion: false });
    const offIssues = issuesFor('accordion', offConfig, { settings: { mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 }, completionParentOrigin: '' } });
    expect(offIssues.some(i => i.ruleId === 'general-invalid-completion-config')).toBe(false);
  });
});

describe('General: Iframe Snippet format incompatible with completion tracking', () => {
  test('completion on warns about the Iframe Snippet format not reaching Rise\'s Continue-block gating', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-completion-iframe-format' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('completion off does not warn about export format', () => {
    const config = buildConfig('accordion', { trackCompletion: false });
    const issues = issuesFor('accordion', config);
    expect(issues.some(i => i.ruleId === 'general-completion-iframe-format')).toBe(false);
  });
});

describe('General: checkCompletionExportFormatIssue — Blocking gate for a specific selected export format (P02)', () => {
  test('completion on + code format (the only compatible one) never blocks', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    expect(checkCompletionExportFormatIssue(config, 'code')).toBeNull();
  });

  test('completion on + iframe format is Blocking with a direct fix', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    const result = checkCompletionExportFormatIssue(config, 'iframe');
    expect(result).not.toBeNull();
    expect(result.severity).toBe(SEVERITY.BLOCKING);
    expect(result.ruleId).toBe('general-completion-export-incompatible');
    expect(result.explanation).toMatch(/Copy for Rise/);
  });

  test('completion on + rise-zip format is Blocking with a direct fix', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    const result = checkCompletionExportFormatIssue(config, 'rise-zip');
    expect(result).not.toBeNull();
    expect(result.severity).toBe(SEVERITY.BLOCKING);
    expect(result.ruleId).toBe('general-completion-export-incompatible');
  });

  test('completion off never blocks, regardless of format', () => {
    const config = buildConfig('accordion', { trackCompletion: false });
    ['code', 'iframe', 'rise-zip', 'standaloneDownload'].forEach(formatKey => {
      expect(checkCompletionExportFormatIssue(config, formatKey)).toBeNull();
    });
  });

  test('no format supplied never blocks, even with completion on', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    expect(checkCompletionExportFormatIssue(config, undefined)).toBeNull();
  });
});

describe('Media: unsupported file type, oversized file', () => {
  const mediaReference = overrides => ({
    source: 'upload', mediaId: 'media-1', schemaVersion: 1, kind: 'image', name: 'photo.png',
    mimeType: 'image/png', size: 1024, createdAt: '2026-01-01T00:00:00.000Z', ...overrides
  });

  test('an unsupported MIME type on an image field is blocking', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = mediaReference({ mimeType: 'application/pdf' });
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'media-unsupported-file-type' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('a file over the configured size limit is a warning', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = mediaReference({ size: 50 * 1024 * 1024 }); // 50MB > 10MB image limit
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'media-oversized-file' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('a supported, appropriately-sized file triggers neither rule', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = mediaReference({});
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => ['media-unsupported-file-type', 'media-oversized-file'].includes(i.ruleId))).toBe(false);
  });
});

describe('Media: external asset dependency, insecure HTTP URL', () => {
  test('a plain external URL (not an upload) is a recommendation', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = 'https://example.com/image.png';
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'media-external-asset-dependency' && i.severity === SEVERITY.RECOMMENDATION)).toBe(true);
  });

  test('an insecure http:// URL is additionally a warning', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = 'http://example.com/image.png';
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'media-insecure-http-url' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('an https URL does not trigger the insecure-URL rule', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = 'https://example.com/image.png';
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'media-insecure-http-url')).toBe(false);
  });
});

describe('Media: broken media reference (async)', () => {
  const schema = getComponentById(COMPONENT_REGISTRY, 'hotspots').editorSchema;

  test('a media reference whose record no longer exists is blocking for a required field', async () => {
    const config = buildConfig('hotspots');
    config.items[0].title = 'Hotspot label'; // title stays required; using componentFields.backgroundImage (not required) instead
    config.backgroundImage = { source: 'upload', mediaId: 'missing-1', schemaVersion: 1, kind: 'image', name: 'gone.png', mimeType: 'image/png', size: 100, createdAt: '2026-01-01T00:00:00.000Z' };
    const missingStore = { get: async () => undefined };
    const issues = await runPreflight({ componentId: 'hotspots', schema, config, theme, componentOverrides: {}, settings: {}, mediaStore: missingStore });
    const found = issues.find(i => i.ruleId === 'media-broken-reference');
    expect(found).toBeTruthy();
    expect(found.severity).toBe(SEVERITY.WARNING); // backgroundImage is not a required field
  });

  test('a media reference whose record exists produces no broken-reference issue', async () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = { source: 'upload', mediaId: 'present-1', schemaVersion: 1, kind: 'image', name: 'here.png', mimeType: 'image/png', size: 100, createdAt: '2026-01-01T00:00:00.000Z' };
    const presentStore = { get: async () => ({ id: 'present-1', blob: new Blob(['x']) }) };
    const issues = await runPreflight({ componentId: 'hotspots', schema, config, theme, componentOverrides: {}, settings: {}, mediaStore: presentStore });
    expect(issues.some(i => i.ruleId === 'media-broken-reference')).toBe(false);
  });

  test('a broken reference on a required media field (audio-player) is blocking', async () => {
    const audioSchema = getComponentById(COMPONENT_REGISTRY, 'audio-player').editorSchema;
    const config = buildConfig('audio-player');
    config.items[0].content = { source: 'upload', mediaId: 'missing-audio', schemaVersion: 1, kind: 'audio', name: 'gone.mp3', mimeType: 'audio/mpeg', size: 100, createdAt: '2026-01-01T00:00:00.000Z' };
    const missingStore = { get: async () => undefined };
    const issues = await runPreflight({ componentId: 'audio-player', schema: audioSchema, config, theme, componentOverrides: {}, settings: {}, mediaStore: missingStore });
    const found = issues.find(i => i.ruleId === 'media-broken-reference');
    expect(found?.severity).toBe(SEVERITY.BLOCKING); // audio-player's content field is required
  });
});

describe('Knowledge checks: no correct answer / impossible passing', () => {
  test('multiple-choice with zero correct options is blocking on both rules', () => {
    const config = buildConfig('multiple-choice');
    config.items.forEach(item => { item.correct = false; });
    const issues = issuesFor('multiple-choice', config);
    expect(issues.some(i => i.ruleId === 'knowledge-no-correct-answer' && i.severity === SEVERITY.BLOCKING)).toBe(true);
    expect(issues.some(i => i.ruleId === 'knowledge-impossible-passing' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('multiple-select with zero correct options is also blocking', () => {
    const config = buildConfig('multiple-select');
    config.items.forEach(item => { item.correct = false; });
    const issues = issuesFor('multiple-select', config);
    expect(issues.some(i => i.ruleId === 'knowledge-no-correct-answer')).toBe(true);
  });

  test('a normal, valid multiple-choice config with exactly one correct answer has no knowledge-check blocking issues', () => {
    const config = buildConfig('multiple-choice');
    const issues = issuesFor('multiple-choice', config);
    expect(bySeverity(issues, SEVERITY.BLOCKING).filter(i => i.category === 'knowledge')).toEqual([]);
  });
});

describe('Knowledge checks: multiple correct answers where only one is allowed', () => {
  test('two items marked correct on a single-answer multiple-choice is blocking', () => {
    const config = buildConfig('multiple-choice');
    config.items[0].correct = true;
    config.items[1].correct = true;
    const issues = issuesFor('multiple-choice', config);
    expect(issues.some(i => i.ruleId === 'knowledge-multiple-correct-single-allowed' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('multiple correct answers on multiple-select (a multi-answer format) is not flagged by this rule', () => {
    const config = buildConfig('multiple-select');
    config.items.forEach(item => { item.correct = true; });
    const issues = issuesFor('multiple-select', config);
    expect(issues.some(i => i.ruleId === 'knowledge-multiple-correct-single-allowed')).toBe(false);
  });
});

describe('Knowledge checks: duplicate options', () => {
  test('two options with identical wording are a warning', () => {
    const config = buildConfig('multiple-choice');
    config.items[1].label = config.items[0].label;
    const issues = issuesFor('multiple-choice', config);
    expect(issues.some(i => i.ruleId === 'knowledge-duplicate-options' && i.severity === SEVERITY.WARNING && i.itemIndex === 1)).toBe(true);
  });
});

describe('Knowledge checks: empty feedback', () => {
  test('an option with no feedback text is a recommendation', () => {
    const config = buildConfig('multiple-choice');
    config.items[0].content = '';
    const issues = issuesFor('multiple-choice', config);
    expect(issues.some(i => i.ruleId === 'knowledge-empty-feedback' && i.severity === SEVERITY.RECOMMENDATION && i.itemIndex === 0)).toBe(true);
  });
});

describe('Hotspots: missing background image', () => {
  test('no background image set is a recommendation, not a defect (a placeholder exists)', () => {
    const config = buildConfig('hotspots', { backgroundImage: '' });
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-missing-image' && i.severity === SEVERITY.RECOMMENDATION)).toBe(true);
  });
});

describe('Hotspots: out-of-range position', () => {
  test('a position beyond the 0-100% range is blocking', () => {
    const config = buildConfig('hotspots');
    config.items[0].x = 150;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-out-of-range-position' && i.severity === SEVERITY.BLOCKING)).toBe(true);
  });

  test('a negative position is also blocking', () => {
    const config = buildConfig('hotspots');
    config.items[0].y = -10;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-out-of-range-position')).toBe(true);
  });

  test('a NaN position (corrupted import) is blocking', () => {
    const config = buildConfig('hotspots');
    config.items[0].x = 'not-a-number';
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-out-of-range-position')).toBe(true);
  });
});

describe('Hotspots: overlapping hotspots', () => {
  test('two hotspots within the overlap threshold are a warning', () => {
    const config = buildConfig('hotspots');
    config.items[0].x = 50; config.items[0].y = 50;
    config.items[1].x = 51; config.items[1].y = 51;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-overlapping' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('hotspots far enough apart are not flagged', () => {
    const config = buildConfig('hotspots');
    config.items[0].x = 10; config.items[0].y = 10;
    config.items[1].x = 90; config.items[1].y = 90;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-overlapping')).toBe(false);
  });
});

describe('Hotspots: keyboard-accessibility (ambiguous duplicate labels)', () => {
  test('two hotspots sharing the same label are a warning', () => {
    const config = buildConfig('hotspots');
    config.items[1].title = config.items[0].title;
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-keyboard-accessibility' && i.severity === SEVERITY.WARNING)).toBe(true);
  });

  test('distinctly-labeled hotspots are not flagged', () => {
    const config = buildConfig('hotspots');
    const issues = issuesFor('hotspots', config);
    expect(issues.some(i => i.ruleId === 'hotspot-keyboard-accessibility')).toBe(false);
  });
});

describe('summarizePreflight', () => {
  test('canExport is false only when there is at least one blocking issue', () => {
    const clean = summarizePreflight([{ severity: SEVERITY.WARNING }, { severity: SEVERITY.RECOMMENDATION }]);
    expect(clean.canExport).toBe(true);
    const broken = summarizePreflight([{ severity: SEVERITY.BLOCKING }, { severity: SEVERITY.WARNING }]);
    expect(broken.canExport).toBe(false);
  });

  test('groups and counts are consistent — every issue lands in exactly one bucket', () => {
    const config = buildConfig('multiple-choice');
    config.items.forEach(item => { item.correct = false; }); // forces a mix of severities
    const issues = issuesFor('multiple-choice', config);
    const summary = summarizePreflight(issues);
    expect(summary.blocking.length + summary.warnings.length + summary.recommendations.length).toBe(issues.length);
    expect(summary.blocking.every(item => item.severity === SEVERITY.BLOCKING)).toBe(true);
    expect(summary.warnings.every(item => item.severity === SEVERITY.WARNING)).toBe(true);
    expect(summary.recommendations.every(item => item.severity === SEVERITY.RECOMMENDATION)).toBe(true);
  });
});

describe('summarizePreflightForAnnouncement (Requirement 5, P05 — concise, chatter-free)', () => {
  test('no-issue state announces plainly, not as "0 issues"', () => {
    expect(summarizePreflightForAnnouncement([])).toBe('No issues found.');
  });

  test('a single blocking issue is announced in the singular', () => {
    expect(summarizePreflightForAnnouncement([{ severity: SEVERITY.BLOCKING }]))
      .toBe('1 issue: 1 blocking.');
  });

  test('a mix of severities is announced as one concise sentence, correctly pluralized', () => {
    const issues = [
      { severity: SEVERITY.BLOCKING }, { severity: SEVERITY.BLOCKING },
      { severity: SEVERITY.WARNING },
      { severity: SEVERITY.RECOMMENDATION }, { severity: SEVERITY.RECOMMENDATION }
    ];
    expect(summarizePreflightForAnnouncement(issues)).toBe('5 issues: 2 blocking, 1 warning, 2 recommendations.');
  });

  test('a real run against a clean default config announces "No issues found."', () => {
    const config = buildConfig('accordion');
    const issues = issuesFor('accordion', config);
    expect(summarizePreflightForAnnouncement(issues)).toBe('No issues found.');
  });
});

describe('P05: stable result model — every issue has title/explanation/target/fix', () => {
  test('every field is present on every issue a real component produces', () => {
    const config = buildConfig('hotspots');
    config.items = [{ title: '', content: '', x: 999, y: -5 }]; // triggers several rules at once
    const issues = issuesFor('hotspots', config);
    expect(issues.length).toBeGreaterThan(0);
    issues.forEach(item => {
      expect(typeof item.ruleId).toBe('string');
      expect(Object.values(SEVERITY)).toContain(item.severity);
      expect(typeof item.title).toBe('string');
      expect(item.title.length).toBeGreaterThan(0);
      expect(typeof item.explanation).toBe('string');
      expect(item.target).toEqual({ componentId: 'hotspots', itemIndex: item.itemIndex, fieldId: item.fieldId });
    });
  });

  test('an issue with a fieldId gets a "goToField" fix action', () => {
    const config = buildConfig('accordion', { blockHeadline: '' });
    const issues = issuesFor('accordion', config);
    const headlineIssue = issues.find(item => item.ruleId === 'general-missing-accessible-name');
    expect(headlineIssue.fix).toEqual({ type: 'goToField', label: 'Go to field' });
  });

  test('an issue with only an itemIndex (no fieldId) still gets a "goToItem" fix action', () => {
    const config = buildConfig('accordion');
    config.items = [
      { title: 'Same', content: 'Same' },
      { title: 'Same', content: 'Same' }
    ];
    const issues = issuesFor('accordion', config);
    const duplicateIssue = issues.find(item => item.ruleId === 'general-duplicate-items');
    expect(duplicateIssue.fieldId).toBeNull();
    expect(duplicateIssue.itemIndex).not.toBeNull();
    expect(duplicateIssue.fix).toEqual({ type: 'goToItem', label: 'Go to item' });
  });

  test('a whole-component issue with neither fieldId nor itemIndex gets no fix action', () => {
    const config = buildConfig('multiple-choice');
    config.items.forEach(item => { item.correct = false; });
    const issues = issuesFor('multiple-choice', config);
    const impossiblePassing = issues.find(item => item.ruleId === 'knowledge-impossible-passing');
    expect(impossiblePassing.fieldId).toBeNull();
    expect(impossiblePassing.itemIndex).toBeNull();
    expect(impossiblePassing.fix).toBeNull();
  });

  test('checkCompletionExportFormatIssue results are enriched the same way as registry results', () => {
    const config = buildConfig('accordion', { trackCompletion: true });
    const result = checkCompletionExportFormatIssue(config, 'iframe');
    expect(result.title).toBe("Selected export format can't report completion");
    expect(typeof result.explanation).toBe('string');
    expect(result.target).toEqual({ componentId: null, itemIndex: null, fieldId: null });
    expect(result.fix).toBeNull();
  });
});

describe('P05: rule registry extensibility', () => {
  afterEach(() => { unregisterValidationRule('test-only-rule'); });

  test('a newly registered rule runs and its issues are enriched like any built-in rule', () => {
    registerValidationRule({
      id: 'test-only-rule',
      appliesTo: ({ componentId }) => componentId === 'accordion',
      check: () => [{ ruleId: 'test-only-issue', severity: SEVERITY.WARNING, category: 'general', explanation: 'Test-only issue.', fieldId: null, itemIndex: null }]
    });
    expect(listRegisteredRuleIds()).toContain('test-only-rule');

    const accordionIssues = issuesFor('accordion', buildConfig('accordion'));
    expect(accordionIssues.some(item => item.ruleId === 'test-only-issue')).toBe(true);
    const enriched = accordionIssues.find(item => item.ruleId === 'test-only-issue');
    expect(enriched.title).toBe('test-only-issue'); // no RULE_TITLES entry -> falls back to the ruleId itself
  });

  test('appliesTo scopes a rule to only the matching component — no large conditional chain needed elsewhere', () => {
    registerValidationRule({
      id: 'test-only-rule',
      appliesTo: ({ componentId }) => componentId === 'accordion',
      check: () => [{ ruleId: 'test-only-issue', severity: SEVERITY.WARNING, category: 'general', explanation: 'Test-only issue.', fieldId: null, itemIndex: null }]
    });
    const tabsIssues = issuesFor('tab-blocks', buildConfig('tab-blocks'));
    expect(tabsIssues.some(item => item.ruleId === 'test-only-issue')).toBe(false);
  });

  test('unregisterValidationRule removes a rule from the registry and from future runs', () => {
    registerValidationRule({ id: 'test-only-rule', check: () => [{ ruleId: 'test-only-issue', severity: SEVERITY.WARNING, category: 'general', explanation: 'x', fieldId: null, itemIndex: null }] });
    expect(listRegisteredRuleIds()).toContain('test-only-rule');
    unregisterValidationRule('test-only-rule');
    expect(listRegisteredRuleIds()).not.toContain('test-only-rule');
    const issues = issuesFor('accordion', buildConfig('accordion'));
    expect(issues.some(item => item.ruleId === 'test-only-issue')).toBe(false);
  });

  test('registerValidationRule rejects a rule with no check function or no id', () => {
    expect(() => registerValidationRule({ id: 'no-check' })).toThrow(/check/i);
    expect(() => registerValidationRule({ check: () => [] })).toThrow(/id/i);
  });

  test('migrated built-in rules are present in the registry', () => {
    const ids = listRegisteredRuleIds();
    ['required-fields', 'empty-component', 'knowledge-check-rules', 'hotspot-rules', 'media-rules'].forEach(id => {
      expect(ids).toContain(id);
    });
  });
});

// P06 — first production rule set built on the P05 framework. Each new rule gets a pass,
// fail, boundary, duplicate, and/or empty case as applicable (Implementation note 5).
describe('P06: general-duplicate-titles — same title, different content', () => {
  test('fail: two items share a title but differ in content', () => {
    const config = buildConfig('accordion');
    config.items = [
      { title: 'Overview', content: 'First description' },
      { title: 'Overview', content: 'Second, different description' }
    ];
    const issues = issuesFor('accordion', config);
    const duplicate = issues.find(item => item.ruleId === 'general-duplicate-titles');
    expect(duplicate).toBeDefined();
    expect(duplicate.severity).toBe(SEVERITY.WARNING);
    expect(duplicate.itemIndex).toBe(1);
  });

  test('pass: distinct titles are not flagged', () => {
    const config = buildConfig('accordion');
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'general-duplicate-titles')).toBe(false);
  });

  test('does not double-report a full title+content duplicate already caught by general-duplicate-items', () => {
    const config = buildConfig('accordion');
    config.items = [
      { title: 'Same', content: 'Same' },
      { title: 'Same', content: 'Same' }
    ];
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'general-duplicate-items')).toBe(true);
    expect(issues.some(item => item.ruleId === 'general-duplicate-titles')).toBe(false);
  });

  test('skips components already covered by a more specific duplicate-label rule (knowledge checks, hotspots)', () => {
    const quizConfig = buildConfig('multiple-choice');
    quizConfig.items = quizConfig.items.map(item => ({ ...item, label: 'Same label', content: 'Different feedback ' + Math.random() }));
    quizConfig.items[0].correct = true;
    const quizIssues = issuesFor('multiple-choice', quizConfig);
    expect(quizIssues.some(item => item.ruleId === 'general-duplicate-titles')).toBe(false);
  });
});

describe('P06: general-item-count-exceeded — maxItems ceiling', () => {
  test('fail: more items than the schema allows (only reachable via import/hand-edit, not the normal Add Item UI)', () => {
    const config = buildConfig('audio-player');
    config.items = [config.items[0], structuredClone(config.items[0])];
    const issues = issuesFor('audio-player', config);
    const exceeded = issues.find(item => item.ruleId === 'general-item-count-exceeded');
    expect(exceeded).toBeDefined();
    expect(exceeded.severity).toBe(SEVERITY.WARNING);
    expect(exceeded.explanation).toMatch(/1 extra entry/);
  });

  test('boundary: exactly at maxItems is not flagged', () => {
    const config = buildConfig('audio-player');
    expect(config.items).toHaveLength(1); // audio-player's maxItems is 1
    const issues = issuesFor('audio-player', config);
    expect(issues.some(item => item.ruleId === 'general-item-count-exceeded')).toBe(false);
  });

  test('pass: components with no maxItems are never flagged regardless of item count', () => {
    const config = buildConfig('accordion');
    config.items = Array.from({ length: 12 }, (_, index) => ({ title: `Item ${index}`, content: `Content ${index}` }));
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'general-item-count-exceeded')).toBe(false);
  });
});

describe('P06: general-non-descriptive-link-text — button-list only, conservative phrase list', () => {
  test('fail: a classic non-descriptive phrase', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Click here', content: 'https://example.com/guide' }];
    const issues = issuesFor('button-list', config);
    const linkText = issues.find(item => item.ruleId === 'general-non-descriptive-link-text');
    expect(linkText).toBeDefined();
    expect(linkText.severity).toBe(SEVERITY.WARNING);
    expect(linkText.fieldId).toBe('title');
  });

  test('pass: a descriptive label is not flagged', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Download the study guide', content: 'https://example.com/guide' }];
    const issues = issuesFor('button-list', config);
    expect(issues.some(item => item.ruleId === 'general-non-descriptive-link-text')).toBe(false);
  });

  test('empty: no destination URL means nothing to flag yet', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Click here', content: '' }];
    const issues = issuesFor('button-list', config);
    expect(issues.some(item => item.ruleId === 'general-non-descriptive-link-text')).toBe(false);
  });

  test('scoped to button-list — the same phrase elsewhere is not flagged', () => {
    const config = buildConfig('accordion');
    config.items = [{ title: 'Click here', content: 'Some content' }];
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'general-non-descriptive-link-text')).toBe(false);
  });
});

describe('P06: general-external-url-destination — advisory, shows the sanitized destination', () => {
  test('fail (advisory): a valid external URL always gets the destination surfaced', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Download the guide', content: 'https://example.com/guide?ref=course' }];
    const issues = issuesFor('button-list', config);
    const destination = issues.find(item => item.ruleId === 'general-external-url-destination');
    expect(destination).toBeDefined();
    expect(destination.severity).toBe(SEVERITY.WARNING);
    expect(destination.explanation).toContain('example.com');
  });

  test('empty: no URL means nothing to surface', () => {
    const config = buildConfig('pricing-comparison');
    config.items.forEach(item => { item.actionUrl = ''; });
    const issues = issuesFor('pricing-comparison', config);
    expect(issues.some(item => item.ruleId === 'general-external-url-destination')).toBe(false);
  });

  test('an invalid URL is only reported as Blocking (general-invalid-url), not also as this advisory', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Broken link', content: 'not a url' }];
    const issues = issuesFor('button-list', config);
    expect(issues.some(item => item.ruleId === 'general-invalid-url')).toBe(true);
    expect(issues.some(item => item.ruleId === 'general-external-url-destination')).toBe(false);
  });

  test('the displayed destination is sanitizeURL\'s own canonicalized value, sanitized before display', () => {
    const config = buildConfig('button-list');
    config.items = [{ title: 'Download', content: 'https://EXAMPLE.com/Guide' }];
    const issues = issuesFor('button-list', config);
    const destination = issues.find(item => item.ruleId === 'general-external-url-destination');
    expect(destination.explanation).not.toContain('<script');
  });
});

describe('P07: requiredContrastRatio — WCAG large-text exception', () => {
  test('normal-size, normal-weight text requires 4.5:1', () => {
    expect(requiredContrastRatio(14, 400)).toBe(4.5);
  });

  test('normal-weight text just under the 24px large-text bar still requires 4.5:1', () => {
    expect(requiredContrastRatio(23.9, 400)).toBe(4.5);
  });

  test('normal-weight text at/above 24px only requires 3:1', () => {
    expect(requiredContrastRatio(24, 400)).toBe(3);
    expect(requiredContrastRatio(32, 400)).toBe(3);
  });

  test('bold (700+) text at/above 18.66px only requires 3:1', () => {
    expect(requiredContrastRatio(18.66, 700)).toBe(3);
    expect(requiredContrastRatio(20, 900)).toBe(3);
  });

  test('bold text just under 18.66px still requires 4.5:1', () => {
    expect(requiredContrastRatio(18, 700)).toBe(4.5);
  });

  test('a weight of exactly 600 (semi-bold, not bold) does not qualify for the large-text exception below 24px', () => {
    expect(requiredContrastRatio(20, 600)).toBe(4.5);
  });

  test('defaults to normal weight (400) when none is supplied', () => {
    expect(requiredContrastRatio(14)).toBe(4.5);
  });
});

describe('P07: general-insufficient-contrast reports the correct threshold in its message', () => {
  test('the failing-contrast message names 4.5:1 for these normal-size pairs', () => {
    const failingTheme = { ...theme, tokens: { ...theme.tokens, text: '#AAAAAA', surface: '#FFFFFF' } };
    const issues = collectSyncIssues({
      componentId: 'accordion', schema: getComponentById(COMPONENT_REGISTRY, 'accordion').editorSchema,
      config: buildConfig('accordion'), theme: failingTheme, componentOverrides: {},
      settings: { mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 } }
    });
    const contrastIssue = issues.find(item => item.ruleId === 'general-insufficient-contrast' && item.explanation.includes('Body text'));
    expect(contrastIssue).toBeDefined();
    expect(contrastIssue.explanation).toMatch(/4\.5:1 for normal text/);
  });
});

describe('P07: media-oversized-file shows the actual measured size and the configured threshold', () => {
  test('the message includes both real numbers, not just "too large"', () => {
    const config = buildConfig('hotspots');
    config.backgroundImage = {
      source: 'upload', mediaId: 'media-1', schemaVersion: 1, kind: 'image', name: 'photo.png',
      mimeType: 'image/png', size: 15 * 1024 * 1024, createdAt: '2026-01-01T00:00:00.000Z' // 15MB > 10MB default limit
    };
    const issues = issuesFor('hotspots', config);
    const oversized = issues.find(item => item.ruleId === 'media-oversized-file');
    expect(oversized).toBeDefined();
    expect(oversized.explanation).toContain('15.00 MB');
    expect(oversized.explanation).toContain('10.00 MB');
  });
});

// P07: clipping-risk and mobile-overflow need a real hidden-iframe DOM measurement
// (js/dom-measurement.js) that only a real browser can perform meaningfully — jsdom has no
// layout engine, so scrollHeight/scrollWidth/clientWidth are always 0 there, making a
// jsdom-based test of the actual measurement meaningless. The threshold/message logic
// itself is still fully unit-tested here by injecting a synthetic, already-resolved
// `domMeasurement` value directly — exactly the shape app.js's attachDomMeasurement()
// would have produced from a real measurement. The real hidden-iframe plumbing (iframe
// creation, postMessage round-trip, cleanup) is covered by tests/e2e/preflight.spec.js
// against an actual browser instead.
describe('P07: general-clipping-risk / general-mobile-overflow — DOM-measurement rules', () => {
  const schema = getComponentById(COMPONENT_REGISTRY, 'accordion').editorSchema;
  const baseCtx = () => ({
    componentId: 'accordion', schema, config: buildConfig('accordion'), theme, componentOverrides: {},
    settings: { mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 } }, mediaStore: { get: async () => undefined }
  });

  test('undefined domMeasurement (not attempted) never adds either DOM-measurement rule', async () => {
    const issues = await runPreflight(baseCtx());
    expect(issues.some(item => item.ruleId.startsWith('general-clipping-risk'))).toBe(false);
    expect(issues.some(item => item.ruleId.startsWith('general-mobile-overflow'))).toBe(false);
  });

  test('null domMeasurement (attempted and failed) surfaces both as manual-check Recommendations', async () => {
    const issues = await runPreflight({ ...baseCtx(), domMeasurement: null });
    const clipping = issues.find(item => item.ruleId === 'general-clipping-risk-unmeasured');
    const overflow = issues.find(item => item.ruleId === 'general-mobile-overflow-unmeasured');
    expect(clipping?.severity).toBe(SEVERITY.RECOMMENDATION);
    expect(overflow?.severity).toBe(SEVERITY.RECOMMENDATION);
    expect(clipping.explanation).toMatch(/manually check/i);
  });

  test('pass: content well under the 500px iframe-export height and no mobile overflow', async () => {
    const issues = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 300, mobileOverflowPx: 0 } });
    expect(issues.some(item => item.ruleId === 'general-clipping-risk')).toBe(false);
    expect(issues.some(item => item.ruleId === 'general-mobile-overflow')).toBe(false);
  });

  test('boundary: exactly at the clipping margin is not flagged, one px over is', async () => {
    const atBoundary = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 520, mobileOverflowPx: 0 } }); // 500 + 20px margin
    expect(atBoundary.some(item => item.ruleId === 'general-clipping-risk')).toBe(false);
    const overBoundary = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 521, mobileOverflowPx: 0 } });
    expect(overBoundary.some(item => item.ruleId === 'general-clipping-risk')).toBe(true);
  });

  test('fail: content taller than the iframe export height is a heuristic Warning, labeled as such, naming both formats', async () => {
    const issues = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 900, mobileOverflowPx: 0 } });
    const clipping = issues.find(item => item.ruleId === 'general-clipping-risk');
    expect(clipping.severity).toBe(SEVERITY.WARNING);
    expect(clipping.explanation).toMatch(/heuristic/i);
    expect(clipping.explanation).toMatch(/confirm in rise/i);
    expect(clipping.explanation).toContain('900px');
    expect(clipping.explanation).toContain('500px');
  });

  test('boundary: exactly at the mobile-overflow tolerance is not flagged, one px over is', async () => {
    const atTolerance = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 300, mobileOverflowPx: 2 } });
    expect(atTolerance.some(item => item.ruleId === 'general-mobile-overflow')).toBe(false);
    const overTolerance = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 300, mobileOverflowPx: 3 } });
    expect(overTolerance.some(item => item.ruleId === 'general-mobile-overflow')).toBe(true);
  });

  test('fail: overflowing content at mobile width is a heuristic Warning naming the 375px width', async () => {
    const issues = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 300, mobileOverflowPx: 40 } });
    const overflow = issues.find(item => item.ruleId === 'general-mobile-overflow');
    expect(overflow.severity).toBe(SEVERITY.WARNING);
    expect(overflow.explanation).toMatch(/heuristic/i);
    expect(overflow.explanation).toMatch(/confirm in rise/i);
    expect(overflow.explanation).toContain('375px');
    expect(overflow.explanation).toContain('40px');
  });

  test('a partial measurement (height measured, width failed) reports one rule cleanly and the other as unmeasured', async () => {
    const issues = await runPreflight({ ...baseCtx(), domMeasurement: { desktopContentHeight: 300, mobileOverflowPx: null } });
    expect(issues.some(item => item.ruleId === 'general-clipping-risk')).toBe(false);
    expect(issues.some(item => item.ruleId === 'general-mobile-overflow-unmeasured')).toBe(true);
  });
});

// Shared between audio-player and video-frame (js/validation.js#checkMediaChapterAndTranscriptRules)
// — same delimited-text chapters/transcriptSegments shape on both components, only the
// ruleId/category prefix differs by componentId.
describe.each(['audio-player', 'video-frame'])('%s: chapters/transcript Preflight rules', componentId => {
  test('a chapter row with an invalid timestamp is a Warning naming the row, not a Blocking issue', () => {
    const config = buildConfig(componentId, { chapters: 'not-a-time | Intro' });
    const issues = issuesFor(componentId, config);
    const found = issues.find(item => item.ruleId === `${componentId}-invalid-chapter-line`);
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.WARNING);
    expect(found.explanation).toContain('row 1');
    expect(bySeverity(issues, SEVERITY.BLOCKING)).toEqual([]);
  });

  test('a chapter row with a timestamp but no title is the same Warning', () => {
    const config = buildConfig(componentId, { chapters: '0:30 | ' });
    const issues = issuesFor(componentId, config);
    expect(ruleIds(issues)).toContain(`${componentId}-invalid-chapter-line`);
  });

  test('two chapters sharing a timestamp produce a duplicate-timestamp Warning naming both titles', () => {
    const config = buildConfig(componentId, { chapters: '0:00 | First\n0:00 | Second' });
    const issues = issuesFor(componentId, config);
    const found = issues.find(item => item.ruleId === `${componentId}-duplicate-chapter-timestamps`);
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.WARNING);
    expect(found.explanation).toContain('First');
    expect(found.explanation).toContain('Second');
  });

  test('well-formed, non-duplicate chapters produce no chapter-related issues at all', () => {
    const config = buildConfig(componentId, { chapters: '0:00 | Intro | Welcome\n0:30 | Middle | Halfway' });
    const issues = issuesFor(componentId, config);
    expect(issues.some(item => item.ruleId.includes('chapter'))).toBe(false);
  });

  test('a synchronized transcript row with an invalid timestamp is a Warning', () => {
    const config = buildConfig(componentId, { transcriptSegments: 'not-a-time | Hello' });
    const issues = issuesFor(componentId, config);
    const found = issues.find(item => item.ruleId === `${componentId}-invalid-transcript-segment`);
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.WARNING);
  });

  test('a well-formed synchronized transcript produces no transcript-segment issues', () => {
    const config = buildConfig(componentId, { transcriptSegments: '0:00 | Alex | Welcome to the show.' });
    const issues = issuesFor(componentId, config);
    expect(issues.some(item => item.ruleId === `${componentId}-invalid-transcript-segment`)).toBe(false);
  });

  test('no chapters or transcript segments authored at all produces zero issues from this rule', () => {
    const config = buildConfig(componentId);
    const issues = issuesFor(componentId, config);
    expect(issues.some(item => item.ruleId.startsWith(`${componentId}-invalid-chapter`) || item.ruleId.startsWith(`${componentId}-duplicate-chapter`) || item.ruleId.startsWith(`${componentId}-invalid-transcript`))).toBe(false);
  });
});

describe('Prompt 8: AT&T Brand Compliance Preflight Rules', () => {
  test('brand-color-literal: non-brand color override is a Blocking error', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { primary: '#FF0000' }
    });
    const found = issues.find(item => item.ruleId === 'brand-color-literal');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.BLOCKING);
    expect(found.explanation).toContain('#FF0000');
  });

  test('brand-color-literal: approved AT&T brand tokens pass with zero errors', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { primary: '#00388F', accent: '#009FDB' }
    });
    expect(issues.some(item => item.ruleId === 'brand-color-literal')).toBe(false);
  });

  test('brand-font-family: non-Aleck font family is a Blocking error', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { fontFamily: 'Comic Sans MS' }
    });
    const found = issues.find(item => item.ruleId === 'brand-font-family');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.BLOCKING);
    expect(found.explanation).toContain('Comic Sans MS');
  });

  test('brand-font-family: ATT Aleck Sans passes cleanly', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { fontFamily: 'ATT Aleck Sans' }
    });
    expect(issues.some(item => item.ruleId === 'brand-font-family')).toBe(false);
  });

  test('brand-font-size-floor: body font size below 16px is a Blocking error', () => {
    const config = buildConfig('accordion', { bodyFontSize: 14 });
    const issues = issuesFor('accordion', config);
    const found = issues.find(item => item.ruleId === 'brand-font-size-floor');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.BLOCKING);
    expect(found.explanation).toContain('14px');
  });

  test('brand-font-size-floor: 16px body copy passes cleanly', () => {
    const config = buildConfig('accordion', { bodyFontSize: 16 });
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'brand-font-size-floor')).toBe(false);
  });

  test('brand-icon-source: emoji character in title or content is a Blocking error', () => {
    const config = buildConfig('accordion');
    config.items[0].title = '🌟 Feature Overview';
    const issues = issuesFor('accordion', config);
    const found = issues.find(item => item.ruleId === 'brand-icon-source');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.BLOCKING);
    expect(found.explanation).toContain('🌟');
  });

  test('brand-icon-source: clean text with no emoji passes cleanly', () => {
    const config = buildConfig('accordion');
    const issues = issuesFor('accordion', config);
    expect(issues.some(item => item.ruleId === 'brand-icon-source')).toBe(false);
  });

  test('brand-contrast-ratio: AT&T Blue (#009FDB) text on white is flagged as a Warning', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { text: '#009FDB' }
    });
    const found = issues.find(item => item.ruleId === 'brand-contrast-ratio');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.WARNING);
    expect(found.explanation).toContain('#009FDB');
    expect(found.explanation).toContain('24px');
  });

  test('brand-focus-visible: removing focus outline is a Warning', () => {
    const issues = issuesFor('accordion', buildConfig('accordion'), {
      componentOverrides: { focusOutline: 'none' }
    });
    const found = issues.find(item => item.ruleId === 'brand-focus-visible');
    expect(found).toBeDefined();
    expect(found.severity).toBe(SEVERITY.WARNING);
    expect(found.explanation).toContain('Cobalt');
  });
});

