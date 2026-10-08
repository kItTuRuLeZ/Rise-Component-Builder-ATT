import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeRichText, richInline } from '../js/utilities.js';
import { validateScenarioBranching, combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Scenario Component Configuration
 * @typedef {Object} ScenarioConfig
 * @property {Array<{title: string, content: string, nextSlide?: string, points?: number, emotion?: string, speaker?: string}>} items - Array of scenario steps (prompt + choices)
 * @property {boolean} [scenarioShowMeter] - Shows a consequence/score impact meter
 * @property {boolean} [scenarioShowHistory] - Shows dialogue history log
 * @property {boolean} [scenarioAllowReset] - Shows a restart scenario button
 */

export const id = 'scenario';
export const name = 'Branching Scenario Card';
export const category = 'process';

/** @type {ScenarioConfig} */
export const defaultConfig = {
  scenarioShowMeter: false,
  scenarioShowHistory: false,
  scenarioAllowReset: true,
  items: [
    { title: 'How should you write interactive eLearning scripts?', content: 'Short and conversational', speaker: 'Chris (Team Lead)', emotion: 'thinking' },
    { title: 'Choice A: Write dense documents.', content: 'Character: "That makes learning boring!" (Incorrect)', points: -10, emotion: 'concerned' },
    { title: 'Choice B: Write conversational steps.', content: 'Character: "Spot on! Keeps learners hooked!" (Correct)', points: +10, emotion: 'happy' }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const showMeter = config.scenarioShowMeter === true;
  const showHistory = config.scenarioShowHistory === true;
  const allowReset = config.scenarioAllowReset !== false;

  const q = config.items[0] || { title: 'Dialogue prompt', content: 'What should we do?', speaker: 'Chris (Team Lead)', emotion: 'neutral' };
  const choices = config.items.slice(1);
  const initialEmotion = q.emotion || 'neutral';

  return `
    <div class="scenario-container" id="${instanceId}">
      ${showMeter ? `
        <div class="scenario-meter-card" id="${instanceId}-meter-card">
          <div class="scenario-meter-header">
            <span class="scenario-meter-label">Decision impact score</span>
            <span class="scenario-meter-val" id="${instanceId}-meter-val">50 / 100</span>
          </div>
          <div class="scenario-meter-bar-track">
            <div class="scenario-meter-bar-fill" id="${instanceId}-meter-fill" style="width: 50%;"></div>
          </div>
        </div>
      ` : ''}

      <div class="scenario-avatar-row">
        <div class="char-avatar-img" id="${instanceId}-avatar-icon">
          ${getAttIconSvg('person', { width: 24, height: 24, ariaHidden: true })}
        </div>
        <div class="scenario-bubble">
          <div class="scenario-speaker-row">
            <span class="speaker-name" id="${instanceId}-speaker-name">${richInline(q.speaker, 'Chris (Team Lead)')}</span>
            <span class="scenario-emotion-badge" id="${instanceId}-emotion-badge">${escapeHTML(initialEmotion.charAt(0).toUpperCase() + initialEmotion.slice(1))}</span>
          </div>
          <div class="speech-text" id="${instanceId}-scenario-speech">${sanitizeRichText(q.title)}</div>
        </div>
      </div>

      <div class="scenario-choices-list" id="${instanceId}-scenario-choices-box">
        ${choices.map((ch, idx) => `
          <button type="button" class="scenario-choice-btn" data-choice-idx="${idx}" data-feedback="${escapeAttribute(ch.content || '')}" data-points="${Number(ch.points) || 0}" data-emotion="${escapeAttribute(ch.emotion || (ch.points > 0 ? 'happy' : 'concerned'))}">
            <span class="choice-text">${richInline(ch.title, 'Choice option')}</span>
            ${showMeter && ch.points ? `<span class="choice-points-badge ${ch.points > 0 ? 'pos' : 'neg'}">${ch.points > 0 ? '+' : ''}${ch.points} pts</span>` : ''}
          </button>
        `).join('')}
      </div>

      <div id="${instanceId}-scenario-feedback-card" class="scenario-feedback-balloon" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" style="display:none;"></div>

      ${showHistory ? `
        <div class="scenario-history-box" id="${instanceId}-history-box" hidden>
          <h4 class="scenario-history-title">Dialogue history log</h4>
          <div class="scenario-history-list" id="${instanceId}-history-list"></div>
        </div>
      ` : ''}

      <div class="scenario-footer-row">
        ${showHistory ? `<button type="button" class="scenario-history-toggle-btn" id="${instanceId}-history-toggle" aria-expanded="false">View dialogue history</button>` : ''}
        ${allowReset ? `<button type="button" class="scenario-reset-btn" id="${instanceId}-reset-btn">Restart scenario</button>` : ''}
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .scenario-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .scenario-meter-card {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 10px);
      padding: 10px 14px;
    }
    .scenario-meter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .scenario-meter-label {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: normal;
    }
    .scenario-meter-val {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
    }
    .scenario-meter-bar-track {
      height: 8px;
      background-color: var(--border-color);
      border-radius: var(--att-radius-pill, 999px);
      overflow: hidden;
    }
    .scenario-meter-bar-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.4s ease;
    }
    .scenario-avatar-row {
      display: flex;
      gap: var(--att-space-4, 16px);
      align-items: flex-start;
    }
    .char-avatar-img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background-color: var(--border-color);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 2px solid var(--accent);
      box-shadow: var(--shadow-sm);
      transition: transform 0.2s ease;
    }
    .scenario-bubble {
      flex: 1;
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      padding: var(--att-space-4, 16px) var(--att-space-5, 20px);
      position: relative;
    }
    .scenario-bubble::before {
      content: '';
      position: absolute;
      left: -8px;
      top: 18px;
      border-width: 8px 8px 8px 0;
      border-style: solid;
      border-color: transparent var(--border-color) transparent transparent;
    }
    .scenario-bubble::after {
      content: '';
      position: absolute;
      left: -7px;
      top: 18px;
      border-width: 8px 8px 8px 0;
      border-style: solid;
      border-color: transparent var(--bg-body) transparent transparent;
    }
    .scenario-speaker-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .speaker-name {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--accent);
      letter-spacing: 0.5px;
      text-wrap: pretty;
    }
    .scenario-emotion-badge {
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 700;
      letter-spacing: normal;
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--border-color);
      color: var(--text-main);
    }
    .speech-text {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      max-width: 70ch;
    }
    .scenario-choices-list {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 10px);
      margin-top: var(--att-space-2, 6px);
    }
    .scenario-choice-btn {
      width: 100%;
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      padding: 12px 16px;
      border-radius: var(--button-radius, var(--att-radius-md, 12px));
      text-align: left;
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-medium, 500);
      line-height: var(--att-lh-body, 1.5);
      cursor: pointer;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .scenario-choice-btn:hover {
      border-color: var(--primary-hover);
      color: var(--primary-hover);
    }
    .scenario-choice-btn:active {
      transform: scale(0.98);
    }
    .scenario-choice-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .choice-points-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    /* Positive score — AT&T Lime as a low-alpha accent fill with black text
       (brand rule: Lime is an accent, never a text colour). */
    .choice-points-badge.pos {
      background-color: rgba(145, 220, 0, 0.22);
      color: #000000;
    }
    /* Negative score — AT&T has no red; Cobalt plus the explicit minus value
       carries the meaning (never colour alone). */
    .choice-points-badge.neg {
      background-color: rgba(0, 56, 143, 0.10);
      color: var(--att-cta-bg, #00388F);
    }
    .scenario-feedback-balloon {
      background-color: var(--att-grey-1, #F3F4F5);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      padding: var(--att-space-4, 16px);
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      max-width: 70ch;
      animation: fadeIn 0.3s ease;
    }
    .scenario-history-box {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 8px);
      padding: 12px;
    }
    .scenario-history-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .scenario-history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 180px;
      overflow-y: auto;
    }
    .history-entry {
      font-size: 13px;
      padding: 6px 8px;
      background-color: var(--bg-card);
      border-radius: 4px;
      border-left: 3px solid var(--primary);
    }
    .scenario-footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .scenario-history-toggle-btn, .scenario-reset-btn {
      background: none;
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-pill, 999px);
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      cursor: pointer;
    }
    .scenario-history-toggle-btn:hover, .scenario-reset-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
    }`;
}

export function generateJS(config, instanceId) {
  const showMeter = config.scenarioShowMeter === true;
  const showHistory = config.scenarioShowHistory === true;

  return `
    var scenarioScore = 50;
    var initialPrompt = ${JSON.stringify(config.items[0]?.title || '')};
    var initialSpeaker = ${JSON.stringify(config.items[0]?.speaker || 'Chris (Team Lead)')};
    var initialEmotion = ${JSON.stringify(config.items[0]?.emotion || 'neutral')};

    function updateScore(delta) {
      if (!${showMeter}) return;
      scenarioScore = Math.max(0, Math.min(100, scenarioScore + delta));
      var fill = document.getElementById('${instanceId}-meter-fill');
      var val = document.getElementById('${instanceId}-meter-val');
      if (fill) fill.style.width = scenarioScore + '%';
      if (val) val.textContent = scenarioScore + ' / 100';
    }

    function appendHistoryLog(choiceText, feedbackText) {
      if (!${showHistory}) return;
      var list = document.getElementById('${instanceId}-history-list');
      if (list) {
        var item = document.createElement('div');
        item.className = 'history-entry';
        item.innerHTML = '<strong>Selected:</strong> ' + choiceText + '<br><strong>Response:</strong> ' + feedbackText;
        list.appendChild(item);
      }
    }

    function selectScenarioChoice(choiceIdx, feedback, points, emotion, button) {
      var feedbackCard = document.getElementById('${instanceId}-scenario-feedback-card');
      if (feedbackCard) {
        feedbackCard.style.display = 'block';
        feedbackCard.innerHTML = '<strong>' + initialSpeaker + ':</strong> "' + feedback + '"';
      }

      var emotionBadge = document.getElementById('${instanceId}-emotion-badge');
      if (emotionBadge && emotion) {
        emotionBadge.textContent = String(emotion).charAt(0).toUpperCase() + String(emotion).slice(1);
      }

      if (points) updateScore(points);

      var choiceText = button ? (button.querySelector('.choice-text') ? button.querySelector('.choice-text').textContent : button.textContent) : 'Option ' + (choiceIdx + 1);
      appendHistoryLog(choiceText, feedback);

      viewedItems.add(choiceIdx);
      updateProgress();

      if (feedback.toLowerCase().includes('correct') || feedback.toLowerCase().includes('spot on')) {
        updateTrackerComplete();
      }
    }

    function resetScenario() {
      scenarioScore = 50;
      updateScore(0);
      var speech = document.getElementById('${instanceId}-scenario-speech');
      if (speech) speech.innerHTML = initialPrompt;
      var emotionBadge = document.getElementById('${instanceId}-emotion-badge');
      if (emotionBadge) emotionBadge.textContent = String(initialEmotion).charAt(0).toUpperCase() + String(initialEmotion).slice(1);
      var feedbackCard = document.getElementById('${instanceId}-scenario-feedback-card');
      if (feedbackCard) feedbackCard.style.display = 'none';
      var historyList = document.getElementById('${instanceId}-history-list');
      if (historyList) historyList.innerHTML = '';
      viewedItems.clear();
      updateProgress();
      announce('Scenario restarted.');
    }

    function initComponent() {
      var container = document.getElementById('${instanceId}');
      if (!container) return;

      container.querySelectorAll('.scenario-choice-btn').forEach(function(button) {
        button.addEventListener('click', function() {
          var idx = parseInt(button.getAttribute('data-choice-idx'), 10);
          var feedback = button.getAttribute('data-feedback') || '';
          var points = parseInt(button.getAttribute('data-points') || '0', 10);
          var emotion = button.getAttribute('data-emotion') || '';
          selectScenarioChoice(idx, feedback, points, emotion, button);
        });
      });

      var resetBtn = document.getElementById('${instanceId}-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', resetScenario);

      var historyToggle = document.getElementById('${instanceId}-history-toggle');
      var historyBox = document.getElementById('${instanceId}-history-box');
      if (historyToggle && historyBox) {
        historyToggle.addEventListener('click', function() {
          var isExpanded = historyToggle.getAttribute('aria-expanded') === 'true';
          historyToggle.setAttribute('aria-expanded', String(!isExpanded));
          historyBox.hidden = isExpanded;
          historyToggle.textContent = isExpanded ? 'View dialogue history' : 'Hide dialogue history';
        });
      }
    }`;
}

/**
 * Validates scenario component configuration.
 * @param {ScenarioConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [];
  
  if (!Array.isArray(config.items) || config.items.length < 2) {
    results.push({ valid: false, error: 'Add a prompt and at least one choice.' });
  } else {
    const hasBranching = config.items.some(item => item.nextSlide);
    if (hasBranching) {
      results.push(validateScenarioBranching(config.items));
    }
    
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Step ${index + 1}: Title is required.` });
      }
      if (!item.content || !String(item.content).trim()) {
        results.push({ valid: false, error: `Step ${index + 1}: Content/feedback is required.` });
      }
    });
  }
  
  return combineValidationResults(results);
}

