import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'pricing-comparison';
export const name = 'Product Matrix Cards';
export const category = 'cards';
export const defaultConfig = {
  pricingMatrixMode: false,
  items: [
    { title: 'Starter Plan', content: '1 User [info: Single user seat license] • 5 Components/mo [info: Monthly export allotment] • Community Support' },
    { title: 'Professional', content: 'Unlimited Builders • 20 Components/mo • Priority Support [info: 24/7 turnaround SLA]', highlighted: true },
    { title: 'Enterprise Suite', content: 'Custom Domains • Unlimited Builders • Dedicated Success Agent [info: Direct phone & Slack bridge]' }
  ]
};
export const editorSchema = getEditorSchema(id);

function parseFeatureWithTooltip(rawFeature) {
  // Features are split on "•", so most arrive with a leading and trailing space (and rich text can
  // leave a trailing &nbsp;). The tooltip pattern is anchored to the end of the feature, so
  // untrimmed input made "1 User [info: …] " fail to match and show the raw [info: …] text to
  // learners; only the last feature in a list (no trailing space) was ever parsed.
  const trimmed = String(rawFeature).replace(/(?:&nbsp;|\s)+$/gi, '').trim();
  const match = trimmed.match(/^(.*?)\s*\[info:\s*(.*?)\]$/i);
  if (match) {
    return {
      text: richTextToPlain(match[1]),
      tooltip: richTextToPlain(match[2])
    };
  }
  // Plain text on purpose: the rich-text editor stores "&amp;" and wrapper tags, and every use below escapes once.
  return { text: richTextToPlain(rawFeature), tooltip: '' };
}

