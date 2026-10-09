// Which completion modes make sense for which component, and what each one means there.
//
// The Completion tab offers "Require All Items" and "Require Successful Interaction". The choice was saved but nothing
// read it (only "tracking on or off" reaches the export), so the two behaved identically on every component. Rather
// than invent two behaviours, the editor now offers the one that is true for the component it is editing:
//   - content blocks (accordion, tabs, cards ...) complete once every item has been opened  -> "all-items"
//   - question blocks (quizzes, fill in the blank, sorting, scenario ...) complete on success -> "interaction-success"
//   - audio and video complete when played to the end                                      -> "all-items", worded for media
// Interactive Video has its own completion rule field and keeps both radios unrestricted by this module.

const QUESTION_COMPONENTS = new Set(['multiple-choice', 'multiple-select', 'fill-blank', 'sorting-activity', 'scenario', 'confidence-matrix']);
const MEDIA_COMPONENTS = new Set(['audio-player', 'video-frame']);

/** @param {string} componentId @returns {'questions'|'media'|'content'|'video-rule'} */
export function getCompletionKind(componentId) {
  if (QUESTION_COMPONENTS.has(componentId)) return 'questions';
  if (MEDIA_COMPONENTS.has(componentId)) return 'media';
  if (componentId === 'interactive-video') return 'video-rule';
  return 'content';
}

/** The modes the editor offers for a component, "none" always included. */
export function getAvailableCompletionModes(componentId) {
  const kind = getCompletionKind(componentId);
  if (kind === 'video-rule') return ['none', 'all-items', 'interaction-success'];
  return ['none', kind === 'questions' ? 'interaction-success' : 'all-items'];
}

export const COMPLETION_MODE_WORDING = {
  content: { 'all-items': 'Learners must click or open every item before completion is signaled.' },
  media: { 'all-items': 'Learners must play the audio or video to the end before completion is signaled.' },
  questions: { 'interaction-success': 'Learners must answer correctly, or finish the self-assessment, before completion is signaled.' },
  'video-rule': {
    'all-items': 'Completion follows the Video Completion Rule below.',
    'interaction-success': 'Completion follows the Video Completion Rule below.'
  }
};

/**
 * The mode to show for a project's saved settings. A saved mode the component does not offer (a quiz saved as "all-items",
 * which is what the editor defaulted to) maps to the one it does, so the selection shown is always a real choice.
 * @param {string} componentId
 * @param {{ trackCompletion?: boolean, completionMode?: string }} config
 * @returns {string}
 */
export function resolveCompletionMode(componentId, config) {
  if (!config.trackCompletion) return 'none';
  const available = getAvailableCompletionModes(componentId);
  if (config.completionMode && available.includes(config.completionMode)) return config.completionMode;
  return available.find(mode => mode !== 'none') || 'none';
}
