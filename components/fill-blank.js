import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeHTML, serializeForInlineScript } from '../js/utilities.js';
import { validateFillBlankAnswers, combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';

const HINT_ICON = getAttIconSvg('information-circle', { width: 14, height: 14, ariaHidden: true });
const CHECK_ICON = getAttIconSvg('check-circle-filled', { width: 13, height: 13, ariaHidden: true });
const CROSS_ICON = getAttIconSvg('close-circle-filled', { width: 13, height: 13, ariaHidden: true });

/**
 * Fill-in-the-Blank Component Configuration
 * @typedef {Object} FillBlankConfig
 * @property {boolean} [fuzzyMatch] - Allows 1-character typo tolerance
 * @property {boolean} [instantValidation] - Validates live as the learner types
 * @property {Array<{title: string, content: string, hint?: string}>} items
 */

export const id = 'fill-blank';
export const name = 'Fill-in-the-Blank';
export const category = 'knowledge';

/** @type {FillBlankConfig} */
export const defaultConfig = {
  fuzzyMatch: true,
  instantValidation: false,
  items: [
    { title: 'Articulate Rise uses [blank] to display custom interactive content.', content: 'iframes, iframe, embed, web objects', hint: 'Think of the standard HTML tag used to embed one page within another.' },
    { title: 'To keep web builds lightweight, use [blank] CSS styles.', content: 'vanilla, native, pure', hint: 'Refers to unadulterated, standard CSS without bulky preprocessors.' }
  ]
};
export const editorSchema = getEditorSchema(id);

/** How many [blank] tokens a sentence has. */
export function countBlanks(sentence) {
  return (String(sentence || '').match(/\[blank\]/gi) || []).length;
}

/**
 * The clues for an item, as { blank, text } entries. A sentence with several blanks and a clue field
 * of several lines gives each blank its own clue (line 1 -> blank 1, and so on; an empty line means
 * no clue for that blank). Anything else - one blank, or a single-line clue - is one clue for the
 * whole sentence, as before.
 */
export function getBlankClues(item) {
  const raw = String((item && item.hint) || '').trim();
  if (!raw) return [];
  const total = countBlanks(item && item.title);
  const lines = raw.split(/\r?\n/).map(line => line.trim());
  if (total <= 1 || lines.length <= 1) {
    return [{ blank: null, text: raw.replace(/\s*\r?\n\s*/g, ' ') }];
  }
  return lines.slice(0, total).map((text, blank) => ({ blank, text })).filter(clue => clue.text);
}

/**
 * The accepted-answer text for each blank in an item, in order. A sentence with one blank uses the
 * whole answer field (commas, pipes or semicolons separate synonyms, as before). A sentence with
 * several blanks takes one line per blank, with synonyms separated by commas on each line.
 */
export function getBlankAnswers(item) {
  const total = countBlanks(item && item.title);
  const raw = String((item && item.content) || '');
  if (total <= 1) return [raw];
  const lines = raw.split(/\r?\n/).map(line => line.trim());
  return Array.from({ length: total }, (_, i) => lines[i] || '');
}

export function generateHTML(config, instanceId) {
  const instantValidation = config.instantValidation === true;

  return `
    <div class="fill-blank-container" id="${instanceId}-container" aria-describedby="${instanceId}-blank-instructions">
      <p id="${instanceId}-blank-instructions" class="sr-only">Fill in each blank, then check your answers.</p>
      ${config.items.map((item, idx) => {
        const sentence = item.title || '';
        const blankTotal = countBlanks(sentence);
        let blankNumber = 0;
        const blanked = sentence.replace(/\[blank\]/gi, () => {
          const n = blankNumber++;
          const inputId = n === 0 ? `${instanceId}-input-${idx}` : `${instanceId}-input-${idx}-${n}`;
          const label = blankTotal > 1 ? `Answer ${n + 1} of ${blankTotal} for sentence ${idx + 1}` : `Answer for sentence ${idx + 1}`;
          return `<input type="text" class="blank-input" data-index="${idx}" data-blank="${n}" id="${inputId}" aria-label="${label}" aria-describedby="${instanceId}-blank-status-${idx}" autocomplete="off" spellcheck="false">`;
        });
        return `
          <div class="blank-sentence-card" id="${instanceId}-card-${idx}">
            <div class="blank-sentence-main">
              <span class="sentence-num">${idx + 1}</span>
              <div class="blank-sentence-content">
                ${blanked}
                <span id="${instanceId}-blank-status-${idx}" class="blank-status-badge" role="status" aria-live="polite"></span>
              </div>
            </div>
            ${(() => {
              const clues = getBlankClues(item);
              if (!clues.length) return '';
              return `<div class="blank-hint-rows">${clues.map(clue => {
                const key = clue.blank === null ? `${idx}` : `${idx}-${clue.blank}`;
                const label = clue.blank === null ? 'Need a clue?' : `Clue for blank ${clue.blank + 1}`;
                return `<div class="blank-hint-row">
                <button type="button" class="blank-hint-btn" data-hint-idx="${key}" id="${instanceId}-hint-btn-${key}" aria-expanded="false" aria-controls="${instanceId}-hint-box-${key}">${HINT_ICON} ${label}</button>
                <div class="blank-hint-box" id="${instanceId}-hint-box-${key}" hidden><strong>Clue${clue.blank === null ? '' : ` ${clue.blank + 1}`}:</strong> ${escapeHTML(clue.text)}</div>
              </div>`;
              }).join('')}</div>`;
            })()}
          </div>
        `;
      }).join('')}
      ${!instantValidation ? `<button type="button" class="quiz-submit-btn" id="${instanceId}-check-btn">Check answers</button>` : ''}
      <div id="${instanceId}-blank-feedback-box" class="quiz-feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" style="display:none;"></div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .fill-blank-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .blank-sentence-card {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: var(--att-space-4, 14px);
    }
    .blank-sentence-card:last-child {
      border-bottom: none;
    }
    .blank-sentence-main {
      display: flex;
      gap: var(--att-space-3, 12px);
      align-items: flex-start;
    }
    .sentence-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: var(--border-color);
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--att-fs-body-sm, 13px);
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .blank-sentence-content {
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.6);
      max-width: 70ch;
      color: var(--text-main);
    }
    .blank-hint-rows {
      display: flex;
      flex-wrap: wrap;
      gap: var(--pmi-space-2, 8px) var(--pmi-space-3, 12px);
      align-items: flex-start;
    }
    .blank-input {
      border: 1.5px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-sm, 6px);
      background-color: var(--bg-card, #FFFFFF);
      padding: 6px 12px;
      font-size: var(--att-fs-body, 16px);
      font-weight: 600;
      color: var(--text-main);
      min-width: 140px;
      min-height: 38px;
      text-align: center;
      transition: all 0.2s ease;
      box-sizing: border-box;
      margin: 0 4px;
    }
    .blank-input:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
      border-color: var(--primary);
    }
    .blank-input.is-correct {
      border-color: var(--success);
      color: var(--success);
      background-color: var(--success-tint);
    }
    .blank-input.is-incorrect {
      border-color: var(--danger);
      color: var(--danger);
      background-color: var(--danger-tint);
    }
    .blank-status-badge {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      margin-left: 8px;
      display: inline-block;
    }
    .blank-hint-row {
      margin-left: 36px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .blank-hint-btn {
      background: none;
      border: none;
      color: var(--primary);
      font-size: var(--att-fs-body-sm, 13px);
      font-weight: 600;
      cursor: pointer;
      padding: 2px 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .blank-hint-btn:hover {
      text-decoration: underline;
    }
    .blank-hint-box {
      background-color: var(--bg-body, #F3F4F5);
      border: 1px dashed var(--border-color);
      border-radius: var(--att-radius-sm, 6px);
      padding: 6px 12px;
      font-size: var(--att-fs-body-sm, 13px);
      color: var(--text-muted);
      animation: fadeIn 0.2s ease;
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
    .quiz-feedback {
      margin-top: var(--att-space-4, 16px);
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
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
    }`;
}

export function generateJS(config, instanceId) {
  const fuzzyMatch = config.fuzzyMatch !== false;
  const instantValidation = config.instantValidation === true;
  // The failed-attempt message only points at clues when the author wrote some.
  const hasClues = config.items.some(item => getBlankClues(item).length > 0);

  return `
    var items = ${serializeForInlineScript(config.items)};
    var hasClues = ${hasClues};
    var fbCheckIcon = ${JSON.stringify(CHECK_ICON)};
    var fbCrossIcon = ${JSON.stringify(CROSS_ICON)};
    var fuzzyEnabled = ${fuzzyMatch};
    var instantValidation = ${instantValidation};

    function levenshteinDistance(a, b) {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      var matrix = [];
      for (var i = 0; i <= b.length; i++) { matrix[i] = [i]; }
      for (var j = 0; j <= a.length; j++) { matrix[0][j] = j; }
      for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
          }
        }
      }
      return matrix[b.length][a.length];
    }

    function checkAnswerMatch(userVal, rawSolutions) {
      if (!userVal) return false;
      var cleanUser = userVal.trim().toLowerCase();
      // Split by commas, semicolons, or pipes for multiple accepted synonyms
      var validVariants = rawSolutions.split(/[,|;]/).map(function(v) { return v.trim().toLowerCase(); }).filter(Boolean);

      return validVariants.some(function(variant) {
        if (cleanUser === variant) return true;
        if (fuzzyEnabled && variant.length >= 4) {
          return levenshteinDistance(cleanUser, variant) <= 1;
        }
        return false;
      });
    }

    function splitBlankAnswers(item) {
      var total = ((item.title || '').match(/\\[blank\\]/gi) || []).length;
      var raw = String(item.content || '');
      if (total <= 1) return [raw];
      var lines = raw.split(/\\r?\\n/).map(function(line) { return line.trim(); });
      var out = [];
      for (var i = 0; i < total; i++) out.push(lines[i] || '');
      return out;
    }

    function checkBlanks() {
      var allCorrect = true;
      var anyEmpty = false;

      items.forEach(function(item, idx) {
        var answers = splitBlankAnswers(item);
        var badge = document.getElementById('${instanceId}-blank-status-' + idx);
        var correctCount = 0;
        var filledCount = 0;

        answers.forEach(function(answer, n) {
          var input = document.getElementById('${instanceId}-input-' + idx + (n === 0 ? '' : '-' + n));
          if (!input) return;
          var val = input.value;
          if (!val.trim()) anyEmpty = true; else filledCount++;
          var isCorrect = checkAnswerMatch(val, answer);

          input.classList.remove('is-correct', 'is-incorrect');
          if (isCorrect) {
            correctCount++;
            input.classList.add('is-correct');
            input.setAttribute('aria-invalid', 'false');
          } else if (val.trim()) {
            allCorrect = false;
            input.classList.add('is-incorrect');
            input.setAttribute('aria-invalid', 'true');
          } else {
            allCorrect = false;
            input.removeAttribute('aria-invalid');
          }
        });

        // A sentence counts toward progress once every blank in it is right.
        if (correctCount === answers.length) viewedItems.add(idx); else viewedItems.delete(idx);

        if (badge) {
          badge.style.color = 'var(--att-cta-bg, #00388F)';
          if (correctCount === answers.length) {
            badge.innerHTML = fbCheckIcon + ' Correct';
          } else if (filledCount > 0) {
            badge.innerHTML = fbCrossIcon + (answers.length > 1 ? ' ' + correctCount + ' of ' + answers.length + ' correct' : ' Incorrect');
          } else {
            badge.textContent = '';
          }
        }
      });

      updateProgress();

      var feedback = document.getElementById('${instanceId}-blank-feedback-box');
      if (feedback && !instantValidation) {
        feedback.style.display = 'block';
        if (allCorrect && !anyEmpty) {
          feedback.className = 'quiz-feedback correct';
          feedback.innerHTML = '<strong>Excellent!</strong> All answers are correct.';
          updateTrackerComplete();
        } else {
          feedback.className = 'quiz-feedback wrong';
          feedback.innerHTML = '<strong>Some answers need adjustment.</strong> ' + (hasClues ? 'Review the clues or check your spelling.' : 'Check your spelling and try again.');
        }
        feedback.focus();
      }

      if (allCorrect && !anyEmpty) {
        updateTrackerComplete();
        lockAnswers();
      }
    }

    // Once everything is right the answers stay as they are; a wrong attempt stays editable so it can be retried.
    function lockAnswers() {
      document.querySelectorAll('.blank-input').forEach(function(input) {
        input.readOnly = true;
        input.setAttribute('aria-readonly', 'true');
      });
      var checkBtn = document.getElementById('${instanceId}-check-btn');
      if (checkBtn) checkBtn.setAttribute('aria-disabled', 'true');
    }

    function initComponent() {
      var checkBtn = document.getElementById('${instanceId}-check-btn');
      if (checkBtn) checkBtn.addEventListener('click', checkBlanks);

      document.querySelectorAll('.blank-input').forEach(function(input) {
        if (instantValidation) {
          input.addEventListener('input', checkBlanks);
        }
        input.addEventListener('keydown', function(event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            checkBlanks();
          }
        });
      });

      document.querySelectorAll('.blank-hint-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = btn.getAttribute('data-hint-idx');
          var box = document.getElementById('${instanceId}-hint-box-' + idx);
          if (box) {
            var expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!expanded));
            box.hidden = expanded;
          }
        });
      });
    }`;
}

/**
 * Validates fill-in-the-blank component configuration.
 * @param {FillBlankConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [
    validateFillBlankAnswers(config.items)
  ];
  
  if (Array.isArray(config.items)) {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Question ${index + 1}: Sentence with [blank] is required.` });
      }
      if (!item.title.includes('[blank]')) {
        results.push({ valid: false, error: `Question ${index + 1}: Sentence must contain [blank] placeholder.` });
      }
      const blankTotal = countBlanks(item.title);
      if (blankTotal > 1) {
        const missing = getBlankAnswers(item).findIndex(answer => !answer);
        if (missing !== -1) {
          results.push({ valid: false, error: `Question ${index + 1}: The sentence has ${blankTotal} blanks, so the answers need one line per blank. Blank ${missing + 1} has no answer.` });
        }
      }
    });
  }
  
  return combineValidationResults(results);
}
