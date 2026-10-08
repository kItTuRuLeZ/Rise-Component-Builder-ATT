import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeRichText, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Interactive Metric Dial / Gauge Component
 * @typedef {Object} DialGaugeConfig
 * @property {string} [title] - Header title
 * @property {string} [content] - Explanatory caption / instructions
 * @property {string} [unit] - Metric unit (e.g., Mbps, ms, %, Gbps)
 * @property {number} [minValue] - Minimum scale value
 * @property {number} [maxValue] - Maximum scale value
 * @property {number} [initialValue] - Starting dial value
 * @property {number} [step] - Value step increment
 * @property {Array<{title: string, content: string, rangeMin: number, rangeMax: number, badgeLabel?: string, badgeTone?: string}>} items
 */

export const id = 'dial-gauge';
export const name = 'Interactive Metric Dial / Gauge';
export const category = 'interactive';

/** @type {DialGaugeConfig} */
export const defaultConfig = {
  title: '5G Network Throughput & Latency Explorer',
  content: 'Adjust the metric dial or select a scenario below to explore operational characteristics across network operating tiers.',
  unit: 'Mbps',
  minValue: 0,
  maxValue: 1000,
  initialValue: 450,
  step: 10,
  items: [
    {
      title: 'Legacy Wireless Tier',
      rangeMin: 0,
      rangeMax: 100,
      badgeLabel: 'Basic Throughput',
      badgeTone: 'neutral',
      content: '<strong>Latency: 65–120 ms</strong><br>Sufficient for standard email, static web browsing, and compressed audio streaming. Experiences buffering during concurrent high-definition video streams or large cloud data synchronization.'
    },
    {
      title: 'Enhanced 5G Mid-Band',
      rangeMin: 100,
      rangeMax: 600,
      badgeLabel: 'Optimized Broadband',
      badgeTone: 'info',
      content: '<strong>Latency: 20–35 ms</strong><br>Empowers seamless 4K multi-device video streaming, real-time collaboration platforms, and rapid multi-gigabyte file transfers with minimal latency.'
    },
    {
      title: '5G+ Ultra-Wideband & Fiber Core',
      rangeMin: 600,
      rangeMax: 1000,
      badgeLabel: 'Enterprise Gigabit',
      badgeTone: 'primary',
      content: '<strong>Latency: < 10 ms</strong><br>Mission-critical tier supporting augmented reality (AR), remote precision robotics, ultra-dense enterprise campuses, and instantaneous cloud synchronization.'
    }
  ]
};

export const editorSchema = getEditorSchema(id);

