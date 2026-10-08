import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeHTML, sanitizeRichText, serializeForInlineScript, richInline } from '../js/utilities.js';
import { validateQuizAnswers, combineValidationResults } from '../js/validation-utils.js';

/**
 * Multiple Choice Component Configuration
 * @typedef {Object} MultipleChoiceConfig
 * @property {Array<{label: string, content: string, correct: boolean}>} items - Array of answer options
 * @property {boolean} [mcConfidenceMode] - Enables the confidence self-rating step before submit
 * @property {boolean} [mcRequireConfidence] - Blocks submit until a confidence level is chosen
 * @property {string} [mcConfidenceLowLabel] - Label for the low-confidence option
 * @property {string} [mcConfidenceMidLabel] - Label for the mid-confidence option
 * @property {string} [mcConfidenceHighLabel] - Label for the high-confidence option
 * @property {number} [mcMaxAttempts] - Attempts allowed before the question concludes (default 1, no retry)
 * @property {boolean} [mcShowCorrectAfterFinal] - Reveals the correct option after the final attempt
 * @property {string} [mcHintText] - Hint shown after an incorrect attempt, if attempts remain
 * @property {string} [mcFinalExplanation] - Explanation shown once the question concludes
 * @property {boolean} [mcAllowReset] - Shows a "Try Again" action once concluded
 * @property {boolean} [mcShowResultSummary] - Shows a confidence + correctness interpretation once concluded
 * @property {string} [mcSubmitButtonText] - Custom label for the submit button (default "Submit Answer")
 */

export const id = 'multiple-choice';
export const name = 'Multiple Choice Check';
export const category = 'knowledge';

