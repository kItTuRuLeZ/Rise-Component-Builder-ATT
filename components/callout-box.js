import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeRichText, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Callout & Alert Matrix Component
 * @typedef {Object} CalloutBoxConfig
 * @property {string} [title] - Header title
 * @property {string} [content] - Explanatory caption / instructions
 * @property {'stacked'|'grid-2'|'grid-3'} [layout] - Layout presentation mode
 * @property {boolean} [requireAcknowledgment] - Whether items include an interactive acknowledge toggle
 * @property {Array<{title: string, content: string, tone?: 'info'|'warning'|'primary'|'tip'|'security', badgeLabel?: string}>} items
 */

export const id = 'callout-box';
export const name = 'Callout & Alert Matrix';
export const category = 'cards';

/** @type {CalloutBoxConfig} */
export const defaultConfig = {
  title: 'Security & Operational Directives',
  content: 'Review the critical operational standards and security compliance guidelines before initiating network maintenance.',
  layout: 'grid-2',
  requireAcknowledgment: true,
  items: [
    {
      title: 'Mandatory Multi-Factor Authentication (MFA)',
      content: 'All technicians and administrative personnel must verify identity via AT&T Global Logon Authenticator prior to accessing staging infrastructure.',
      tone: 'security',
      badgeLabel: 'Policy Requirement'
    },
    {
      title: 'Live Optical Fiber Safety Warning',
      content: 'Never look directly into active fiber optic terminations or patch panel couplers. Invisible infrared laser radiation can cause permanent retinal damage within milliseconds.',
      tone: 'warning',
      badgeLabel: 'Safety Warning'
    },
    {
      title: 'Maintenance Window Protocols',
      content: 'Scheduled network changes must only occur between 01:00 and 04:00 local time with prior NOC notification and automated rollback triggers active.',
      tone: 'info',
      badgeLabel: 'Operational Guideline'
    },
    {
      title: 'Clean Workspace Best Practice',
      content: 'Always clean connector end-faces with approved lint-free optical wipes and isopropyl alcohol before mating to prevent return loss.',
      tone: 'tip',
      badgeLabel: 'Pro Tip'
    }
  ]
};

export const editorSchema = getEditorSchema(id);

const ICONS = {
  info: getAttIconSvg('information-circle-filled', { width: 22, height: 22, ariaHidden: true }),
  warning: getAttIconSvg('exclamation-triangle-filled', { width: 22, height: 22, ariaHidden: true }),
  primary: getAttIconSvg('verified', { width: 22, height: 22, ariaHidden: true }),
  tip: getAttIconSvg('check-circle-filled', { width: 22, height: 22, ariaHidden: true }),
  security: getAttIconSvg('check-shield', { width: 22, height: 22, ariaHidden: true })
};