export function generateHTML(config, instanceId) {
  const isMatrixMode = config.pricingMatrixMode === true;

  if (isMatrixMode) {
    // Extract unique feature names across all tiers
    const allFeaturesSet = new Set();
    const tierFeatures = config.items.map(item => {
      const feats = (item.content || '').split('•').map(f => parseFeatureWithTooltip(f)).filter(f => f.text);
      feats.forEach(f => allFeaturesSet.add(f.text));
      return { item, feats };
    });
    const allFeaturesList = Array.from(allFeaturesSet);

    return `
      <div class="pricing-matrix-wrapper" id="${instanceId}">
        <div class="pricing-matrix-table" role="table" aria-label="Feature comparison matrix">
          <div class="matrix-row matrix-header-row" role="row">
            <div class="matrix-cell matrix-feature-cell header" role="columnheader">Features</div>
            ${config.items.map(item => `
              <div class="matrix-cell matrix-tier-cell header ${item.highlighted ? 'highlighted' : ''}" role="columnheader">
                <strong>${richInline(item.title, 'Plan')}</strong>
                ${item.highlighted ? '<span class="matrix-badge">Popular</span>' : ''}
              </div>
            `).join('')}
          </div>
          ${allFeaturesList.map(featName => `
            <div class="matrix-row" role="row">
              <div class="matrix-cell matrix-feature-cell" role="rowheader">${escapeHTML(featName)}</div>
              ${tierFeatures.map(tf => {
                const found = tf.feats.find(f => f.text === featName);
                const hasIt = Boolean(found);
                const tooltipHtml = found && found.tooltip ? `<span class="feature-tooltip-trigger" tabindex="0" aria-label="${escapeAttribute(found.tooltip)}" data-tooltip="${escapeAttribute(found.tooltip)}">?</span>` : '';
                return `
                  <div class="matrix-cell matrix-tier-cell ${tf.item.highlighted ? 'highlighted' : ''}" role="cell">
                    ${hasIt ? `<span class="matrix-check">&#10003;</span> ${tooltipHtml}` : '<span class="matrix-dash">&mdash;</span>'}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="pricing-table-container" id="${instanceId}">
      ${config.items.map((item, idx) => `
        <div class="pricing-card-item ${item.highlighted ? 'premium-highlight' : ''}" id="${instanceId}-card-${idx}">
          ${item.highlighted ? '<div class="popular-ribbon">Recommended</div>' : ''}
          <div class="pricing-tier-header">
            <h4>${richInline(item.title, 'Service plan')}</h4>
          </div>
          <div class="pricing-features-list">
            ${(item.content || '').split('•').map(feat => {
              const { text, tooltip } = parseFeatureWithTooltip(feat);
              if (!text) return '';
              const tooltipHtml = tooltip ? `
                <span class="feature-tooltip-trigger" tabindex="0" aria-label="${escapeAttribute(tooltip)}" data-tooltip="${escapeAttribute(tooltip)}">?</span>
              ` : '';
              return `
              <div class="pricing-feature-line">
                ${getAttIconSvg('check', { className: 'tick-icon', width: 16, height: 16, ariaHidden: true })}
                <span>${escapeHTML(text)}</span>
                ${tooltipHtml}
              </div>
            `;
            }).join('')}
          </div>
          <button class="pricing-action-btn" type="button" data-idx="${idx}" data-action-url="${escapeAttribute(item.actionUrl || '')}">Choose plan</button>
        </div>
      `).join('')}
    </div>
  `;
}

export function generateCSS() {
  return `
    .pricing-table-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--att-space-5, 20px);
      align-items: stretch;
    }
    .pricing-card-item {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      position: relative;
      transition: all 0.2s;
    }
    .pricing-card-item.premium-highlight {
      border-color: var(--accent);
      box-shadow: var(--shadow-lg);
    }
    .pricing-card-item.selected {
      border-color: var(--primary);
      box-shadow: var(--att-shadow-2, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
    }
    .popular-ribbon {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--accent);
      color: var(--text-main);
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      padding: 3px 12px;
      border-radius: var(--att-radius-pill, 999px);
      letter-spacing: normal;
    }
    .pricing-tier-header {
      margin-bottom: var(--att-space-4, 16px);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: var(--att-space-3, 12px);
    }
    .pricing-tier-header h4 {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
      margin: 0;
    }
    .pricing-features-list {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 10px);
      flex: 1;
      margin-bottom: var(--att-space-5, 20px);
    }
    .pricing-feature-line {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      position: relative;
    }
    .tick-icon {
      color: var(--accent);
      flex-shrink: 0;
    }
    .feature-tooltip-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: var(--border-color);
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 700;
      cursor: help;
      position: relative;
    }
    .feature-tooltip-trigger:hover::after, .feature-tooltip-trigger:focus-visible::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: #000;
      color: #fff;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .pricing-action-btn {
      width: 100%;
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      padding: 10px 16px;
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      transition: all var(--animation-speed);
      color: var(--primary);
    }
    .pricing-card-item.premium-highlight .pricing-action-btn {
      background-color: var(--primary);
      border-color: var(--primary);
      color: var(--on-primary);
    }
    .pricing-card-item:hover {
      box-shadow: var(--att-shadow-2, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
    }
    .pricing-action-btn:hover {
      border-color: var(--primary-hover);
      color: var(--primary-hover);
    }
    .pricing-card-item.premium-highlight .pricing-action-btn:hover {
      background-color: var(--primary-hover);
      border-color: var(--primary-hover);
      color: var(--on-primary);
    }
    .pricing-action-btn:active {
      transform: scale(0.98);
    }
    .pricing-action-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    /* Matrix Table Layout */
    .pricing-matrix-wrapper {
      overflow-x: auto;
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, 16px);
      box-shadow: var(--shadow-style);
      padding: 16px;
    }
    .pricing-matrix-table {
      display: table;
      width: 100%;
      border-collapse: collapse;
      min-width: 480px;
    }
    .matrix-row {
      display: table-row;
      border-bottom: 1px solid var(--border-color);
    }
    .matrix-row:last-child {
      border-bottom: none;
    }
    .matrix-cell {
      display: table-cell;
      padding: 12px 16px;
      vertical-align: middle;
      font-size: 14px;
      color: var(--text-main);
    }
    .matrix-cell.header {
      font-weight: 700;
      border-bottom: 2px solid var(--primary);
    }
    .matrix-feature-cell {
      font-weight: 600;
      width: 40%;
    }
    .matrix-tier-cell {
      text-align: center;
    }
    .matrix-tier-cell.highlighted {
      background-color: rgba(0, 87, 184, 0.04);
    }
    .matrix-badge {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: var(--primary);
      margin-top: 2px;
    }
    .matrix-check {
      color: var(--att-cta-bg, #00388F);
      font-weight: 800;
      font-size: 16px;
    }
    .matrix-dash {
      color: var(--text-muted);
    }`;
}

export function generateJS() {
  return `
    function initComponent() {
      document.querySelectorAll('.pricing-action-btn').forEach(function(button, idx) {
        button.addEventListener('click', function() {
          document.querySelectorAll('.pricing-card-item').forEach(function(card) {
            card.classList.remove('selected');
          });
          document.querySelectorAll('.pricing-action-btn').forEach(function(btn) {
            btn.textContent = 'Choose plan';
          });
          button.closest('.pricing-card-item').classList.add('selected');
          button.textContent = 'Selected';
          viewedItems.add(idx);
          updateProgress();
          var actionUrl = button.getAttribute('data-action-url');
          if (actionUrl) window.open(actionUrl, '_blank', 'noopener,noreferrer');
        });
      });
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length >= 2 ? [] : ['Add at least two comparison options.'];
  return { valid: errors.length === 0, errors };
}

