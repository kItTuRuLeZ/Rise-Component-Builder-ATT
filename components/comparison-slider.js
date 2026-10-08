import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeCSSColor, sanitizeRichText, sanitizeURL, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Before & After Comparison Slider Component
 * @typedef {Object} ComparisonSliderConfig
 * @property {string} [title] - Header title
 * @property {string} [content] - Explanatory caption / instructions
 * @property {number} [initialPosition] - Starting slider position (0-100)
 * @property {string} [orientation] - 'horizontal' or 'vertical'
 * @property {string} [aspectRatio] - '16/9', '4/3', '3/2', '1/1', '3/4', '9/16', '2/1'
 * @property {string} [imageFit] - 'cover' or 'contain'
 * @property {string} [stageBgColor] - Background color fill for image stage/panes (default '#FFFFFF')
 * @property {boolean} [showLabels] - Whether to show Before/After floating badges
 * @property {Array<{beforeImage?: string, afterImage?: string, beforeLabel?: string, afterLabel?: string, beforeAltText?: string, afterAltText?: string, imageFit?: string}>} items
 */

export const id = 'comparison-slider';
export const name = 'Before & After Comparison Slider';
export const category = 'interactive';

/** @type {ComparisonSliderConfig} */
export const defaultConfig = {
  title: '5G Infrastructure Modernization',
  content: 'Drag the slider handle or use the arrow keys to compare network capabilities before and after fiber modernization.',
  initialPosition: 50,
  orientation: 'horizontal',
  aspectRatio: '16/9',
  imageFit: 'cover',
  stageBgColor: '#FFFFFF',
  showLabels: true,
  items: [
    {
      beforeImage: '',
      afterImage: '',
      beforeLabel: 'Before (Legacy Copper)',
      afterLabel: 'After (Fiber Optic 5G)',
      beforeAltText: 'Legacy copper wire network diagram with bandwidth constraints',
      afterAltText: 'Modern ultra-fast fiber optic 5G infrastructure diagram',
      imageFit: 'cover'
    }
  ]
};

export const editorSchema = getEditorSchema(id);

const handleArrowsHorizontalIcon = getAttIconSvg('arrows-horizontal', { width: 18, height: 18, ariaHidden: true });
const handleArrowsVerticalIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l4 4h-3v10h3l-4 4-4-4h3V7H8z"/></svg>`;

function renderSchematicBeforeSvg() {
  return `<svg class="comparison-fallback-svg before-svg" viewBox="0 0 800 450" width="100%" height="100%" aria-hidden="true">
    <rect width="800" height="450" fill="var(--bg-body, #F3F4F5)"/>
    <g stroke="var(--border-color, #DCDFE3)" stroke-width="2" stroke-dasharray="6,6">
      <line x1="100" y1="120" x2="700" y2="120"/>
      <line x1="100" y1="225" x2="700" y2="225"/>
      <line x1="100" y1="330" x2="700" y2="330"/>
    </g>
    <rect x="120" y="160" width="220" height="130" rx="16" fill="var(--bg-card, #FFFFFF)" stroke="var(--border-color, #DCDFE3)" stroke-width="2"/>
    <circle cx="170" cy="225" r="28" fill="var(--att-grey-2, #DCDFE3)"/>
    <rect x="220" y="200" width="90" height="12" rx="6" fill="var(--text-muted, #4B5563)"/>
    <rect x="220" y="225" width="60" height="10" rx="5" fill="var(--border-color, #DCDFE3)"/>
    <text x="400" y="235" font-family="var(--att-font-sans, sans-serif)" font-size="20" font-weight="700" fill="var(--text-muted, #4B5563)" text-anchor="middle">Legacy Baseline Architecture</text>
  </svg>`;
}

function renderSchematicAfterSvg() {
  return `<svg class="comparison-fallback-svg after-svg" viewBox="0 0 800 450" width="100%" height="100%" aria-hidden="true">
    <rect width="800" height="450" fill="var(--bg-card, #FFFFFF)"/>
    <g stroke="var(--att-blue, #009FDB)" stroke-width="2" opacity="0.35">
      <line x1="100" y1="120" x2="700" y2="120"/>
      <line x1="100" y1="225" x2="700" y2="225"/>
      <line x1="100" y1="330" x2="700" y2="330"/>
    </g>
    <rect x="460" y="160" width="220" height="130" rx="16" fill="var(--bg-body, #F3F4F5)" stroke="var(--att-blue, #009FDB)" stroke-width="2"/>
    <circle cx="510" cy="225" r="28" fill="var(--att-blue, #009FDB)"/>
    <rect x="560" y="200" width="90" height="12" rx="6" fill="var(--primary, #00388F)"/>
    <rect x="560" y="225" width="60" height="10" rx="5" fill="var(--att-blue, #009FDB)"/>
    <text x="400" y="235" font-family="var(--att-font-sans, sans-serif)" font-size="20" font-weight="700" fill="var(--primary, #00388F)" text-anchor="middle">Upgraded 5G Fiber Core</text>
  </svg>`;
}