const checkIcon = getAttIconSvg('check', { width: 16, height: 16, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const layout = ['stacked', 'grid-2', 'grid-3'].includes(config.layout) ? config.layout : 'grid-2';
  const requireAck = config.requireAcknowledgment !== false;
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;

  const itemsHtml = items.map((item, idx) => {
    const tone = ['info', 'warning', 'primary', 'tip', 'security'].includes(item.tone) ? item.tone : 'info';
    const iconSvg = ICONS[tone] || ICONS.info;

    return `
      <div class="callout-item-card tone-${tone}" id="${instanceId}-item-${idx}" role="region" aria-label="${escapeAttribute(richTextToPlain(item.title) || `Callout ${idx + 1}`)}">
        <div class="callout-item-header">
          <div class="callout-item-icon tone-${tone}">
            ${iconSvg}
          </div>
          <div class="callout-item-meta">
            <span class="callout-item-badge tone-${tone}">${richInline(item.badgeLabel, tone.toUpperCase())}</span>
            <h4 class="callout-item-title">${richInline(item.title, '')}</h4>
          </div>
        </div>
        <div class="callout-item-body">
          ${sanitizeRichText(item.content || '')}
        </div>
        ${requireAck ? `
          <div class="callout-item-footer">
            <button type="button" class="callout-ack-btn"
              id="${instanceId}-ack-${idx}"
              data-item-index="${idx}"
              aria-pressed="false">
              <span class="callout-ack-icon">${checkIcon}</span>
              <span class="callout-ack-text">Mark as Acknowledged</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="callout-matrix-card" id="${instanceId}-matrix-card">
      ${config.title ? `<h3 class="callout-title">${richInline(config.title)}</h3>` : ''}
      ${config.content ? `<p class="callout-description">${sanitizeRichText(config.content)}</p>` : ''}
      <div class="callout-matrix-grid layout-${layout}" id="${instanceId}-grid">
        ${itemsHtml}
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .callout-matrix-card {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .callout-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
      margin: 0;
    }
    .callout-description {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      margin: 0;
    }
    .callout-matrix-grid {
      display: grid;
      gap: var(--att-space-4, 16px);
      width: 100%;
    }
    .callout-matrix-grid.layout-stacked {
      grid-template-columns: 1fr;
    }
    .callout-matrix-grid.layout-grid-2 {
      grid-template-columns: repeat(2, 1fr);
    }
    .callout-matrix-grid.layout-grid-3 {
      grid-template-columns: repeat(3, 1fr);
    }
    @media (max-width: 992px) {
      .callout-matrix-grid.layout-grid-3 {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (max-width: 640px) {
      .callout-matrix-grid.layout-grid-2,
      .callout-matrix-grid.layout-grid-3 {
        grid-template-columns: 1fr;
      }
    }
    .callout-item-card {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-left: 4px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
      transition: all 180ms ease;
    }
    .callout-item-card.tone-info {
      border-left-color: var(--att-blue, #009FDB);
    }
    .callout-item-card.tone-primary {
      border-left-color: var(--primary, #00388F);
    }
    .callout-item-card.tone-warning {
      border-left-color: var(--border-color, #DCDFE3);
    }
    .callout-item-card.tone-tip {
      border-left-color: var(--att-green, #91DC00);
    }
    .callout-item-card.tone-security {
      border-left-color: var(--att-blue, #009FDB);
    }
    .callout-item-header {
      display: flex;
      align-items: flex-start;
      gap: var(--att-space-3, 12px);
    }
    .callout-item-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--att-radius-sm, 12px);
      background-color: var(--bg-body, #F3F4F5);
      flex-shrink: 0;
      color: var(--text-main);
    }
    .callout-item-icon.tone-info {
      color: var(--att-blue, #009FDB);
    }
    .callout-item-icon.tone-primary {
      color: var(--primary, #00388F);
    }
    .callout-item-icon.tone-warning {
      color: var(--text-muted, #4B5563);
    }
    .callout-item-icon.tone-tip {
      color: var(--att-green, #91DC00);
    }
    .callout-item-icon.tone-security {
      color: var(--att-blue, #009FDB);
    }
    .callout-item-meta {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-1, 4px);
    }
    .callout-item-badge {
      display: inline-block;
      align-self: flex-start;
      padding: 2px var(--att-space-2, 8px);
      border-radius: 9999px;
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      letter-spacing: normal;
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-muted, #4B5563);
    }
    .callout-item-badge.tone-info {
      background-color: var(--bg-body, #F3F4F5);
      color: var(--att-blue, #009FDB);
    }
    .callout-item-badge.tone-primary {
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
    }
    .callout-item-badge.tone-warning {
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-main);
    }
    .callout-item-badge.tone-tip {
      background-color: var(--bg-body, #F3F4F5);
      color: var(--primary, #00388F);
    }
    .callout-item-badge.tone-security {
      background-color: var(--att-blue, #009FDB);
      color: #FFFFFF;
    }
    .callout-item-title {
      font-size: var(--att-fs-h3, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.3);
      color: var(--text-main);
      margin: 0;
    }
    .callout-item-body {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
    }
    .callout-item-footer {
      margin-top: auto;
      padding-top: var(--att-space-2, 8px);
      display: flex;
    }
    .callout-ack-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      padding: var(--att-space-2, 8px) var(--att-space-3, 12px);
      border-radius: var(--att-radius-sm, 12px);
      border: 1px solid var(--border-color, #DCDFE3);
      background-color: var(--bg-card, #FFFFFF);
      color: var(--text-main);
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      min-height: 44px;
      transition: all 180ms ease;
    }
    .callout-ack-btn:hover {
      border-color: var(--primary, #00388F);
      background-color: var(--bg-body, #F3F4F5);
    }
    .callout-ack-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .callout-ack-btn.is-acknowledged {
      background-color: var(--primary, #00388F);
      border-color: var(--primary, #00388F);
      color: #FFFFFF;
    }
    .callout-ack-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  `;
}

export function generateJS(config, instanceId) {
  return `
    function initComponent() {
      var root = document.getElementById('${instanceId}-matrix-card');
      if (!root) return;

      var ackButtons = root.querySelectorAll('.callout-ack-btn');
      var totalAck = ackButtons.length;

      function onAckClick(e) {
        var btn = e.currentTarget;
        var idx = Number(btn.dataset.itemIndex);
        var isNowAck = !btn.classList.contains('is-acknowledged');

        btn.classList.toggle('is-acknowledged', isNowAck);
        btn.setAttribute('aria-pressed', isNowAck ? 'true' : 'false');
        var textSpan = btn.querySelector('.callout-ack-text');
        if (textSpan) {
          textSpan.textContent = isNowAck ? 'Acknowledged' : 'Mark as Acknowledged';
        }

        if (isNowAck) {
          viewedItems.add(idx);
          updateProgress();
        }
      }

      ackButtons.forEach(function(btn) {
        btn.addEventListener('click', onAckClick);
      });

      if (!totalAck) {
        viewedItems.add(0);
        updateProgress();
      }
    }
  `;
}

export function validate(config) {
  const errors = [];
  if (!config.items || !config.items.length) {
    errors.push('Callout & Alert Matrix requires at least one callout item.');
  }
  if (config.layout && !['stacked', 'grid-2', 'grid-3'].includes(config.layout)) {
    errors.push('Layout must be one of: stacked, grid-2, grid-3.');
  }
  return { valid: errors.length === 0, errors };
}
