import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeHTML, sanitizeRichText } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Confidence & Skills Self-Assessment Component
 * @typedef {Object} ConfidenceMatrixConfig
 * @property {string} [title] - Header title
 * @property {string} [content] - Explanatory caption / instructions
 * @property {boolean} [showBreakdown] - Whether to show the diagnostic strength/growth breakdown
 * @property {string} [scaleLabel] - Scale label title
 * @property {Array<{title: string, category?: string, content: string}>} items
 */

export const id = 'confidence-matrix';
export const name = 'Confidence & Skills Self-Assessment';
export const category = 'knowledge';

/** @type {ConfidenceMatrixConfig} */
export const defaultConfig = {
  title: 'Engineering & Cloud Architecture Self-Assessment',
  content: 'Evaluate your technical proficiency and execution confidence across core enterprise domains to identify strengths and personalized growth pathways.',
  showBreakdown: true,
  scaleLabel: 'Competency Rating Scale',
  items: [
    {
      title: '5G Standalone Core Architecture',
      category: 'Infrastructure',
      content: 'Design, deploy, and troubleshoot cloud-native 5G core network functions, user plane separation (CUPS), and dynamic network slicing.'
    },
    {
      title: 'Multi-Access Edge Computing (MEC)',
      category: 'Edge Cloud',
      content: 'Configure edge compute clusters, implement local traffic breakout policies, and optimize deterministic sub-10ms enterprise latency.'
    },
    {
      title: 'Zero-Trust SASE Security Architecture',
      category: 'Cybersecurity',
      content: 'Implement identity-first access control policies, secure access service edge (SASE) gateways, and continuous threat verification.'
    },
    {
      title: 'BGP Routing & Peering Automation',
      category: 'Network Routing',
      content: 'Manage multi-protocol BGP route reflectors, automated peering session failover, and real-time telemetry streaming pipelines.'
    }
  ]
};

export const editorSchema = getEditorSchema(id);

const assessmentIcon = getAttIconSvg('check-shield', { width: 22, height: 22, ariaHidden: true });
const checkIcon = getAttIconSvg('check', { width: 14, height: 14, ariaHidden: true });
const strengthIcon = getAttIconSvg('check-circle-filled', { width: 18, height: 18, ariaHidden: true });
const growthIcon = getAttIconSvg('information-circle-filled', { width: 18, height: 18, ariaHidden: true });

const RATING_LEVELS = [
  { value: 1, label: 'Novice', desc: 'Need Guidance' },
  { value: 2, label: 'Developing', desc: 'Working Knowledge' },
  { value: 3, label: 'Proficient', desc: 'Independent' },
  { value: 4, label: 'Expert', desc: 'Can Mentor' }
];

