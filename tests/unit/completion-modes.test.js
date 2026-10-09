import { describe, expect, test } from 'vitest';
import { COMPLETION_MODE_WORDING, getAvailableCompletionModes, getCompletionKind, resolveCompletionMode } from '../../js/completion-modes.js';
import { COMPONENT_REGISTRY } from '../../js/component-registry.js';

// UAT-011: "Require All Items" and "Require Successful Interaction" saved different values but exported identically.
// The editor now offers the one mode that is true for the component being edited.

describe('which completion mode a component offers', () => {
  test.each(['accordion', 'tab-blocks', 'flip-cards', 'hotspots', 'button-list', 'profile-cards', 'vertical-timeline'])('%s (content): all items only', id => {
    expect(getCompletionKind(id)).toBe('content');
    expect(getAvailableCompletionModes(id)).toEqual(['none', 'all-items']);
  });

  test.each(['multiple-choice', 'multiple-select', 'fill-blank', 'sorting-activity', 'scenario', 'confidence-matrix'])('%s (question): successful interaction only', id => {
    expect(getCompletionKind(id)).toBe('questions');
    expect(getAvailableCompletionModes(id)).toEqual(['none', 'interaction-success']);
  });

  test.each(['audio-player', 'video-frame'])('%s (media): all items, worded for playing to the end', id => {
    expect(getAvailableCompletionModes(id)).toEqual(['none', 'all-items']);
    expect(COMPLETION_MODE_WORDING.media['all-items']).toMatch(/play the audio or video to the end/);
  });

  test('Interactive Video keeps both: its own Video Completion Rule decides', () => {
    expect(getAvailableCompletionModes('interactive-video')).toEqual(['none', 'all-items', 'interaction-success']);
  });

  test('every component in the catalogue gets at least one real mode', () => {
    for (const entry of COMPONENT_REGISTRY) {
      expect(getAvailableCompletionModes(entry.id).length, entry.id).toBeGreaterThan(1);
    }
  });
});

describe('a saved mode the component does not offer', () => {
  test('a quiz saved as "all-items" (the old default) shows successful interaction', () => {
    expect(resolveCompletionMode('multiple-choice', { trackCompletion: true, completionMode: 'all-items' })).toBe('interaction-success');
  });
  test('an accordion saved as "interaction-success" shows all items', () => {
    expect(resolveCompletionMode('accordion', { trackCompletion: true, completionMode: 'interaction-success' })).toBe('all-items');
  });
  test('tracking on with no saved mode picks the component\'s own', () => {
    expect(resolveCompletionMode('fill-blank', { trackCompletion: true })).toBe('interaction-success');
    expect(resolveCompletionMode('tab-blocks', { trackCompletion: true })).toBe('all-items');
  });
  test('tracking off is always "none", whatever was saved', () => {
    expect(resolveCompletionMode('accordion', { trackCompletion: false, completionMode: 'all-items' })).toBe('none');
  });
  test('a valid saved mode is kept', () => {
    expect(resolveCompletionMode('interactive-video', { trackCompletion: true, completionMode: 'interaction-success' })).toBe('interaction-success');
  });
});