const meterIcon = getAttIconSvg('high-meter', { width: 20, height: 20, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const minVal = Number.isFinite(Number(config.minValue)) ? Number(config.minValue) : 0;
  const maxVal = Number.isFinite(Number(config.maxValue)) && Number(config.maxValue) > minVal ? Number(config.maxValue) : 1000;
  const rawInit = Number.isFinite(Number(config.initialValue)) ? Number(config.initialValue) : (minVal + maxVal) / 2;
  const initialVal = Math.max(minVal, Math.min(maxVal, rawInit));
  const step = Number.isFinite(Number(config.step)) && Number(config.step) > 0 ? Number(config.step) : 1;
  const unit = config.unit !== undefined ? String(config.unit) : 'Mbps';
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;

  // Compute active item index
  let activeItemIndex = items.findIndex(item => initialVal >= (item.rangeMin ?? minVal) && initialVal <= (item.rangeMax ?? maxVal));
  if (activeItemIndex === -1) activeItemIndex = 0;
  const activeItem = items[activeItemIndex] || items[0];

  const presetsHtml = items.map((item, idx) => {
    const targetVal = Math.round(((item.rangeMin ?? minVal) + (item.rangeMax ?? maxVal)) / 2);
    const isSelected = idx === activeItemIndex;
    return `
      <button type="button" class="dial-preset-btn ${isSelected ? 'is-active' : ''}"
        id="${instanceId}-preset-${idx}"
        data-target-value="${targetVal}"
        data-item-index="${idx}"
        aria-pressed="${isSelected ? 'true' : 'false'}">
        <span class="dial-preset-label">${richInline(item.title, `Tier ${idx + 1}`)}</span>
        <span class="dial-preset-val">${targetVal} ${escapeHTML(unit)}</span>
      </button>
    `;
  }).join('');

  const initFraction = (initialVal - minVal) / (maxVal - minVal || 1);
  const initNeedleAngle = -90 + (initFraction * 180);

  return `
    <div class="dial-gauge-card" id="${instanceId}-gauge-card"
      data-min="${minVal}"
      data-max="${maxVal}"
      data-value="${initialVal}"
      data-step="${step}"
      data-unit="${escapeAttribute(unit)}">
      ${config.title ? `
        <div class="dial-header">
          <div class="dial-header-icon">${meterIcon}</div>
          <h3 class="dial-title">${richInline(config.title)}</h3>
        </div>
      ` : ''}
      ${config.content ? `<p class="dial-description">${sanitizeRichText(config.content)}</p>` : ''}

      <div class="dial-main-layout">
        <div class="dial-interactive-panel">
          <div class="dial-svg-stage" id="${instanceId}-stage">
            <svg class="dial-gauge-svg" viewBox="0 0 300 180" width="100%" height="100%" aria-hidden="true">
              <!-- Background Arc -->
              <path class="dial-track-bg" d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke="var(--border-color, #DCDFE3)" stroke-width="20" stroke-linecap="round"/>
              <!-- Active Progress Arc -->
              <path class="dial-track-active" id="${instanceId}-active-arc" d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke="var(--primary, #00388F)" stroke-width="20" stroke-linecap="round" stroke-dasharray="377" stroke-dashoffset="188"/>
              <!-- Needle Indicator centered at (150, 150) -->
              <g transform="translate(150, 150)">
                <g class="dial-needle-group" id="${instanceId}-needle" style="transform: rotate(${initNeedleAngle}deg);" transform="rotate(${initNeedleAngle})">
                  <polygon points="-4,-10 0,-108 4,-10" fill="var(--primary, #00388F)"/>
                  <circle cx="0" cy="0" r="16" fill="var(--primary, #00388F)"/>
                  <circle cx="0" cy="0" r="7" fill="var(--bg-card, #FFFFFF)"/>
                </g>
              </g>
              <!-- Min/Max Labels -->
              <text x="30" y="174" class="dial-scale-label" text-anchor="middle">${minVal}</text>
              <text x="270" y="174" class="dial-scale-label" text-anchor="middle">${maxVal}</text>
            </svg>
          </div>

          <div class="dial-readout" id="${instanceId}-readout">
            <span class="dial-readout-value" id="${instanceId}-val-display">${initialVal}</span>
            <span class="dial-readout-unit">${escapeHTML(unit)}</span>
          </div>

          <div class="dial-controls-group">
            <div class="dial-slider-wrapper">
              <input type="range" class="dial-slider-input" id="${instanceId}-slider"
                role="slider"
                aria-orientation="horizontal"
                min="${minVal}"
                max="${maxVal}"
                step="${step}"
                value="${initialVal}"
                aria-valuenow="${initialVal}"
                aria-valuemin="${minVal}"
                aria-valuemax="${maxVal}"
                aria-valuetext="${initialVal} ${escapeAttribute(unit)}, ${escapeAttribute(richTextToPlain(activeItem.title) || '')}"
                aria-label="Metric dial value slider">
            </div>
            <div class="dial-direct-input-wrap">
              <label for="${instanceId}-number-input" class="sr-only">Direct numeric value input</label>
              <input type="number" class="dial-number-input" id="${instanceId}-number-input"
                min="${minVal}" max="${maxVal}" step="${step}" value="${initialVal}"
                aria-label="Direct numeric input for metric dial">
              <span class="dial-number-unit">${escapeHTML(unit)}</span>
            </div>
          </div>

          <div class="dial-presets-row" id="${instanceId}-presets">
            ${presetsHtml}
          </div>

          <div class="dial-actions-bar">
            <button type="button" class="dial-reset-btn" id="${instanceId}-reset-btn" aria-label="Reset dial to baseline value (${initialVal} ${escapeAttribute(unit)})">
              <span>Reset to Baseline</span>
            </button>
          </div>
        </div>

        <div class="dial-insight-panel" id="${instanceId}-insight" aria-live="polite">
          <div class="dial-insight-badge" id="${instanceId}-insight-badge">
            ${richInline(activeItem.badgeLabel, 'Active status')}
          </div>
          <h4 class="dial-insight-title" id="${instanceId}-insight-title">
            ${richInline(activeItem.title, '')}
          </h4>
          <div class="dial-insight-body" id="${instanceId}-insight-body">
            ${sanitizeRichText(activeItem.content || '')}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .dial-gauge-card {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .dial-header {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
    }
    .dial-header-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--primary, #00388F);
      flex-shrink: 0;
    }
    .dial-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
      margin: 0;
    }
    .dial-description {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      margin: 0;
    }
    .dial-main-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--att-space-5, 24px);
      align-items: stretch;
    }
    @media (max-width: 768px) {
      .dial-main-layout {
        grid-template-columns: 1fr;
      }
    }
    .dial-interactive-panel {
      background-color: var(--bg-body, #F3F4F5);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-4, 16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--att-space-3, 12px);
    }
    .dial-svg-stage {
      width: 100%;
      max-width: 280px;
      aspect-ratio: 300 / 180;
      position: relative;
    }
    .dial-needle-group {
      transform-origin: 0 0;
      transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .dial-needle-group {
        transition: none;
      }
      .dial-track-active {
        transition: none;
      }
    }
    .dial-track-active {
      transition: stroke-dashoffset 250ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dial-scale-label {
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      fill: var(--text-muted, #4B5563);
    }
    .dial-readout {
      display: flex;
      align-items: baseline;
      gap: var(--att-space-2, 8px);
    }
    .dial-readout-value {
      font-size: var(--att-fs-h2, 1.75rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--primary, #00388F);
      font-variant-numeric: tabular-nums;
    }
    .dial-readout-unit {
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-medium, 500);
      color: var(--text-muted, #4B5563);
    }
    .dial-controls-group {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
      width: 100%;
    }
    .dial-slider-wrapper {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
    }
    .dial-slider-input {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: var(--border-color, #DCDFE3);
      accent-color: var(--primary, #00388F);
      cursor: pointer;
    }
    .dial-slider-input:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .dial-direct-input-wrap {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-sm, 8px);
      padding: 4px 8px;
      flex-shrink: 0;
    }
    .dial-direct-input-wrap:focus-within {
      border-color: var(--primary, #00388F);
      outline: 2px solid var(--primary, #00388F);
    }
    .dial-number-input {
      width: 60px;
      border: none;
      background: transparent;
      color: var(--text-main);
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      font-variant-numeric: tabular-nums;
      text-align: right;
      padding: 2px 0;
      -moz-appearance: textfield;
    }
    .dial-number-input::-webkit-outer-spin-button,
    .dial-number-input::-webkit-inner-spin-button {
      margin: 0;
    }
    .dial-number-input:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .dial-number-unit {
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-medium, 500);
      color: var(--text-muted, #4B5563);
    }
    .dial-actions-bar {
      display: flex;
      justify-content: center;
      width: 100%;
    }
    .dial-reset-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 4px var(--att-space-3, 12px);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: 9999px;
      background-color: transparent;
      color: var(--text-muted, #4B5563);
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-semibold, 600);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .dial-reset-btn:hover {
      border-color: var(--primary, #00388F);
      color: var(--primary, #00388F);
      background-color: var(--bg-card, #FFFFFF);
    }
    .dial-reset-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .dial-presets-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
      width: 100%;
      justify-content: center;
    }
    .dial-preset-btn {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      padding: var(--att-space-2, 8px) var(--att-space-3, 12px);
      border-radius: var(--att-radius-sm, 12px);
      border: 1px solid var(--border-color, #DCDFE3);
      background-color: var(--bg-card, #FFFFFF);
      color: var(--text-main);
      cursor: pointer;
      font-family: var(--att-font-sans, sans-serif);
      transition: all 180ms ease;
      min-height: 44px;
      flex: 1 1 calc(33.333% - 8px);
      min-width: 80px;
    }
    .dial-preset-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .dial-preset-btn:hover {
      border-color: var(--att-blue, #009FDB);
      background-color: var(--att-grey-1, #F3F4F5);
    }
    .dial-preset-btn.is-active {
      border-color: var(--primary, #00388F);
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
    }
    .dial-preset-btn.is-active .dial-preset-val {
      color: var(--att-blue, #009FDB);
    }
    .dial-preset-label {
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      text-align: center;
    }
    .dial-preset-val {
      font-size: var(--att-fs-xs, 0.8125rem);
      color: var(--text-muted, #4B5563);
      font-variant-numeric: tabular-nums;
    }
    .dial-insight-panel {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
      justify-content: center;
    }
    .dial-insight-badge {
      align-self: flex-start;
      display: inline-block;
      padding: 4px var(--att-space-3, 12px);
      border-radius: 9999px;
      background-color: var(--att-blue, #009FDB);
      color: #FFFFFF;
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      letter-spacing: normal;
    }
    .dial-insight-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--primary, #00388F);
      margin: 0;
    }
    .dial-insight-body {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
    }
  `;
}

export function generateJS(config, instanceId) {
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;
  const itemsJson = JSON.stringify(items);

  return `
    function initComponent() {
      var root = document.getElementById('${instanceId}-gauge-card');
      var slider = document.getElementById('${instanceId}-slider');
      var numberInput = document.getElementById('${instanceId}-number-input');
      var resetBtn = document.getElementById('${instanceId}-reset-btn');
      var valDisplay = document.getElementById('${instanceId}-val-display');
      var needle = document.getElementById('${instanceId}-needle');
      var activeArc = document.getElementById('${instanceId}-active-arc');
      var insightBadge = document.getElementById('${instanceId}-insight-badge');
      var insightTitle = document.getElementById('${instanceId}-insight-title');
      var insightBody = document.getElementById('${instanceId}-insight-body');
      var presetsContainer = document.getElementById('${instanceId}-presets');

      if (!root || !slider || !valDisplay || !needle) return;

      var minVal = Number(root.dataset.min) || 0;
      var maxVal = Number(root.dataset.max) || 1000;
      var initialBaseline = Number(root.dataset.value) || minVal;
      var unit = root.dataset.unit || '';
      var items = ${itemsJson};
      var arcTotalLength = 377; // semi-circle arc length for r=120 (pi * 120 ≈ 377)
      var hasInteracted = false;

      function updateDial(val) {
        var clamped = Math.max(minVal, Math.min(maxVal, Number(val) || minVal));
        var range = maxVal - minVal;
        var fraction = range > 0 ? (clamped - minVal) / range : 0;

        // Needle rotation: -90deg at min (pointing left), +90deg at max (pointing right)
        var needleAngle = -90 + (fraction * 180);
        needle.style.transform = 'rotate(' + needleAngle + 'deg)';
        needle.setAttribute('transform', 'rotate(' + needleAngle + ')');

        // Active arc stroke offset
        if (activeArc) {
          var offset = arcTotalLength * (1 - fraction);
          activeArc.setAttribute('stroke-dashoffset', String(offset));
        }

        // Value text & direct number input
        valDisplay.textContent = String(clamped);
        slider.value = String(clamped);
        if (numberInput && document.activeElement !== numberInput) {
          numberInput.value = String(clamped);
        }

        // Find active tier
        var activeIndex = items.findIndex(function(item) {
          var rMin = ('rangeMin' in item) ? Number(item.rangeMin) : minVal;
          var rMax = ('rangeMax' in item) ? Number(item.rangeMax) : maxVal;
          return clamped >= rMin && clamped <= rMax;
        });
        if (activeIndex === -1) activeIndex = 0;
        var activeItem = items[activeIndex] || items[0];

        // Update insight card
        if (insightBadge && activeItem.badgeLabel) {
          insightBadge.textContent = activeItem.badgeLabel;
        }
        if (insightTitle) {
          insightTitle.textContent = activeItem.title || '';
        }
        if (insightBody) {
          insightBody.innerHTML = activeItem.content || '';
        }

        // Update ARIA on slider
        slider.setAttribute('aria-valuenow', String(clamped));
        slider.setAttribute('aria-valuetext', clamped + ' ' + unit + ', ' + (activeItem.title || ''));

        // Update preset buttons state
        if (presetsContainer) {
          var buttons = presetsContainer.querySelectorAll('.dial-preset-btn');
          buttons.forEach(function(btn, idx) {
            var isSelected = idx === activeIndex;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
          });
        }

        if (!hasInteracted) {
          hasInteracted = true;
          viewedItems.add(activeIndex);
          updateProgress();
        }
      }

      slider.addEventListener('input', function(e) {
        updateDial(e.target.value);
      });

      if (numberInput) {
        numberInput.addEventListener('input', function(e) {
          var num = Number(e.target.value);
          if (Number.isFinite(num)) {
            updateDial(num);
          }
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          updateDial(initialBaseline);
        });
      }

      if (presetsContainer) {
        presetsContainer.addEventListener('click', function(e) {
          var btn = e.target.closest('.dial-preset-btn');
          if (!btn) return;
          var targetVal = Number(btn.dataset.targetValue);
          if (Number.isFinite(targetVal)) {
            updateDial(targetVal);
          }
        });
      }

      // Initial layout sync
      updateDial(slider.value);
    }
  `;
}

export function validate(config) {
  const errors = [];
  if (!config.items || !config.items.length) {
    errors.push('Interactive Metric Dial / Gauge requires at least one scenario item.');
  }
  if (config.minValue !== undefined && (typeof config.minValue !== 'number' || Number.isNaN(config.minValue))) {
    errors.push('Minimum value must be a valid number.');
  }
  if (config.maxValue !== undefined && (typeof config.maxValue !== 'number' || Number.isNaN(config.maxValue))) {
    errors.push('Maximum value must be a valid number.');
  }
  if (config.minValue !== undefined && config.maxValue !== undefined && config.minValue >= config.maxValue) {
    errors.push('Minimum value must be less than maximum value.');
  }
  if (config.initialValue !== undefined && (typeof config.initialValue !== 'number' || Number.isNaN(config.initialValue))) {
    errors.push('Initial value must be a valid number.');
  }
  return { valid: errors.length === 0, errors };
}
