import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeHTML, sanitizeRichText, serializeForInlineScript, richInline } from '../js/utilities.js';
import { validateQuizAnswers, combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';

const CHECK_ICON = getAttIconSvg('check-circle-filled', { width: 14, height: 14, ariaHidden: true });
const CROSS_ICON = getAttIconSvg('close-circle-filled', { width: 14, height: 14, ariaHidden: true });

/**
 * Multiple Select Component Configuration
 * @typedef {Object} MultipleSelectConfig
 * @property {Array<{label: string, content: string, correct: boolean, remediation?: string}>} items - Array of answer options
 * @property {boolean} [msPartialScoring] - Enables partial credit score calculations and badges
 * @property {number} [msMaxAttempts] - Maximum attempts before question concludes
 * @property {boolean} [msAllowReset] - Shows a Try again action once concluded
 * @property {string} [msFinalExplanation] - Detailed explanation displayed once concluded
 * @property {string} [msSubmitButtonText] - Custom submit button label
 */

export const id = 'multiple-select';
export const name = 'Multiple Select Check';
export const category = 'knowledge';

/** @type {MultipleSelectConfig} */
export const defaultConfig = {
  msPartialScoring: false,
  msMaxAttempts: 1,
  msAllowReset: false,
  msFinalExplanation: '',
  msSubmitButtonText: 'Submit answer',
  items: [
    { label: 'Improves long-term retention', content: 'Spaced, bite-sized review strengthens recall.', correct: true, remediation: 'Recall improves significantly with spaced repetition.' },
    { label: 'Supports mobile learning', content: 'Short segments fit naturally into mobile sessions.', correct: true, remediation: 'Mobile compatibility requires concise learning chunks.' },
    { label: 'Requires no learner interaction', content: 'Interaction is what drives engagement and retention.', correct: false, remediation: 'Active learning requires frequent learner engagement.' },
    { label: 'Replaces the need for assessments', content: 'Micro-learning complements, not replaces, assessment.', correct: false, remediation: 'Assessments remain essential for measuring knowledge retention.' }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const allowReset = config.msAllowReset === true;
  const submitText = config.msSubmitButtonText || 'Submit answer';

  return `
    <div class="quiz-block quiz-multi" id="${instanceId}-block">
      <div class="quiz-options" role="group" aria-label="Answer choices, select all that apply">
        ${config.items.map((item, index) => `
          <div class="quiz-option" role="checkbox" tabindex="${index === 0 ? '0' : '-1'}" aria-checked="false" data-idx="${index}" id="${instanceId}-opt-${index}">
            <div class="option-check-square" aria-hidden="true"></div>
            <div class="option-text-wrap">
              <div class="option-text">${item.label ? sanitizeRichText(item.label) : richInline(item.title, 'Option label')}</div>
              <div class="option-remediation" id="${instanceId}-remed-${index}" style="display:none;" aria-live="polite"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="quiz-actions-row">
        <button class="quiz-submit-btn" type="button" data-quiz-mode="multi" id="${instanceId}-submit-btn">${escapeHTML(submitText)}</button>
        ${allowReset ? `<button type="button" class="quiz-reset-btn" id="${instanceId}-reset-btn" style="display:none;">Try again</button>` : ''}
      </div>
      <div id="${instanceId}-quiz-feedback-box" class="quiz-feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" style="display:none;"></div>
    </div>
  `;
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
      align-items: flex-start;
      gap: var(--att-space-3, 12px);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .quiz-option:hover {
      border-color: var(--primary);
    }
    .quiz-option.selected {
      border-color: var(--primary);
      border-width: 2px;
    }
    .quiz-option[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.75;
    }
    .option-check-square {
      width: 18px;
      height: 18px;
      /* Fixed 4px: --att-radius-sm is 8px, which rounds an 18px box into a circle
         and makes checkboxes indistinguishable from the single-select radios. */
      border-radius: 4px;
      border: 2px solid var(--text-muted);
      position: relative;
      margin-top: 2px;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }
    .quiz-option.selected .option-check-square {
      border-color: var(--primary);
      background-color: var(--primary);
    }
    .quiz-option.selected .option-check-square::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 5px;
      width: 4px;
      height: 8px;
      border: solid var(--on-primary);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .option-text-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }
    .option-text {
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      font-weight: 500;
    }
    .option-remediation {
      font-size: var(--att-fs-body-sm, 13px);
      line-height: 1.4;
      padding: 4px 8px;
      border-radius: var(--att-radius-sm, 6px);
      margin-top: 4px;
    }
    .option-remediation.remed-correct {
      background-color: var(--success-tint);
      color: var(--success);
    }
    .option-remediation.remed-incorrect {
      background-color: var(--danger-tint);
      color: var(--danger);
    }
    .quiz-actions-row {
      display: flex;
      gap: var(--att-space-3, 12px);
      align-items: center;
      margin-top: 10px;
    }
    .quiz-submit-btn {
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
    .quiz-submit-btn:hover {
      background-color: var(--primary-hover);
    }
    .quiz-submit-btn:active {
      transform: scale(0.98);
    }
    .quiz-submit-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .quiz-submit-btn:disabled, .quiz-submit-btn[aria-disabled="true"] {
      background-color: var(--att-grey-2, #DCDFE3);
      color: var(--att-grey-3, #BDC2C7);
      opacity: 0.7;
      cursor: not-allowed;
    }
    .quiz-reset-btn {
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
    .quiz-reset-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .quiz-reset-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
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
    .quiz-feedback.partial {
      background-color: var(--bg-body, #F3F4F5);
      border: 1px solid var(--primary);
      color: var(--text-main);
    }
    .quiz-feedback.wrong {
      background-color: var(--danger-tint);
      border: 1px solid var(--danger);
      color: var(--text-main);
    }
    .quiz-feedback-explanation {
      display: block;
      margin-top: 8px;
    }`;
}

export function generateJS(config, instanceId) {
  const partialScoring = config.msPartialScoring === true;
  const maxAttempts = Number.isInteger(config.msMaxAttempts) && config.msMaxAttempts > 0 ? config.msMaxAttempts : 1;
  const finalExplanationHtml = config.msFinalExplanation ? sanitizeRichText(config.msFinalExplanation) : '';

  return `
    var selectedOptionIndices = new Set();
    var msCheckIcon = ${JSON.stringify(CHECK_ICON)};
    var msCrossIcon = ${JSON.stringify(CROSS_ICON)};
    var quizOptions = ${serializeForInlineScript(config.items)};
    var maxAttempts = ${maxAttempts};
    var attemptsUsed = 0;
    var partialScoring = ${partialScoring};
    var finalExplanationHtml = ${JSON.stringify(finalExplanationHtml)};
    var quizConcluded = false;

    function toggleQuizOption(index, element) {
      if (quizConcluded) return;
      var checked = element.getAttribute('aria-checked') === 'true';
      if (checked) {
        element.classList.remove('selected');
        element.setAttribute('aria-checked', 'false');
        selectedOptionIndices.delete(index);
      } else {
        element.classList.add('selected');
        element.setAttribute('aria-checked', 'true');
        selectedOptionIndices.add(index);
      }
    }

    function concludeMultiQuiz() {
      quizConcluded = true;
      document.querySelectorAll('.quiz-option').forEach(function(el) {
        el.setAttribute('aria-disabled', 'true');
      });
      var submitBtn = document.getElementById('${instanceId}-submit-btn');
      if (submitBtn) submitBtn.setAttribute('aria-disabled', 'true');
      var resetBtn = document.getElementById('${instanceId}-reset-btn');
      if (resetBtn) resetBtn.style.display = 'inline-flex';
    }

    function showRemediationHints() {
      quizOptions.forEach(function(opt, idx) {
        var remedBox = document.getElementById('${instanceId}-remed-' + idx);
        if (!remedBox) return;
        var wasSelected = selectedOptionIndices.has(idx);
        var isCorrect = Boolean(opt.correct);
        var hint = opt.remediation || opt.content || '';

        if (hint) {
          remedBox.style.display = 'block';
          var right = wasSelected === isCorrect;
          remedBox.className = 'option-remediation ' + (right ? 'remed-correct' : 'remed-incorrect');
          var label = right
            ? (opt.correct ? 'Correct selection. ' : 'Correctly skipped. ')
            : (opt.correct ? 'Should be selected. ' : 'Should not be selected. ');
          remedBox.replaceChildren();
          remedBox.insertAdjacentHTML('beforeend', (right ? msCheckIcon : msCrossIcon) + ' ');
          remedBox.appendChild(document.createTextNode(label + hint));
        }
      });
    }

    function submitMultiQuiz() {
      if (quizConcluded) return;
      var feedback = document.getElementById('${instanceId}-quiz-feedback-box');
      if (selectedOptionIndices.size === 0) {
        feedback.style.display = 'block';
        feedback.className = 'quiz-feedback wrong';
        feedback.innerHTML = '<strong>Select at least one option.</strong>';
        feedback.focus();
        return;
      }

      attemptsUsed++;
      var correctIndices = new Set(quizOptions.reduce(function(indices, option, index) {
        if (option.correct) indices.push(index);
        return indices;
      }, []));

      var correctlySelected = 0;
      var incorrectlySelected = 0;
      selectedOptionIndices.forEach(function(idx) {
        if (correctIndices.has(idx)) correctlySelected++;
        else incorrectlySelected++;
      });

      var isAllCorrect = selectedOptionIndices.size === correctIndices.size && correctlySelected === correctIndices.size;
      feedback.style.display = 'block';

      if (isAllCorrect) {
        feedback.className = 'quiz-feedback correct';
        feedback.innerHTML = '<strong>Correct!</strong> You identified all the correct options.';
        if (finalExplanationHtml) feedback.innerHTML += '<span class="quiz-feedback-explanation">' + finalExplanationHtml + '</span>';
        showRemediationHints();
        concludeMultiQuiz();
        updateTrackerComplete();
      } else if (attemptsUsed < maxAttempts) {
        var remaining = maxAttempts - attemptsUsed;
        feedback.className = 'quiz-feedback wrong';
        if (partialScoring) {
          feedback.innerHTML = '<strong>Partial match.</strong> (' + correctlySelected + ' of ' + correctIndices.size + ' correct). ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.';
        } else {
          feedback.innerHTML = '<strong>Incorrect.</strong> ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining. Adjust your selections.';
        }
      } else {
        feedback.className = partialScoring && correctlySelected > 0 ? 'quiz-feedback partial' : 'quiz-feedback wrong';
        if (partialScoring) {
          feedback.innerHTML = '<strong>Completed.</strong> You found ' + correctlySelected + ' of ' + correctIndices.size + ' correct answers.';
        } else {
          feedback.innerHTML = '<strong>Incorrect.</strong> Review the remediation notes below.';
        }
        if (finalExplanationHtml) feedback.innerHTML += '<span class="quiz-feedback-explanation">' + finalExplanationHtml + '</span>';
        showRemediationHints();
        concludeMultiQuiz();
      }
      feedback.focus();
    }

    function resetMultiQuiz() {
      quizConcluded = false;
      attemptsUsed = 0;
      selectedOptionIndices.clear();

      document.querySelectorAll('.quiz-option').forEach(function(el) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
        el.removeAttribute('aria-disabled');
      });

      document.querySelectorAll('.option-remediation').forEach(function(r) {
        r.style.display = 'none';
        r.textContent = '';
      });

      var submitBtn = document.getElementById('${instanceId}-submit-btn');
      if (submitBtn) submitBtn.removeAttribute('aria-disabled');
      var resetBtn = document.getElementById('${instanceId}-reset-btn');
      if (resetBtn) resetBtn.style.display = 'none';
      var feedback = document.getElementById('${instanceId}-quiz-feedback-box');
      if (feedback) { feedback.style.display = 'none'; feedback.innerHTML = ''; }

      var firstOption = document.querySelector('.quiz-option');
      if (firstOption) firstOption.focus();
      announce('Question reset.');
    }

    function initComponent() {
      document.querySelectorAll('.quiz-option[role="checkbox"]').forEach(function(option) {
        option.addEventListener('click', function() {
          toggleQuizOption(parseInt(option.getAttribute('data-idx'), 10), option);
        });
        option.addEventListener('keydown', function(event) {
          var options = Array.from(document.querySelectorAll('.quiz-option[role="checkbox"]'));
          var current = options.indexOf(option);
          var next = current;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % options.length;
          else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + options.length) % options.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = options.length - 1;
          else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            toggleQuizOption(current, option);
            return;
          } else return;
          event.preventDefault();
          option.setAttribute('tabindex', '-1');
          options[next].setAttribute('tabindex', '0');
          options[next].focus();
        });
      });

      var quizSubmitBtn = document.getElementById('${instanceId}-submit-btn');
      if (quizSubmitBtn) quizSubmitBtn.addEventListener('click', submitMultiQuiz);
      var quizResetBtn = document.getElementById('${instanceId}-reset-btn');
      if (quizResetBtn) quizResetBtn.addEventListener('click', resetMultiQuiz);
    }`;
}

/**
 * Validates multiple select component configuration.
 * @param {MultipleSelectConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [
    validateQuizAnswers(config.items, 'multiple-select')
  ];
  
  if (Array.isArray(config.items)) {
    config.items.forEach((item, index) => {
      if (!item.label || !String(item.label).trim()) {
        results.push({ valid: false, error: `Option ${index + 1}: Label is required.` });
      }
    });
  }
  
  return combineValidationResults(results);
}