/** @type {MultipleChoiceConfig} */
export const defaultConfig = {
  // Standard mode preserves the original one-shot submit/feedback flow exactly —
  // mcMaxAttempts defaults to 1 (no retry), and every other field below is additive/
  // optional, so a project saved before this feature existed behaves identically.
  mcConfidenceMode: false,
  mcRequireConfidence: false,
  mcConfidenceLowLabel: 'Not sure',
  mcConfidenceMidLabel: 'Somewhat sure',
  mcConfidenceHighLabel: 'Very sure',
  mcMaxAttempts: 1,
  mcShowCorrectAfterFinal: false,
  mcHintText: '',
  mcFinalExplanation: '',
  mcAllowReset: false,
  mcShowResultSummary: false,
  mcSubmitButtonText: 'Submit Answer',
  items: [
    { label: 'Option A (Correct)', content: 'Micro-learning helps memory retention.', correct: true },
    { label: 'Option B', content: 'Courses must be at least 1 hour long.', correct: false },
    { label: 'Option C', content: 'Instructional text should be very dense.', correct: false }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const confidenceMode = config.mcConfidenceMode === true;
  const confidenceLevels = [
    { value: 'low', label: config.mcConfidenceLowLabel || 'Not sure' },
    { value: 'mid', label: config.mcConfidenceMidLabel || 'Somewhat sure' },
    { value: 'high', label: config.mcConfidenceHighLabel || 'Very sure' }
  ];
  const hintText = escapeHTML(config.mcHintText || '');
  return `<div class="quiz-block">
    <div class="quiz-options" role="radiogroup" aria-label="Answer choices">${config.items.map((item, index) => `
    <div class="quiz-option" role="radio" tabindex="${index === 0 ? '0' : '-1'}" aria-checked="false" data-idx="${index}"><div class="option-check-circle" aria-hidden="true"></div><div class="option-text">${item.label ? sanitizeRichText(item.label) : richInline(item.title, 'Option Label')}</div><span class="option-correct-flag" hidden> — Correct answer</span></div>`).join('')}</div>
    ${confidenceMode ? `
    <div class="quiz-confidence-block">
      <div class="quiz-confidence-label" id="${instanceId}-confidence-label">How confident are you in this answer?</div>
      <div class="quiz-confidence-options" role="radiogroup" aria-labelledby="${instanceId}-confidence-label">
        ${confidenceLevels.map((level, index) => `<div class="quiz-confidence-option" role="radio" tabindex="${index === 0 ? '0' : '-1'}" aria-checked="false" data-confidence="${level.value}">${escapeHTML(level.label)}</div>`).join('')}
      </div>
    </div>` : ''}
    <button class="quiz-submit-btn" type="button">${escapeHTML(config.mcSubmitButtonText || 'Submit Answer')}</button>
    <div class="quiz-hint" id="${instanceId}-quiz-hint" role="status" aria-live="polite" hidden><strong>Hint:</strong> ${hintText}</div>
    <div id="${instanceId}-quiz-feedback-box" class="quiz-feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" style="display:none;"></div>
    ${config.mcAllowReset ? '<button type="button" class="quiz-reset-btn" hidden>Try Again</button>' : ''}
  </div>`;
}

export function generateCSS() {
  return `
    .quiz-block {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }

    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
    }

    .quiz-option {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .quiz-option:hover {
      border-color: var(--primary);
    }

    .quiz-option.selected {
      /* Cobalt (--primary) border, not an AT&T Blue tint background: this is the
         selected state of a clickable option, so it needs the Cobalt clickable
         treatment, not an invented translucent brand-color shade. */
      border-color: var(--primary);
      border-width: 2px;
    }

    .quiz-option[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .option-check-circle {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--text-muted);
      position: relative;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }

    /* Selected radio: Cobalt ring with a Cobalt dot, not a filled disc. */
    .quiz-option.selected .option-check-circle {
      border-color: var(--primary);
      background-color: transparent;
    }

    .quiz-option.selected .option-check-circle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--primary);
    }

    .option-text {
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      font-weight: 500;
    }

    .option-correct-flag {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 700;
      color: var(--success);
    }

    .quiz-confidence-block {
      margin-top: var(--att-space-2, 8px);
    }

    .quiz-confidence-label {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: var(--att-space-2, 8px);
    }

    .quiz-confidence-options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
    }

    .quiz-confidence-option {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      padding: 8px 16px;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .quiz-confidence-option.selected {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary) inset;
    }

    .quiz-confidence-option[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .quiz-submit-btn {
      align-self: flex-start;
      margin-top: 10px;
      padding: 10px 24px;
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      border: none;
      background-color: var(--primary);
      color: var(--on-primary);
      font-size: var(--att-fs-body, 16px);
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all var(--animation-speed);
    }

    .quiz-option:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }

    .quiz-option:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    .quiz-confidence-option:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }

    .quiz-confidence-option:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    .quiz-submit-btn:hover {
      background-color: var(--primary-hover);
    }

    .quiz-submit-btn:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }

    .quiz-submit-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    .quiz-submit-btn[aria-disabled="true"] {
      background-color: var(--att-grey-2, #DCDFE3);
      color: var(--att-grey-3, #BDC2C7);
      opacity: 0.7;
      cursor: not-allowed;
    }

    .quiz-reset-btn:active {
      transform: scale(0.98);
    }

    .quiz-reset-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    .quiz-reset-btn {
      align-self: flex-start;
      padding: 8px 20px;
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      border: var(--border-style);
      background-color: transparent;
      color: var(--text-main);
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .quiz-hint {
      padding: var(--att-space-3, 12px) var(--att-space-4, 16px);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      border: 1px dashed var(--border-color);
      font-size: var(--att-fs-body-sm, 14px);
      line-height: 1.5;
      color: var(--text-main);
    }

    .quiz-feedback {
      margin-top: var(--att-space-4, 16px);
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
      animation: fadeIn 0.3s ease;
    }

    .quiz-feedback.correct {
      background-color: var(--success-tint);
      border: 1px solid var(--success);
      color: var(--text-main);
    }

    .quiz-feedback.wrong {
      background-color: var(--danger-tint);
      border: 1px solid var(--danger);
      color: var(--text-main);
    }

    .quiz-feedback-interpretation, .quiz-feedback-explanation {
      display: block;
      margin-top: 8px;
    }`;
}

export function generateJS(config, instanceId) {
  const confidenceMode = config.mcConfidenceMode === true;
  const requireConfidence = confidenceMode && config.mcRequireConfidence === true;
  const maxAttempts = Number.isInteger(config.mcMaxAttempts) && config.mcMaxAttempts > 0 ? config.mcMaxAttempts : 1;
  const showCorrectAfterFinal = config.mcShowCorrectAfterFinal === true;
  const showResultSummary = confidenceMode && config.mcShowResultSummary === true;
  const finalExplanationHtml = config.mcFinalExplanation ? sanitizeRichText(config.mcFinalExplanation) : '';

  return `
    var selectedOptionIndex = null;
    var selectedConfidence = null;
    var attemptsUsed = 0;
    var quizConcluded = false;
    var quizOptions = ${serializeForInlineScript(config.items)};
    var maxAttempts = ${maxAttempts};
    var confidenceMode = ${confidenceMode};
    var requireConfidence = ${requireConfidence};
    var showCorrectAfterFinal = ${showCorrectAfterFinal};
    var showResultSummary = ${showResultSummary};
    var finalExplanationHtml = ${JSON.stringify(finalExplanationHtml)};

    function selectQuizOption(index, element) {
      if (quizConcluded) return;
      selectedOptionIndex = index;
      document.querySelectorAll('.quiz-option').forEach(function(el) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
        el.setAttribute('tabindex', '-1');
      });
      element.classList.add('selected');
      element.setAttribute('aria-checked', 'true');
      element.setAttribute('tabindex', '0');
    }

    function selectConfidence(value, element) {
      if (quizConcluded) return;
      selectedConfidence = value;
      document.querySelectorAll('.quiz-confidence-option').forEach(function(el) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
        el.setAttribute('tabindex', '-1');
      });
      element.classList.add('selected');
      element.setAttribute('aria-checked', 'true');
      element.setAttribute('tabindex', '0');
    }

    // Deliberately not a diagnostic score — a short, supportive nudge only. "Somewhat
    // sure" buckets with "Not sure" here (only "Very sure" counts as high) so the four
    // messages the brief asked for map onto the three configured levels without a fifth,
    // undocumented in-between message.
    function getConfidenceInterpretation(isCorrect, confidence) {
      var high = confidence === 'high';
      if (isCorrect && high) return 'This suggests solid, secure understanding of this concept.';
      if (isCorrect && !high) return 'Correct — reviewing this again may help reinforce it further.';
      if (!isCorrect && high) return 'This may point to a misconception worth revisiting.';
      return 'This looks like a learning gap — worth reviewing further.';
    }

    function revealCorrectOption() {
      document.querySelectorAll('.quiz-option').forEach(function(el) {
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var flag = el.querySelector('.option-correct-flag');
        if (flag && quizOptions[idx] && quizOptions[idx].correct) flag.hidden = false;
      });
    }

    function concludeQuiz() {
      quizConcluded = true;
      document.querySelectorAll('.quiz-option, .quiz-confidence-option').forEach(function(el) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
      });
      var submitBtn = document.querySelector('.quiz-submit-btn');
      if (submitBtn) submitBtn.setAttribute('aria-disabled', 'true');
      var resetBtn = document.querySelector('.quiz-reset-btn');
      if (resetBtn) resetBtn.hidden = false;
    }

    function submitQuiz() {
      if (quizConcluded) return;
      var feedback = document.getElementById('${instanceId}-quiz-feedback-box');
      var hint = document.getElementById('${instanceId}-quiz-hint');

      if (selectedOptionIndex === null) {
        feedback.style.display = 'block';
        feedback.className = 'quiz-feedback wrong';
        feedback.innerHTML = '<strong>Select an option first.</strong>';
        feedback.focus();
        return;
      }
      if (requireConfidence && !selectedConfidence) {
        feedback.style.display = 'block';
        feedback.className = 'quiz-feedback wrong';
        feedback.innerHTML = '<strong>Select a confidence level first.</strong>';
        feedback.focus();
        return;
      }

      var selection = quizOptions[selectedOptionIndex];
      var isCorrect = selection.correct;
      attemptsUsed++;

      feedback.style.display = 'block';
      feedback.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');

      if (isCorrect) {
        feedback.innerHTML = '<strong>Correct!</strong> ' + (selection.content || 'Excellent choices.');
        if (confidenceMode && showResultSummary) {
          feedback.innerHTML += '<span class="quiz-feedback-interpretation">' + getConfidenceInterpretation(true, selectedConfidence) + '</span>';
        }
        if (finalExplanationHtml) {
          feedback.innerHTML += '<span class="quiz-feedback-explanation">' + finalExplanationHtml + '</span>';
        }
        if (hint) hint.hidden = true;
        concludeQuiz();
        updateTrackerComplete();
      } else if (attemptsUsed < maxAttempts) {
        var remaining = maxAttempts - attemptsUsed;
        feedback.innerHTML = '<strong>Incorrect.</strong> ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.';
        if (hint && hint.textContent.trim()) hint.hidden = false;
        selectedOptionIndex = null;
        selectedConfidence = null;
        document.querySelectorAll('.quiz-option').forEach(function(el, idx) {
          el.classList.remove('selected');
          el.setAttribute('aria-checked', 'false');
          el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
        });
        document.querySelectorAll('.quiz-confidence-option').forEach(function(el, idx) {
          el.classList.remove('selected');
          el.setAttribute('aria-checked', 'false');
          el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
        });
      } else {
        feedback.innerHTML = '<strong>Incorrect.</strong> Try reviewing the source documentation again.';
        if (confidenceMode && showResultSummary) {
          feedback.innerHTML += '<span class="quiz-feedback-interpretation">' + getConfidenceInterpretation(false, selectedConfidence) + '</span>';
        }
        if (finalExplanationHtml) {
          feedback.innerHTML += '<span class="quiz-feedback-explanation">' + finalExplanationHtml + '</span>';
        }
        if (hint) hint.hidden = true;
        if (showCorrectAfterFinal) revealCorrectOption();
        concludeQuiz();
      }

      feedback.focus();
    }

    function resetQuiz() {
      quizConcluded = false;
      selectedOptionIndex = null;
      selectedConfidence = null;
      attemptsUsed = 0;

      document.querySelectorAll('.quiz-option').forEach(function(el, idx) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
        el.removeAttribute('aria-disabled');
        el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
        var flag = el.querySelector('.option-correct-flag');
        if (flag) flag.hidden = true;
      });
      document.querySelectorAll('.quiz-confidence-option').forEach(function(el, idx) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
        el.removeAttribute('aria-disabled');
        el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
      });
      var submitBtn = document.querySelector('.quiz-submit-btn');
      if (submitBtn) submitBtn.removeAttribute('aria-disabled');
      var resetBtn = document.querySelector('.quiz-reset-btn');
      if (resetBtn) resetBtn.hidden = true;
      var hint = document.getElementById('${instanceId}-quiz-hint');
      if (hint) hint.hidden = true;
      var feedback = document.getElementById('${instanceId}-quiz-feedback-box');
      if (feedback) { feedback.style.display = 'none'; feedback.innerHTML = ''; }

      var firstOption = document.querySelector('.quiz-option');
      if (firstOption) firstOption.focus();
      announce('Question reset.');
    }

    function initComponent() {
      document.querySelectorAll('.quiz-option[role="radio"]').forEach(function(option) {
        option.addEventListener('click', function() {
          selectQuizOption(parseInt(option.getAttribute('data-idx'), 10), option);
        });
        option.addEventListener('keydown', function(event) {
          if (quizConcluded) return;
          var options = Array.from(document.querySelectorAll('.quiz-option[role="radio"]'));
          var current = options.indexOf(option);
          var next = current;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % options.length;
          else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + options.length) % options.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = options.length - 1;
          else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            selectQuizOption(current, option);
            return;
          } else return;
          event.preventDefault();
          selectQuizOption(next, options[next]);
          options[next].focus();
        });
      });

      document.querySelectorAll('.quiz-confidence-option[role="radio"]').forEach(function(option) {
        option.addEventListener('click', function() {
          selectConfidence(option.getAttribute('data-confidence'), option);
        });
        option.addEventListener('keydown', function(event) {
          if (quizConcluded) return;
          var options = Array.from(document.querySelectorAll('.quiz-confidence-option[role="radio"]'));
          var current = options.indexOf(option);
          var next = current;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % options.length;
          else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + options.length) % options.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = options.length - 1;
          else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            selectConfidence(option.getAttribute('data-confidence'), option);
            return;
          } else return;
          event.preventDefault();
          selectConfidence(options[next].getAttribute('data-confidence'), options[next]);
          options[next].focus();
        });
      });

      var quizSubmitBtn = document.querySelector('.quiz-submit-btn');
      if (quizSubmitBtn) quizSubmitBtn.addEventListener('click', submitQuiz);
      var quizResetBtn = document.querySelector('.quiz-reset-btn');
      if (quizResetBtn) quizResetBtn.addEventListener('click', resetQuiz);
    }`;
}

/**
 * Validates multiple choice component configuration.
 * @param {MultipleChoiceConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [
    validateQuizAnswers(config.items, 'multiple-choice')
  ];

  // Validate each item has required fields
  if (Array.isArray(config.items)) {
    config.items.forEach((item, index) => {
      if (!item.label || !String(item.label).trim()) {
        results.push({ valid: false, error: `Option ${index + 1}: Label is required.` });
      }
    });
  }

  return combineValidationResults(results);
}