export function generateHTML(config, instanceId) {
  const item = config.items?.[0] || defaultConfig.items[0];
  const initialPos = Math.max(0, Math.min(100, Number(config.initialPosition) || 50));
  const isVertical = config.orientation === 'vertical';
  const showLabels = config.showLabels !== false;
  const beforeLabel = item.beforeLabel || 'Before';
  const afterLabel = item.afterLabel || 'After';

  const imageFit = (item.imageFit === 'contain' || config.imageFit === 'contain') ? 'contain' : 'cover';
  const stageBgColor = sanitizeCSSColor(config.stageBgColor, '#FFFFFF');
  const aspectMap = {
    '16/9': '16 / 9',
    '4/3': '4 / 3',
    '3/2': '3 / 2',
    '1/1': '1 / 1',
    '3/4': '3 / 4',
    '9/16': '9 / 16',
    '2/1': '2 / 1'
  };
  const aspectCss = aspectMap[config.aspectRatio] || '16 / 9';

  const beforeSrc = sanitizeURL(item.beforeImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
  const afterSrc = sanitizeURL(item.afterImage, { allowDataImage: true, allowBlob: true, allowRelative: true });

  const beforeMedia = beforeSrc
    ? `<img src="${escapeAttribute(beforeSrc)}" alt="${escapeAttribute(item.beforeAltText || richTextToPlain(beforeLabel))}" class="comparison-img">`
    : renderSchematicBeforeSvg();

  const afterMedia = afterSrc
    ? `<img src="${escapeAttribute(afterSrc)}" alt="${escapeAttribute(item.afterAltText || richTextToPlain(afterLabel))}" class="comparison-img">`
    : renderSchematicAfterSvg();

  return `
    <div class="comparison-slider-card ${isVertical ? 'orientation-vertical' : 'orientation-horizontal'}" id="${instanceId}-slider-card" style="--slider-pos: ${initialPos}%;">
      ${config.title ? `<h3 class="comparison-title">${richInline(config.title)}</h3>` : ''}
      ${config.content ? `<p class="comparison-description">${sanitizeRichText(config.content)}</p>` : ''}
      <div class="comparison-stage" id="${instanceId}-stage" role="region" aria-label="Before and after visual comparison" style="--comparison-aspect-ratio: ${aspectCss}; --comparison-img-fit: ${imageFit}; --comparison-stage-bg: ${stageBgColor};">
        <div class="comparison-pane pane-after">
          ${afterMedia}
          ${showLabels ? `<span class="comparison-badge badge-after">${richInline(item.afterLabel, 'After')}</span>` : ''}
        </div>
        <div class="comparison-pane pane-before" id="${instanceId}-pane-before">
          ${beforeMedia}
          ${showLabels ? `<span class="comparison-badge badge-before">${richInline(item.beforeLabel, 'Before')}</span>` : ''}
        </div>
        <div class="comparison-divider-line" id="${instanceId}-divider">
          <button type="button" class="comparison-handle" id="${instanceId}-handle"
            role="slider"
            tabindex="0"
            aria-orientation="${isVertical ? 'vertical' : 'horizontal'}"
            aria-label="Comparison slider position"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${initialPos}"
            aria-valuetext="${initialPos} percent">
            ${isVertical ? handleArrowsVerticalIcon : handleArrowsHorizontalIcon}
          </button>
        </div>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .comparison-slider-card {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .comparison-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
      margin: 0;
    }
    .comparison-description {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-muted);
      max-width: 70ch;
      margin: 0;
    }
    .comparison-stage {
      position: relative;
      width: 100%;
      aspect-ratio: var(--comparison-aspect-ratio, 16 / 9);
      min-height: 240px;
      border-radius: var(--att-radius-md, 12px);
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      background-color: var(--comparison-stage-bg, #FFFFFF);
      border: 1px solid var(--border-color);
    }
    .comparison-pane {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--comparison-stage-bg, #FFFFFF);
    }
    .pane-after {
      z-index: 1;
    }
    .orientation-horizontal .pane-before {
      z-index: 2;
      clip-path: polygon(0 0, var(--slider-pos, 50%) 0, var(--slider-pos, 50%) 100%, 0 100%);
      -webkit-clip-path: polygon(0 0, var(--slider-pos, 50%) 0, var(--slider-pos, 50%) 100%, 0 100%);
    }
    .orientation-vertical .pane-before {
      z-index: 2;
      clip-path: polygon(0 0, 100% 0, 100% var(--slider-pos, 50%), 0 var(--slider-pos, 50%));
      -webkit-clip-path: polygon(0 0, 100% 0, 100% var(--slider-pos, 50%), 0 var(--slider-pos, 50%));
    }
    .comparison-img, .comparison-fallback-svg {
      width: 100%;
      height: 100%;
      object-fit: var(--comparison-img-fit, cover);
      object-position: center;
      display: block;
      pointer-events: none;
    }
    .comparison-badge {
      position: absolute;
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 14px;
      border-radius: var(--att-radius-pill, 999px);
      z-index: 5;
      pointer-events: none;
      box-shadow: var(--shadow-sm);
    }
    .orientation-horizontal .badge-before {
      top: 14px;
      left: 14px;
      background-color: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .orientation-horizontal .badge-after {
      top: 14px;
      right: 14px;
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .orientation-vertical .badge-before {
      top: 14px;
      left: 14px;
      background-color: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .orientation-vertical .badge-after {
      bottom: 14px;
      left: 14px;
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .orientation-horizontal .comparison-divider-line {
      position: absolute;
      top: 0;
      bottom: 0;
      left: var(--slider-pos, 50%);
      width: 2px;
      background-color: var(--primary);
      z-index: 10;
      transform: translateX(-50%);
      pointer-events: none;
    }
    .orientation-vertical .comparison-divider-line {
      position: absolute;
      left: 0;
      right: 0;
      top: var(--slider-pos, 50%);
      height: 2px;
      background-color: var(--primary);
      z-index: 10;
      transform: translateY(-50%);
      pointer-events: none;
    }
    .comparison-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background-color: var(--primary);
      color: var(--on-primary);
      border: 3px solid var(--bg-card);
      box-shadow: var(--att-shadow-2, 0 4px 6px -1px rgba(0, 0, 0, 0.2));
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      transition: background-color var(--att-dur-base, 0.2s) ease, transform 0.1s ease;
      touch-action: none;
    }
    .orientation-horizontal .comparison-handle {
      cursor: ew-resize;
    }
    .orientation-vertical .comparison-handle {
      cursor: ns-resize;
    }
    .comparison-handle:hover {
      background-color: var(--primary-hover);
    }
    .comparison-handle:active {
      transform: translate(-50%, -50%) scale(0.96);
    }
    .comparison-handle:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .comparison-handle {
        transition: none !important;
      }
    }`;
}

export function generateJS(config, instanceId) {
  const initialPos = Math.max(0, Math.min(100, Number(config.initialPosition) || 50));
  const isVertical = config.orientation === 'vertical';

  return `
    function initComponent() {
      var root = document.getElementById('${instanceId}-slider-card');
      var stage = document.getElementById('${instanceId}-stage');
      var handle = document.getElementById('${instanceId}-handle');
      if (!root || !stage || !handle) return;

      var currentPos = ${initialPos};
      var isVertical = ${isVertical};
      var isDragging = false;
      var hasInteracted = false;

      function setPosition(pct) {
        var clamped = Math.max(0, Math.min(100, pct));
        currentPos = clamped;
        root.style.setProperty('--slider-pos', clamped + '%');
        handle.setAttribute('aria-valuenow', String(Math.round(clamped)));
        handle.setAttribute('aria-valuetext', Math.round(clamped) + ' percent');

        if (!hasInteracted) {
          hasInteracted = true;
          viewedItems.add(0);
          updateProgress();
        }
      }

      function updateFromPointer(clientX, clientY) {
        var rect = stage.getBoundingClientRect();
        if (isVertical) {
          if (!rect.height) return;
          var offset = clientY - rect.top;
          var pct = (offset / rect.height) * 100;
          setPosition(pct);
        } else {
          if (!rect.width) return;
          var offset = clientX - rect.left;
          var pct = (offset / rect.width) * 100;
          setPosition(pct);
        }
      }

      function onPointerDown(e) {
        isDragging = true;
        handle.focus();
        try {
          if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
        } catch (err) {}
        updateFromPointer(e.clientX, e.clientY);
      }

      function onPointerMove(e) {
        if (!isDragging) return;
        updateFromPointer(e.clientX, e.clientY);
      }

      function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        try {
          if (stage.releasePointerCapture) stage.releasePointerCapture(e.pointerId);
        } catch (err) {}
      }

      stage.addEventListener('pointerdown', onPointerDown);
      stage.addEventListener('pointermove', onPointerMove);
      stage.addEventListener('pointerup', onPointerUp);
      stage.addEventListener('pointercancel', onPointerUp);

      handle.addEventListener('keydown', function(e) {
        var step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setPosition(currentPos - step);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setPosition(currentPos + step);
        } else if (e.key === 'Home') {
          e.preventDefault();
          setPosition(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setPosition(100);
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          setPosition(currentPos + 15);
        } else if (e.key === 'PageDown') {
          e.preventDefault();
          setPosition(currentPos - 15);
        }
      });
    }
  `;
}

export function validate(config) {
  const errors = [];
  if (!config.items || !config.items.length) {
    errors.push('Comparison Slider requires at least one before/after item.');
  }
  if (config.initialPosition !== undefined && (typeof config.initialPosition !== 'number' || Number.isNaN(config.initialPosition) || config.initialPosition < 0 || config.initialPosition > 100)) {
    errors.push('Initial position must be a number between 0 and 100.');
  }
  return { valid: errors.length === 0, errors };
}