export function generateHTML(config, instanceId) {
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;
  const showBreakdown = config.showBreakdown !== false;
  const total = items.length;

  const itemsHtml = items.map((item, idx) => {
    const radioGroupId = `${instanceId}-rg-${idx}`;
    return `
      <div class="confidence-item-row" id="${instanceId}-item-${idx}" data-item-index="${idx}">
        <div class="confidence-item-info">
          <div class="confidence-item-meta">
            ${item.category ? `<span class="confidence-category-badge">${escapeHTML(item.category)}</span>` : ''}
            <span class="confidence-item-num">Competency ${idx + 1} of ${total}</span>
          </div>
          <h4 class="confidence-item-title" id="${instanceId}-title-${idx}">${escapeHTML(item.title || `Competency ${idx + 1}`)}</h4>
          <div class="confidence-item-desc">${sanitizeRichText(item.content || '')}</div>
        </div>
        <div class="confidence-rating-group" role="radiogroup" aria-labelledby="${instanceId}-title-${idx}" id="${radioGroupId}">
          ${RATING_LEVELS.map(level => `
            <button type="button"
              class="confidence-rating-btn"
              role="radio"
              aria-checked="false"
              data-item-index="${idx}"
              data-rating-value="${level.value}"
              id="${instanceId}-opt-${idx}-${level.value}"
              tabindex="${level.value === 1 ? '0' : '-1'}">
              <span class="confidence-rating-val">${level.value}</span>
              <span class="confidence-rating-label">${escapeHTML(level.label)}</span>
              <span class="confidence-rating-sub">${escapeHTML(level.desc)}</span>
              <span class="confidence-rating-check" aria-hidden="true">${checkIcon}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="confidence-matrix-card" id="${instanceId}-matrix-card" data-total="${total}">
      ${config.title ? `
        <div class="confidence-header">
          <div class="confidence-header-icon">${assessmentIcon}</div>
          <h3 class="confidence-title">${escapeHTML(config.title)}</h3>
        </div>
      ` : ''}
      ${config.content ? `<p class="confidence-instructions">${sanitizeRichText(config.content)}</p>` : ''}

      <div class="confidence-summary-bar" id="${instanceId}-summary-bar" aria-live="polite">
        <div class="confidence-summary-track">
          <div class="confidence-progress-fill" id="${instanceId}-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="confidence-summary-stats">
          <span class="confidence-stats-evaluated" id="${instanceId}-evaluated-count">0 of ${total} evaluated</span>
          <span class="confidence-stats-score" id="${instanceId}-overall-score">Overall Score: 0%</span>
        </div>
      </div>

      <div class="confidence-matrix-rows">
        ${itemsHtml}
      </div>

      ${showBreakdown ? `
        <div class="confidence-diagnostic-panel" id="${instanceId}-diagnostic-panel" style="display: none;" aria-live="polite">
          <div class="confidence-diagnostic-header">
            <h4 class="confidence-diagnostic-title">Assessment Summary & Diagnostic Guidance</h4>
            <span class="confidence-tier-badge" id="${instanceId}-tier-badge">Evaluated</span>
          </div>
          <p class="confidence-diagnostic-summary" id="${instanceId}-tier-desc"></p>
          <div class="confidence-breakdown-grid">
            <div class="confidence-breakdown-col strengths-col">
              <div class="confidence-col-header">
                <span class="confidence-col-icon">${strengthIcon}</span>
                <h5>Key Strengths (Proficient / Expert)</h5>
              </div>
              <ul class="confidence-pill-list" id="${instanceId}-strengths-list"></ul>
            </div>
            <div class="confidence-breakdown-col growth-col">
              <div class="confidence-col-header">
                <span class="confidence-col-icon">${growthIcon}</span>
                <h5>Growth Opportunities (Novice / Developing)</h5>
              </div>
              <ul class="confidence-pill-list" id="${instanceId}-growth-list"></ul>
            </div>
          </div>
          <div class="confidence-reflection-box">
            <label class="confidence-reflection-label" for="${instanceId}-reflection-notes">Learner Action Commitment & Coaching Notes (Optional)</label>
            <textarea class="confidence-reflection-input" id="${instanceId}-reflection-notes" rows="3" placeholder="Document your key growth priorities, questions for your mentor, or 90-day action plan..."></textarea>
          </div>
        </div>
      ` : ''}

      <div class="confidence-actions-bar">
        <button type="button" class="confidence-print-btn" id="${instanceId}-print-btn" aria-label="Print or save diagnostic action plan as PDF" disabled>
          <span>Print / Save Action Plan</span>
        </button>
        <button type="button" class="confidence-reset-btn" id="${instanceId}-reset-btn" aria-label="Reset self-assessment">
          <span>Reset Assessment</span>
        </button>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .confidence-matrix-card {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-lg, 24px);
      padding: var(--att-space-6, 32px);
      box-shadow: var(--shadow-style);
      font-family: var(--att-font-sans, sans-serif);
      color: var(--text-color, #000000);
      box-sizing: border-box;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--att-space-5, 24px);
    }
    .confidence-header {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
    }
    .confidence-header-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--att-radius-sm, 12px);
      background-color: var(--bg-body, #F3F4F5);
      color: var(--primary, #00388F);
      flex-shrink: 0;
    }
    .confidence-title {
      font-size: var(--att-fs-h2, 1.5rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-color, #000000);
      margin: 0;
    }
    .confidence-instructions {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-secondary, #4B5563);
      margin: 0;
    }
    .confidence-summary-bar {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
      background-color: var(--bg-body, #F3F4F5);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-4, 16px);
    }
    .confidence-summary-track {
      width: 100%;
      height: 10px;
      background-color: var(--border-color, #DCDFE3);
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }
    .confidence-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--att-blue, #009FDB), var(--primary, #00388F));
      border-radius: 9999px;
      transition: width 350ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .confidence-progress-fill {
        transition: none;
      }
    }
    .confidence-summary-stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-semibold, 600);
      color: var(--text-color, #000000);
    }
    .confidence-matrix-rows {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .confidence-item-row {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .confidence-item-row.is-rated {
      border-color: var(--primary, #00388F);
      box-shadow: 0 2px 8px rgba(0, 56, 143, 0.08);
    }
    .confidence-item-meta {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
      margin-bottom: var(--att-space-1, 4px);
    }
    .confidence-category-badge {
      display: inline-block;
      padding: 3px var(--att-space-3, 12px);
      border-radius: 9999px;
      background-color: var(--bg-body, #F3F4F5);
      color: var(--primary, #00388F);
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .confidence-item-num {
      font-size: var(--att-fs-xs, 0.8125rem);
      color: var(--text-secondary, #4B5563);
      font-weight: var(--att-fw-medium, 500);
    }
    .confidence-item-title {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-color, #000000);
      margin: 0 0 var(--att-space-2, 8px) 0;
    }
    .confidence-item-desc {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-secondary, #4B5563);
      margin: 0;
    }
    .confidence-rating-group {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--att-space-3, 12px);
      width: 100%;
    }
    @media (max-width: 640px) {
      .confidence-rating-group {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .confidence-rating-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--att-space-3, 12px) var(--att-space-2, 8px);
      min-height: 72px;
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-color, #000000);
      font-family: var(--att-font-sans, sans-serif);
      cursor: pointer;
      position: relative;
      transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .confidence-rating-btn:hover {
      background-color: var(--border-color, #DCDFE3);
      border-color: var(--primary, #00388F);
    }
    .confidence-rating-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .confidence-rating-btn.is-selected {
      background-color: var(--primary, #00388F);
      border-color: var(--primary, #00388F);
      color: #FFFFFF;
      box-shadow: 0 4px 12px rgba(0, 56, 143, 0.25);
    }
    .confidence-rating-btn.is-selected .confidence-rating-sub {
      color: #DCDFE3;
    }
    .confidence-rating-btn.is-selected .confidence-rating-check {
      opacity: 1;
      transform: scale(1);
    }
    .confidence-rating-val {
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      margin-bottom: 2px;
    }
    .confidence-rating-label {
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: 1.2;
    }
    .confidence-rating-sub {
      font-size: 0.75rem;
      color: var(--text-secondary, #4B5563);
      margin-top: 2px;
      line-height: 1.2;
    }
    .confidence-rating-check {
      position: absolute;
      top: 6px;
      right: 6px;
      opacity: 0;
      transform: scale(0.5);
      transition: opacity 150ms ease, transform 150ms ease;
    }
    .confidence-diagnostic-panel {
      background-color: var(--bg-body, #F3F4F5);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-lg, 24px);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      animation: fadeIn 300ms ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .confidence-diagnostic-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
    }
    .confidence-diagnostic-title {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-color, #000000);
      margin: 0;
    }
    .confidence-tier-badge {
      display: inline-block;
      padding: 4px var(--att-space-3, 12px);
      border-radius: 9999px;
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .confidence-diagnostic-summary {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-secondary, #4B5563);
      margin: 0;
    }
    .confidence-breakdown-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--att-space-4, 16px);
    }
    @media (max-width: 640px) {
      .confidence-breakdown-grid {
        grid-template-columns: 1fr;
      }
    }
    .confidence-breakdown-col {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }
    .confidence-col-header {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
    }
    .strengths-col .confidence-col-icon {
      color: var(--att-green, #91DC00);
    }
    .growth-col .confidence-col-icon {
      color: var(--att-blue, #009FDB);
    }
    .confidence-col-header h5 {
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-color, #000000);
      margin: 0;
    }
    .confidence-pill-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
    }
    .confidence-pill-item {
      font-size: var(--att-fs-sm, 0.875rem);
      padding: var(--att-space-2, 8px) var(--att-space-3, 12px);
      border-radius: var(--att-radius-sm, 12px);
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-color, #000000);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .confidence-pill-score {
      font-weight: var(--att-fw-bold, 700);
      font-size: var(--att-fs-xs, 0.8125rem);
      color: var(--primary, #00388F);
    }
    .confidence-reflection-box {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
      margin-top: var(--att-space-3, 12px);
      padding-top: var(--att-space-4, 16px);
      border-top: 1px solid var(--border-color, #DCDFE3);
    }
    .confidence-reflection-label {
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-color, #000000);
    }
    .confidence-reflection-input {
      width: 100%;
      box-sizing: border-box;
      padding: var(--att-space-3, 12px);
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-sm, 0.875rem);
      line-height: var(--att-lh-body, 1.5);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 12px);
      background-color: var(--bg-card, #FFFFFF);
      color: var(--text-color, #000000);
      resize: vertical;
      min-height: 72px;
    }
    .confidence-reflection-input:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .confidence-actions-bar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: var(--att-space-3, 12px);
      width: 100%;
      flex-wrap: wrap;
    }
    .confidence-print-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: var(--att-space-2, 8px) var(--att-space-5, 20px);
      border: 1px solid var(--primary, #00388F);
      border-radius: 9999px;
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      transition: all 150ms ease;
      box-shadow: 0 2px 6px rgba(0, 56, 143, 0.2);
    }
    .confidence-print-btn:hover:not(:disabled) {
      background-color: var(--primary-hover);
      border-color: var(--primary-hover);
    }
    .confidence-print-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .confidence-print-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }
    .confidence-reset-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: var(--att-space-2, 8px) var(--att-space-4, 16px);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: 9999px;
      background-color: transparent;
      color: var(--text-secondary, #4B5563);
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-semibold, 600);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .confidence-reset-btn:hover {
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-color, #000000);
      border-color: var(--primary, #00388F);
    }
    .confidence-reset-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    @media print {
      .confidence-actions-bar,
      .confidence-summary-bar {
        display: none !important;
      }
      .confidence-matrix-card {
        box-shadow: none !important;
        border: 1px solid var(--border-color, #DCDFE3) !important;
        padding: var(--att-space-4, 16px) !important;
        page-break-inside: avoid;
      }
      .confidence-diagnostic-panel {
        display: flex !important;
        border: 1px solid var(--border-color, #DCDFE3) !important;
        background-color: var(--bg-body, #F3F4F5) !important;
      }
      .confidence-item-row {
        page-break-inside: avoid;
      }
    }
  `;
}

export function generateJS(config, instanceId) {
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;
  const total = items.length;

  return `
    function initComponent() {
      var root = document.getElementById('${instanceId}-matrix-card');
      var progressFill = document.getElementById('${instanceId}-progress-fill');
      var evaluatedCountEl = document.getElementById('${instanceId}-evaluated-count');
      var overallScoreEl = document.getElementById('${instanceId}-overall-score');
      var diagnosticPanel = document.getElementById('${instanceId}-diagnostic-panel');
      var tierBadge = document.getElementById('${instanceId}-tier-badge');
      var tierDesc = document.getElementById('${instanceId}-tier-desc');
      var strengthsList = document.getElementById('${instanceId}-strengths-list');
      var growthList = document.getElementById('${instanceId}-growth-list');
      var reflectionNotes = document.getElementById('${instanceId}-reflection-notes');
      var printBtn = document.getElementById('${instanceId}-print-btn');
      var resetBtn = document.getElementById('${instanceId}-reset-btn');

      if (!root) return;

      var totalItems = ${total};
      var ratings = {};
      var itemsData = ${JSON.stringify(items.map(item => ({ title: item.title, category: item.category || '' })))};

      function updateMatrixState() {
        var ratedIndices = Object.keys(ratings);
        var ratedCount = ratedIndices.length;
        var progressPercent = Math.round((ratedCount / totalItems) * 100);

        if (progressFill) {
          progressFill.style.width = progressPercent + '%';
        }
        if (evaluatedCountEl) {
          evaluatedCountEl.textContent = ratedCount + ' of ' + totalItems + ' evaluated';
        }

        if (printBtn) {
          printBtn.disabled = ratedCount === 0;
        }

        if (ratedCount === 0) {
          if (overallScoreEl) overallScoreEl.textContent = 'Overall Score: 0%';
          if (diagnosticPanel) diagnosticPanel.style.display = 'none';
          return;
        }

        var totalRatingPoints = 0;
        ratedIndices.forEach(function(idx) {
          totalRatingPoints += ratings[idx];
        });

        // 4 points max per item
        var maxPossible = ratedCount * 4;
        var scorePercent = Math.round((totalRatingPoints / maxPossible) * 100);

        if (overallScoreEl) {
          // Partial results are supported (they can be printed), but are labelled as partial so a
          // score over some of the competencies is never read as the overall result.
          overallScoreEl.textContent = ratedCount === totalItems
            ? 'Overall Score: ' + scorePercent + '%'
            : 'Partial score: ' + scorePercent + '% (' + ratedCount + ' of ' + totalItems + ' rated)';
        }

        if (ratedCount === totalItems) {
          if (diagnosticPanel) {
            diagnosticPanel.style.display = 'flex';
            renderDiagnostic(scorePercent);
          }
          viewedItems.add('completed');
          updateProgress();
        } else {
          if (diagnosticPanel) diagnosticPanel.style.display = 'none';
        }
      }

      function renderDiagnostic(scorePercent) {
        var tier = 'Proficient Practitioner';
        var desc = 'Solid capability across the competencies you rated, with balanced independent execution.';

        if (scorePercent >= 85) {
          tier = 'Advanced Subject Matter Expert';
          desc = 'Exceptional confidence across the competencies you rated. You are well placed to apply these skills independently, support colleagues and guide others in complex situations.';
        } else if (scorePercent >= 65) {
          tier = 'Proficient Practitioner';
          desc = 'Solid capability with strong independent execution. Focus on targeted stretch areas to broaden your range across the competencies you rated.';
        } else if (scorePercent >= 45) {
          tier = 'Developing Specialist';
          desc = 'Good grasp of the core practices. Recommended next steps include guided practice on real work and peer feedback to build independent confidence.';
        } else {
          tier = 'Foundational Explorer';
          desc = 'You are at the start of building these competencies. Prioritize foundational learning and guided practice before taking on complex work alone.';
        }

        if (tierBadge) tierBadge.textContent = tier;
        if (tierDesc) tierDesc.textContent = desc;

        if (strengthsList) {
          strengthsList.innerHTML = '';
          var strengths = [];
          Object.keys(ratings).forEach(function(idx) {
            if (ratings[idx] >= 3) {
              strengths.push({ item: itemsData[Number(idx)], rating: ratings[idx] });
            }
          });
          if (strengths.length) {
            strengths.forEach(function(s) {
              var li = document.createElement('li');
              li.className = 'confidence-pill-item';
              li.innerHTML = '<span>' + (s.item.title || 'Competency') + '</span><span class="confidence-pill-score">Level ' + s.rating + '/4</span>';
              strengthsList.appendChild(li);
            });
          } else {
            var emptyLi = document.createElement('li');
            emptyLi.className = 'confidence-pill-item';
            emptyLi.textContent = 'No Level 3/4 items rated yet.';
            strengthsList.appendChild(emptyLi);
          }
        }

        if (growthList) {
          growthList.innerHTML = '';
          var growth = [];
          Object.keys(ratings).forEach(function(idx) {
            if (ratings[idx] <= 2) {
              growth.push({ item: itemsData[Number(idx)], rating: ratings[idx] });
            }
          });
          if (growth.length) {
            growth.forEach(function(g) {
              var li = document.createElement('li');
              li.className = 'confidence-pill-item';
              li.innerHTML = '<span>' + (g.item.title || 'Competency') + '</span><span class="confidence-pill-score">Level ' + g.rating + '/4</span>';
              growthList.appendChild(li);
            });
          } else {
            var emptyLi2 = document.createElement('li');
            emptyLi2.className = 'confidence-pill-item';
            emptyLi2.textContent = 'Great job! All competencies evaluated at Proficient or Expert level.';
            growthList.appendChild(emptyLi2);
          }
        }
      }

      function handleRatingSelect(itemIndex, ratingValue) {
        ratings[itemIndex] = ratingValue;

        var row = root.querySelector('[data-item-index="' + itemIndex + '"]');
        if (row) {
          row.classList.add('is-rated');
          var buttons = row.querySelectorAll('.confidence-rating-btn');
          buttons.forEach(function(btn) {
            var btnVal = Number(btn.dataset.ratingValue);
            var isSelected = btnVal === ratingValue;
            btn.classList.toggle('is-selected', isSelected);
            btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            btn.tabIndex = isSelected ? 0 : -1;
          });
        }

        viewedItems.add(itemIndex);
        updateMatrixState();
      }

      root.addEventListener('click', function(e) {
        var btn = e.target.closest('.confidence-rating-btn');
        if (!btn) return;
        var itemIdx = Number(btn.dataset.itemIndex);
        var ratingVal = Number(btn.dataset.ratingValue);
        if (Number.isFinite(itemIdx) && Number.isFinite(ratingVal)) {
          handleRatingSelect(itemIdx, ratingVal);
        }
      });

      root.addEventListener('keydown', function(e) {
        var btn = e.target.closest('.confidence-rating-btn');
        if (!btn) return;

        var group = btn.closest('.confidence-rating-group');
        if (!group) return;

        var buttons = Array.from(group.querySelectorAll('.confidence-rating-btn'));
        var currentIdx = buttons.indexOf(btn);

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          var nextIdx = (currentIdx + 1) % buttons.length;
          buttons[nextIdx].focus();
          var itemIdx = Number(buttons[nextIdx].dataset.itemIndex);
          var ratingVal = Number(buttons[nextIdx].dataset.ratingValue);
          handleRatingSelect(itemIdx, ratingVal);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var prevIdx = (currentIdx - 1 + buttons.length) % buttons.length;
          buttons[prevIdx].focus();
          var itemIdx2 = Number(buttons[prevIdx].dataset.itemIndex);
          var ratingVal2 = Number(buttons[prevIdx].dataset.ratingValue);
          handleRatingSelect(itemIdx2, ratingVal2);
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          var itemIdx3 = Number(btn.dataset.itemIndex);
          var ratingVal3 = Number(btn.dataset.ratingValue);
          handleRatingSelect(itemIdx3, ratingVal3);
        }
      });

      if (printBtn) {
        printBtn.addEventListener('click', function() {
          window.print();
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          ratings = {};
          if (reflectionNotes) {
            reflectionNotes.value = '';
          }
          var rows = root.querySelectorAll('.confidence-item-row');
          rows.forEach(function(row) {
            row.classList.remove('is-rated');
            var buttons = row.querySelectorAll('.confidence-rating-btn');
            buttons.forEach(function(btn, idx) {
              btn.classList.remove('is-selected');
              btn.setAttribute('aria-checked', 'false');
              btn.tabIndex = idx === 0 ? 0 : -1;
            });
          });
          updateMatrixState();
        });
      }

      // Initial state
      updateMatrixState();
    }
  `;
}

export function validate(config) {
  const errors = [];
  if (!config.items || !config.items.length) {
    errors.push('Confidence & Skills Self-Assessment requires at least one competency item.');
  } else {
    config.items.forEach((item, idx) => {
      if (!item.title || !item.title.trim()) {
        errors.push(`Competency ${idx + 1} is missing a title.`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
