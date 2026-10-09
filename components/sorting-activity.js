import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, serializeForInlineScript, richInline } from '../js/utilities.js';
import { combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Sorting Activity Component Configuration
 * @typedef {Object} SortingActivityConfig
 * @property {boolean} [instantFeedback] - Whether cards validate immediately upon placement
 * @property {boolean} [showMistakes] - Shows mistakes counter HUD
 * @property {boolean} [allowReset] - Shows a Try Again / Reset button
 * @property {Array<{title: string, content?: string, category: string, explanation?: string}>} items - Array of sortable items
 */

export const id = 'sorting-activity';
export const name = 'Sorting Drag-and-Drop';
export const category = 'knowledge';

/** @type {SortingActivityConfig} */
export const defaultConfig = {
  instantFeedback: false,
  showMistakes: true,
  allowReset: true,
  items: [
    { title: 'Vibrant Colors', content: 'Visual token specification', category: 'Design', explanation: 'Colors, typography, and borders form the visual foundation of the design system.' },
    { title: 'Click Triggers', content: 'Action handler configuration', category: 'Logic', explanation: 'Event listeners and state machines control user interaction logic.' },
    { title: 'Rounded Corners', content: 'Component geometry', category: 'Design', explanation: 'Border radii specify geometric rounding across buttons, cards, and chips.' },
    { title: 'Theme Toggles', content: 'State manipulation', category: 'Logic', explanation: 'Dark and light mode state switching requires interactive JavaScript logic.' }
  ]
};
export const editorSchema = getEditorSchema(id);

const arrowsIcon = getAttIconSvg('arrows-vertical-1', { width: 14, height: 14, ariaHidden: true });
const checkIcon = getAttIconSvg('check-circle-filled', { width: 14, height: 14, ariaHidden: true });
const crossIcon = getAttIconSvg('close-circle-filled', { width: 14, height: 14, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const categories = [...new Set(config.items.map(it => it.category || 'Category'))];
  const instantFeedback = config.instantFeedback === true;
  const showMistakes = config.showMistakes !== false;
  const allowReset = config.allowReset !== false;

  return `
    <div class="sorting-activity-container" id="${instanceId}-container" aria-describedby="${instanceId}-sorting-instructions">
      <p id="${instanceId}-sorting-instructions" class="sr-only">For each item, choose its category. Then verify the sorting.</p>
      
      <div class="sorting-hud-bar">
        ${showMistakes ? `<span class="sorting-mistakes-counter" id="${instanceId}-mistakes-counter" role="status" aria-live="polite">Mistakes: 0</span>` : ''}
        ${allowReset ? `<button type="button" class="sorting-reset-btn" id="${instanceId}-reset-btn">Reset activity</button>` : ''}
      </div>

      <div class="sorting-card-pool" role="group" aria-label="Items to sort">
        ${config.items.map((item, idx) => `
          <div class="sorting-draggable" id="${instanceId}-sort-card-${idx}" data-idx="${idx}" data-category="${escapeAttribute(item.category || '')}" role="group" aria-labelledby="${instanceId}-sort-label-${idx}">
            <div class="drag-handle-row">
              <div class="drag-handle" aria-hidden="true">${arrowsIcon}</div>
              <div class="drag-text-wrap">
                <div class="drag-text" id="${instanceId}-sort-label-${idx}">${richInline(item.title, 'Sorting card')}</div>
                ${item.content ? `<div class="drag-sub">${escapeHTML(item.content)}</div>` : ''}
              </div>
            </div>
            <div class="sorting-targets-row">
              ${categories.map(cat => `
                <button type="button" class="target-btn" data-idx="${idx}" data-cat="${escapeAttribute(cat)}" aria-pressed="false">Move to ${escapeHTML(cat)}</button>
              `).join('')}
            </div>
            <div class="sort-status-indicator" id="${instanceId}-indicator-${idx}" role="status" aria-live="polite"></div>
            ${item.explanation ? `<div class="sort-explanation-card" id="${instanceId}-expl-${idx}" style="display:none;" aria-live="polite"><strong>Why:</strong> ${escapeHTML(item.explanation)}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="sorting-categories-columns">
        ${categories.map((cat, catIdx) => `
          <div class="sorting-column" data-column-cat="${escapeAttribute(cat)}" role="group" aria-labelledby="${instanceId}-sorting-column-${catIdx}">
            <div class="column-header" id="${instanceId}-sorting-column-${catIdx}">${escapeHTML(cat)}</div>
            <div class="column-dropzone" id="${instanceId}-sorting-zone-${catIdx}" aria-live="polite"></div>
          </div>
        `).join('')}
      </div>

      ${!instantFeedback ? `<button type="button" class="quiz-submit-btn" id="${instanceId}-verify-btn">Verify sorting</button>` : ''}
      <div id="${instanceId}-sorting-feedback-box" class="quiz-feedback" role="status" aria-live="polite" aria-atomic="true" style="display:none;"></div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .sorting-activity-container {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .sorting-hud-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4px;
    }
    .sorting-mistakes-counter {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 700;
      color: var(--text-muted);
    }
    .sorting-reset-btn {
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      border-radius: var(--att-radius-pill, 999px);
      padding: 6px 16px;
      font-size: var(--att-fs-body-sm, 13px);
      font-weight: 600;
      color: var(--primary);
      cursor: pointer;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .sorting-reset-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .sorting-card-pool {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 20px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }
    .sorting-draggable {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: var(--att-fs-body, 1rem);
      transition: all 0.2s;
    }
    .drag-handle-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .drag-handle {
      color: var(--text-muted);
      display: flex;
      flex-shrink: 0;
    }
    .drag-text-wrap {
      flex: 1;
    }
    .drag-text {
      font-weight: var(--att-fw-medium, 500);
      color: var(--text-main);
    }
    .drag-sub {
      font-size: var(--att-fs-body-sm, 13px);
      color: var(--text-muted);
      margin-top: 2px;
    }
    .sorting-targets-row {
      display: flex;
      gap: var(--att-space-2, 8px);
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .target-btn {
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      padding: 6px 14px;
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .target-btn:hover {
      border-color: var(--primary-hover);
      color: var(--primary-hover);
    }
    .target-btn:active {
      transform: scale(0.98);
    }
    .target-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .target-btn.active {
      border-color: var(--primary);
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .sort-status-indicator {
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
    }
    .sort-explanation-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-left: 3px solid var(--accent);
      border-radius: var(--att-radius-sm, 6px);
      padding: 8px 12px;
      font-size: var(--att-fs-body-sm, 13px);
      line-height: 1.4;
      color: var(--text-main);
      animation: fadeIn 0.2s ease;
    }
    .sorting-categories-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--att-space-4, 16px);
    }
    .sorting-column {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-4, 16px);
    }
    .column-header {
      font-size: var(--att-fs-h3, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      letter-spacing: normal;
      color: var(--accent);
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .column-dropzone {
      min-height: 80px;
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
    }
    .sorted-item-badge {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-pill, 999px);
      padding: 6px 14px;
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
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
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
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
      padding: var(--att-space-4, 16px);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
      animation: fadeIn 0.3s ease;
    }
    .quiz-feedback.correct {
      background-color: var(--success-tint);
      border: 1px solid var(--success);
      color: var(--success);
    }
    .quiz-feedback.wrong {
      background-color: var(--danger-tint);
      border: 1px solid var(--danger);
      color: var(--danger);
    }`;
}

export function generateJS(config, instanceId) {
  const instantFeedback = config.instantFeedback === true;
  return `
    var sortingChoices = {};
    var mistakeCount = 0;
    var sortCheckIcon = ${JSON.stringify(checkIcon)};
    var sortCrossIcon = ${JSON.stringify(crossIcon)};
    var originalCards = ${serializeForInlineScript(config.items)};
    var instantFeedback = ${instantFeedback};

    // Result indicator: an AT&T functional icon (trusted constant) plus a plain
    // text label — the icon carries an aria-hidden decoration, the words carry the
    // meaning (never colour alone), and Cobalt is used for both states.
    function setSortIndicator(el, iconSvg, label) {
      el.replaceChildren();
      el.insertAdjacentHTML('beforeend', iconSvg + ' ');
      el.appendChild(document.createTextNode(label));
      el.style.color = 'var(--att-cta-bg, #00388F)';
    }

    function updateMistakeHUD() {
      var hud = document.getElementById('${instanceId}-mistakes-counter');
      if (hud) hud.textContent = 'Mistakes: ' + mistakeCount;
    }

    function assignCategory(idx, cat, btn) {
      sortingChoices[idx] = cat;
      var card = document.getElementById('${instanceId}-sort-card-' + idx);
      var indicator = document.getElementById('${instanceId}-indicator-' + idx);
      var expl = document.getElementById('${instanceId}-expl-' + idx);
      var item = originalCards[idx];

      document.querySelectorAll('.target-btn[data-idx="' + idx + '"]').forEach(function(targetBtn) {
        targetBtn.classList.toggle('active', targetBtn === btn);
        targetBtn.setAttribute('aria-pressed', String(targetBtn === btn));
      });

      document.querySelectorAll('.sorted-item-badge[data-card-idx="' + idx + '"]').forEach(function(badge) {
        badge.remove();
      });

      var targetZone = null;
      document.querySelectorAll('.sorting-column').forEach(function(column) {
        if (column.getAttribute('data-column-cat') === cat) {
          targetZone = column.querySelector('.column-dropzone');
        }
      });

      if (targetZone) {
        var badge = document.createElement('div');
        badge.className = 'sorted-item-badge';
        badge.setAttribute('data-card-idx', idx);
        badge.textContent = card.querySelector('.drag-text').textContent;
        targetZone.appendChild(badge);
      }

      if (instantFeedback) {
        if (cat === item.category) {
          setSortIndicator(indicator, sortCheckIcon, 'Correct');
          if (expl) expl.style.display = 'block';
        } else {
          mistakeCount++;
          updateMistakeHUD();
          setSortIndicator(indicator, sortCrossIcon, 'Incorrect category');
          if (expl) expl.style.display = 'none';
        }
      } else {
        indicator.textContent = '-> Assigned to ' + cat;
        indicator.style.color = 'var(--text-main)';
        if (expl) expl.style.display = 'none';
      }

      viewedItems.add(idx);
      updateProgress();

      if (instantFeedback && Object.keys(sortingChoices).length === originalCards.length) {
        var allRight = originalCards.every(function(it, i) { return sortingChoices[i] === it.category; });
        if (allRight) updateTrackerComplete();
      }
    }

    function checkSorting() {
      var allCorrect = true;
      originalCards.forEach(function(item, idx) {
        var choice = sortingChoices[idx];
        var indicator = document.getElementById('${instanceId}-indicator-' + idx);
        var expl = document.getElementById('${instanceId}-expl-' + idx);

        if (choice === item.category) {
          if (indicator) setSortIndicator(indicator, sortCheckIcon, 'Correct');
          if (expl) expl.style.display = 'block';
        } else {
          allCorrect = false;
          mistakeCount++;
          if (indicator) setSortIndicator(indicator, sortCrossIcon, 'Incorrect (expected ' + item.category + ')');
          if (expl) expl.style.display = 'block';
        }
      });

      updateMistakeHUD();

      var feedback = document.getElementById('${instanceId}-sorting-feedback-box');
      if (feedback) {
        feedback.style.display = 'block';
        if (allCorrect) {
          feedback.className = 'quiz-feedback correct';
          feedback.innerHTML = '<strong>Superb!</strong> All items sorted correctly into their categories.';
          updateTrackerComplete();
        } else {
          feedback.className = 'quiz-feedback wrong';
          feedback.innerHTML = '<strong>Review incorrect cards.</strong> See explanation cards above and adjust assignments.';
        }
        feedback.focus();
      }
    }

    function resetActivity() {
      sortingChoices = {};
      mistakeCount = 0;
      updateMistakeHUD();

      document.querySelectorAll('.target-btn').forEach(function(btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      });

      document.querySelectorAll('.sort-status-indicator').forEach(function(ind) {
        ind.textContent = '';
      });

      document.querySelectorAll('.sort-explanation-card').forEach(function(exp) {
        exp.style.display = 'none';
      });

      document.querySelectorAll('.sorted-item-badge').forEach(function(b) {
        b.remove();
      });

      var feedback = document.getElementById('${instanceId}-sorting-feedback-box');
      if (feedback) { feedback.style.display = 'none'; feedback.innerHTML = ''; }
      announce('Sorting activity reset.');
    }

    function initComponent() {
      document.querySelectorAll('.target-btn').forEach(function(button) {
        button.addEventListener('click', function() {
          assignCategory(parseInt(button.getAttribute('data-idx'), 10), button.getAttribute('data-cat'), button);
        });
      });

      var verifyBtn = document.getElementById('${instanceId}-verify-btn');
      if (verifyBtn) verifyBtn.addEventListener('click', checkSorting);

      var resetBtn = document.getElementById('${instanceId}-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', resetActivity);
    }`;
}

/**
 * Validates sorting activity component configuration.
 * @param {SortingActivityConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [];
  
  if (!Array.isArray(config.items) || config.items.length < 2) {
    results.push({ valid: false, error: 'Add at least two sortable items.' });
  } else {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Item ${index + 1}: Title is required.` });
      }
      if (!item.category || !String(item.category).trim()) {
        results.push({ valid: false, error: `Item ${index + 1}: Category is required.` });
      }
    });
    
    const categories = new Set(config.items.map(item => item.category));
    if (categories.size < 2) {
      results.push({ valid: false, error: 'Items must have at least two different categories.' });
    }
  }
  
  return combineValidationResults(results);
}
