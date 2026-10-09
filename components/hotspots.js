import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, richInline, richTextToPlain } from '../js/utilities.js';
import { validateHotspotCoordinates, combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Hotspots Component Configuration
 * @typedef {Object} HotspotsConfig
 * @property {string} [title] - Optional block header title
 * @property {string} [content] - Optional block instructions/content
 * @property {'tooltip'|'drawer'|'modal'} [calloutMode='tooltip'] - Callout presentation mode
 * @property {boolean} [showProgress=true] - Whether to show the discovery progress counter HUD
 * @property {boolean} [enableZoomPan=true] - Whether to enable interactive zoom and pan exploration
 * @property {boolean} [autoplayAudio=false] - Whether to auto-play narration audio upon selecting a marker
 * @property {string} [backgroundImage] - Background image URL
 * @property {string} [backgroundAltText] - Alt text for background image
 * @property {boolean} [backgroundDecorative] - Whether background is decorative
 * @property {'contain'|'cover'} [backgroundFit] - Image fit mode
 * @property {number} [backgroundFocalX=50] - Focal point X percentage
 * @property {number} [backgroundFocalY=50] - Focal point Y percentage
 * @property {Array<{
 *   title: string,
 *   content: string,
 *   x: string|number,
 *   y: string|number,
 *   markerType?: 'number'|'letter'|'icon',
 *   iconName?: string,
 *   audioSourceType?: 'upload'|'url',
 *   audioMediaId?: string,
 *   audioUrl?: string,
 *   audioTranscript?: string
 * }>} items - Array of hotspot items
 */

export const id = 'hotspots';
export const name = 'Interactive Hotspots';
export const category = 'interactive';

/** @type {HotspotsConfig} */
export const defaultConfig = {
  title: 'Interactive Facility & Infrastructure Explorer',
  content: 'Select the highlighted markers or use the zoom controls to inspect network components and operational zones.',
  calloutMode: 'tooltip',
  showProgress: true,
  enableZoomPan: true,
  autoplayAudio: false,
  items: [
    {
      title: 'High-Density Optical Fiber Hub',
      content: 'Central distribution termination managing multi-gigabit fiber backbones with redundant routing pathways.',
      x: '25',
      y: '40',
      markerType: 'icon',
      iconName: 'fiber',
      audioUrl: '',
      audioTranscript: ''
    },
    {
      title: 'Cloud Edge Routing Engine',
      content: 'Low-latency distributed switching cluster providing intelligent load-balancing and edge telemetry.',
      x: '50',
      y: '25',
      markerType: 'icon',
      iconName: 'cloud',
      audioUrl: '',
      audioTranscript: ''
    },
    {
      title: 'Dual-Line Power & UPS Subsystem',
      content: 'Enterprise uninterruptible power supply and generator backup maintaining five-nines (99.999%) operational uptime.',
      x: '75',
      y: '65',
      markerType: 'icon',
      iconName: 'ethernet',
      audioUrl: '',
      audioTranscript: ''
    }
  ]
};

export const editorSchema = getEditorSchema(id);

/**
 * Curated map of supported AT&T vector marker icons
 */
const MARKER_ICONS = {
  info: 'information-circle-filled',
  help: 'question-circle-filled',
  alert: 'exclamation-triangle-filled',
  search: 'search',
  star: 'star-filled',
  fiber: 'fiber',
  cloud: 'cloud',
  shield: 'check-shield',
  ethernet: 'ethernet',
  play: 'play',
  check: 'check-circle-filled',
  hotspot: 'hotspot',
  pin: 'location-pin',
  network: 'wireless-network',
  wifi: 'wifi'
};

function getMarkerIconSvg(iconName) {
  const resolved = MARKER_ICONS[iconName] || iconName || 'information-circle-filled';
  return getAttIconSvg(resolved, { width: 18, height: 18, ariaHidden: true });
}

const checkSmallIcon = getAttIconSvg('check', { width: 12, height: 12, ariaHidden: true });
const zoomInIcon = '<svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M15 7h2v8h8v2h-8v8h-2v-8H7v-2h8z"/></svg>';
const zoomOutIcon = '<svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 15h18v2H7z"/></svg>';
const zoomResetIcon = getAttIconSvg('arrows-horizontal', { width: 16, height: 16, ariaHidden: true });
const closeIcon = getAttIconSvg('close', { width: 18, height: 18, ariaHidden: true });
const discoveryIcon = getAttIconSvg('hotspot', { width: 18, height: 18, ariaHidden: true });
const audioNarrationIcon = getAttIconSvg('volume-3', { width: 16, height: 16, ariaHidden: true });

function getMarkerLabel(item, idx) {
  const type = item.markerType || 'number';
  if (type === 'letter') {
    return String.fromCharCode(65 + (idx % 26));
  }
  if (type === 'icon') {
    return getMarkerIconSvg(item.iconName || 'info');
  }
  return String(idx + 1);
}

export function generateHTML(config, instanceId) {
  const hotspotImage = config.backgroundImage || '';
  const calloutMode = config.calloutMode || 'tooltip';
  const showProgress = config.showProgress !== false;
  const enableZoomPan = config.enableZoomPan !== false;
  const items = Array.isArray(config.items) ? config.items : [];

  return `
    <div class="hotspots-container" data-callout-mode="${calloutMode}" data-zoom-enabled="${enableZoomPan}" id="${instanceId}">
      ${(config.title || config.content) ? `
        <div class="hotspot-header">
          ${config.title ? `<h3 class="hotspot-title">${richInline(config.title)}</h3>` : ''}
          ${config.content ? `<div class="hotspot-instructions">${config.content}</div>` : ''}
        </div>
      ` : ''}

      <div class="hotspot-hud-bar">
        ${showProgress ? `
          <div class="hotspot-progress-hud" role="status" aria-live="polite">
            <span class="hotspot-progress-icon">${discoveryIcon}</span>
            <div class="hotspot-progress-text">
              <span class="hotspot-progress-label">Exploration progress:</span>
              <span class="hotspot-progress-counter"><strong class="hotspot-visited-count">0</strong> of ${items.length} discovered (<span class="hotspot-visited-pct">0%</span>)</span>
            </div>
            <div class="hotspot-progress-track" aria-hidden="true">
              <div class="hotspot-progress-fill" style="width: 0%;"></div>
            </div>
          </div>
        ` : '<div></div>'}

        ${enableZoomPan ? `
          <div class="hotspot-zoom-toolbar" role="toolbar" aria-label="Interactive map zoom controls">
            <button type="button" class="hotspot-zoom-btn btn-zoom-in" title="Zoom In (Ctrl++)" aria-label="Zoom in">
              ${zoomInIcon}
            </button>
            <span class="hotspot-zoom-level" aria-live="polite" title="Current zoom scale">100%</span>
            <button type="button" class="hotspot-zoom-btn btn-zoom-out" title="Zoom Out (Ctrl+-)" aria-label="Zoom out" disabled>
              ${zoomOutIcon}
            </button>
            <button type="button" class="hotspot-zoom-btn btn-zoom-reset" title="Reset Zoom (Ctrl+0)" aria-label="Reset zoom">
              ${zoomResetIcon}
            </button>
          </div>
        ` : ''}
      </div>

      <div class="hotspot-stage-wrapper">
        <div class="hotspot-viewport" tabindex="0" role="region" aria-label="Interactive hotspot exploration area. Use arrow keys to pan when zoomed.">
          <div class="hotspot-canvas-surface">
            ${hotspotImage ? `<img class="hotspot-background-image" src="${escapeAttribute(hotspotImage)}" alt="${config.backgroundDecorative ? '' : escapeAttribute(config.backgroundAltText || '')}" ${config.backgroundDecorative ? 'aria-hidden="true"' : ''} style="object-fit:${config.backgroundFit || 'contain'};object-position:${config.backgroundFocalX ?? 50}% ${config.backgroundFocalY ?? 50}%;">` : `<svg viewBox="0 0 800 450" class="hotspot-schematic-svg" role="img" aria-label="Schematic pathway map">
              <rect width="100%" height="100%" class="hotspot-schematic-bg" rx="12"></rect>
              <circle cx="400" cy="225" r="100" fill="none" class="hotspot-schematic-ring" stroke-width="4" stroke-dasharray="10 10"></circle>
              <line x1="100" y1="225" x2="700" y2="225" class="hotspot-schematic-line" stroke-width="2"></line>
              <line x1="400" y1="50" x2="400" y2="400" class="hotspot-schematic-line" stroke-width="2"></line>
              <text x="400" y="230" text-anchor="middle" class="hotspot-schematic-label" font-size="16" font-weight="600">Infrastructure Schematic Map</text>
            </svg>`}

            ${items.map((item, idx) => {
              const markerLabel = getMarkerLabel(item, idx);
              const isIcon = item.markerType === 'icon';
              const audioSource = item.audioUrl || (item.audioSourceType === 'upload' && item.audioMediaId ? item.audioMediaId : '');
              const xVal = parseFloat(item.x) || 50;
              const yVal = parseFloat(item.y) || 50;
              const placementClass = yVal < 42 ? 'placement-bottom' : 'placement-top';
              const alignClass = xVal < 25 ? 'align-left' : (xVal > 75 ? 'align-right' : 'align-center');
              return `
                <div class="hotspot-point" style="left: ${item.x || '50'}%; top: ${item.y || '50'}%;">
                  <button type="button" class="hotspot-pin${isIcon ? ' has-vector-icon' : ''}" data-idx="${idx}" aria-expanded="false" aria-controls="${instanceId}-callout-${idx}" aria-label="Hotspot ${idx + 1}: ${escapeAttribute(richTextToPlain(item.title) || 'Indicator')}">
                    <span class="pulse" aria-hidden="true"></span>
                    <span class="pin-body" aria-hidden="true">
                      ${markerLabel}
                    </span>
                    <span class="pin-visited-check" aria-hidden="true">${checkSmallIcon}</span>
                  </button>

                  ${`
                    <div class="hotspot-tooltip ${placementClass} ${alignClass}${calloutMode === 'tooltip' ? '' : ' hotspot-callout-source'}" id="${instanceId}-callout-${idx}" role="region" aria-label="Hotspot details" aria-hidden="true"${calloutMode === 'tooltip' ? '' : ' hidden'}>
                      <div class="hotspot-callout-header">
                        <span class="hotspot-callout-tag">Marker ${idx + 1}</span>
                        <h4 class="hotspot-callout-title">${richInline(item.title, 'Indicator')}</h4>
                      </div>
                      <div class="hotspot-callout-content">${item.content || 'Details...'}</div>
                      ${audioSource ? `
                        <div class="hotspot-audio-narration">
                          <div class="hotspot-audio-label">
                            ${audioNarrationIcon} <span>Audio narration</span>
                          </div>
                          <audio class="hotspot-audio-elem" src="${escapeAttribute(audioSource)}" preload="none" controls></audio>
                          ${item.audioTranscript ? `
                            <details class="hotspot-audio-transcript">
                              <summary>Read audio transcript</summary>
                              <div class="transcript-body">${escapeHTML(item.audioTranscript)}</div>
                            </details>
                          ` : ''}
                        </div>
                      ` : ''}
                    </div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        ${calloutMode === 'drawer' ? `
          <div class="hotspot-drawer-backdrop" aria-hidden="true"></div>
          <aside class="hotspot-drawer" id="${instanceId}-drawer" role="dialog" aria-modal="false" aria-label="Hotspot details" aria-hidden="true">
            <div class="hotspot-drawer-header">
              <span class="hotspot-drawer-badge">Marker details</span>
              <h4 class="hotspot-drawer-title" id="${instanceId}-drawer-title">Select a Marker</h4>
              <button type="button" class="hotspot-drawer-close" aria-label="Close details panel">
                ${closeIcon}
              </button>
            </div>
            <div class="hotspot-drawer-body" id="${instanceId}-drawer-body">
              <p class="hotspot-drawer-placeholder">Click any marker pin on the map to explore technical details, operational procedures, and audio narration.</p>
            </div>
          </aside>
        ` : ''}

        ${calloutMode === 'modal' ? `
          <div class="hotspot-modal-backdrop" id="${instanceId}-modal-backdrop" aria-hidden="true">
            <div class="hotspot-modal" id="${instanceId}-modal" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-modal-title" aria-hidden="true">
              <div class="hotspot-modal-header">
                <div class="hotspot-modal-badge-wrapper">
                  <span class="hotspot-modal-badge" id="${instanceId}-modal-badge">Marker detail</span>
                </div>
                <button type="button" class="hotspot-modal-close" aria-label="Close dialog">
                  ${closeIcon}
                </button>
              </div>
              <h3 class="hotspot-modal-title" id="${instanceId}-modal-title">Marker title</h3>
              <div class="hotspot-modal-body" id="${instanceId}-modal-body"></div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .hotspots-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 20px);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      font-family: var(--att-font-family, var(--font-family, "ATT Aleck Sans", -apple-system, BlinkMacSystemFont, sans-serif));
    }

    .hotspot-header {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
    }

    .hotspot-title {
      font-size: var(--att-fs-h3, 1.375rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      margin: 0;
      line-height: var(--att-lh-heading, 1.25);
    }

    .hotspot-instructions {
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-muted);
      line-height: var(--att-lh-body, 1.5);
    }

    .hotspot-instructions p { margin: 0; }

    /* Exploration Progress HUD & Zoom Controls Bar */
    .hotspot-hud-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--att-space-3, 12px);
      padding-bottom: var(--att-space-2, 8px);
      border-bottom: 1px solid var(--border-color);
    }

    .hotspot-progress-hud {
      display: inline-flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-full, 9999px);
      padding: 6px 14px;
      font-size: var(--att-fs-body-sm, 0.875rem);
    }

    .hotspot-progress-icon {
      display: inline-flex;
      color: var(--primary);
    }

    .hotspot-progress-text {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text-main);
    }

    .hotspot-progress-label {
      color: var(--text-muted);
    }

    .hotspot-progress-track {
      width: 64px;
      height: 6px;
      background-color: var(--border-color);
      border-radius: var(--att-radius-full, 9999px);
      overflow: hidden;
    }

    .hotspot-progress-fill {
      height: 100%;
      background-color: var(--accent);
      border-radius: var(--att-radius-full, 9999px);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Zoom Toolbar */
    .hotspot-zoom-toolbar {
      display: inline-flex;
      align-items: center;
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 8px);
      padding: 2px;
      gap: 2px;
    }

    .hotspot-zoom-btn {
      background: transparent;
      border: none;
      color: var(--text-main);
      width: 28px;
      height: 28px;
      border-radius: var(--att-radius-sm, 4px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.15s, color 0.15s;
      padding: 0;
    }

    .hotspot-zoom-btn:hover:not(:disabled) {
      background-color: var(--bg-card);
      color: var(--primary);
    }

    .hotspot-zoom-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .hotspot-zoom-btn:focus-visible {
      outline: 3px solid var(--att-color-cobalt, #00388F);
      outline-offset: 1px;
    }

    .hotspot-zoom-level {
      font-size: var(--att-fs-caption, 0.75rem);
      font-weight: var(--att-fw-semibold, 600);
      color: var(--text-muted);
      min-width: 42px;
      text-align: center;
      user-select: none;
    }

    /* Stage, Viewport, Canvas Surface */
    .hotspot-stage-wrapper {
      position: relative;
      width: 100%;
      border-radius: var(--att-radius-lg, 16px);
      background: var(--bg-body);
      border: 1px solid var(--border-color);
    }

    .hotspot-viewport {
      position: relative;
      width: 100%;
      cursor: default;
      outline: 3px solid transparent;
      user-select: none;
      touch-action: pan-x pan-y;
      border-radius: var(--att-radius-lg, 16px);
    }

    .hotspot-viewport.is-zoomed {
      overflow: hidden;
      cursor: grab;
    }

    .hotspot-viewport.is-panning {
      cursor: grabbing;
    }

    .hotspot-viewport:focus-visible {
      box-shadow: inset 0 0 0 2px var(--primary);
    }

    .hotspot-canvas-surface {
      position: relative;
      width: 100%;
      transform-origin: 0 0;
      transition: transform 0.15s ease-out;
    }

    .hotspot-schematic-svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .hotspot-schematic-bg { fill: var(--bg-body); }
    .hotspot-schematic-ring, .hotspot-schematic-line { stroke: var(--border-color); }
    .hotspot-schematic-label { fill: var(--text-muted); }

    .hotspot-background-image {
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      display: block;
      background: var(--bg-body);
    }

    /* Hotspot Pins & Vector Markers */
    .hotspot-point {
      position: absolute;
      width: 36px;
      height: 36px;
      transform: translate(-50%, -50%);
      z-index: 10;
    }

    .hotspot-pin {
      position: relative;
      width: 36px;
      height: 36px;
      background-color: var(--primary);
      border: 2px solid var(--bg-card);
      color: var(--on-primary, #ffffff);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      box-shadow: var(--att-shadow-1, 0 4px 6px rgba(0,0,0,0.15));
      z-index: 1;
      padding: 0;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s;
    }

    .hotspot-pin::before {
      content: '';
      position: absolute;
      top: -8px;
      left: -8px;
      right: -8px;
      bottom: -8px;
      min-width: 44px;
      min-height: 44px;
    }

    .hotspot-pin .pin-body {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .hotspot-pin.has-vector-icon .pin-body svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    .hotspot-pin:hover {
      background-color: var(--primary-hover);
      transform: scale(1.12);
    }

    .hotspot-pin.active {
      background-color: var(--primary);
      transform: scale(1.18);
      box-shadow: 0 0 0 3px var(--bg-card), 0 0 0 5px var(--primary);
    }

    .hotspot-pin:focus-visible {
      outline: 3px solid var(--att-color-cobalt, #00388F);
      outline-offset: 3px;
    }

    .hotspot-pin .pulse {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: var(--primary);
      animation: pinPulse 2s infinite;
      z-index: -1;
    }

    .hotspot-pin.is-visited .pulse {
      animation: none;
      opacity: 0;
    }

    .hotspot-pin .pin-visited-check {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 15px;
      height: 15px;
      background-color: var(--att-green, #91DC00);
      color: #000000;
      border: 1.5px solid var(--bg-card);
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 8px;
    }

    .hotspot-pin.is-visited .pin-visited-check {
      display: flex;
    }

    .hotspot-point:has(.hotspot-pin.active),
    .hotspot-point.is-active {
      z-index: 50;
    }

    /* Floating Tooltip Callout */
    .hotspot-tooltip {
      position: absolute;
      width: 290px;
      max-width: min(320px, 80vw);
      background-color: var(--text-main);
      color: var(--bg-card);
      padding: var(--att-space-4, 16px);
      border-radius: var(--att-radius-md, 12px);
      box-shadow: var(--att-shadow-2, 0 12px 24px rgba(0, 0, 0, 0.3));
      display: none;
      z-index: 50;
      text-align: left;
      opacity: 0;
      pointer-events: auto;
    }

    /* Placement Top (Default for lower pins) */
    .hotspot-tooltip.placement-top,
    .hotspot-tooltip:not(.placement-bottom) {
      bottom: 44px;
      top: auto;
    }

    /* Placement Bottom (For pins in upper area) */
    .hotspot-tooltip.placement-bottom {
      top: 44px;
      bottom: auto;
    }

    /* Align Center (Default) */
    .hotspot-tooltip.align-center,
    .hotspot-tooltip:not(.align-left):not(.align-right) {
      left: 50%;
      right: auto;
      --tt-from: translateX(-50%) translateY(6px) scale(0.97);
      --tt-to: translateX(-50%) translateY(0) scale(1);
    }

    .hotspot-tooltip.placement-bottom.align-center,
    .hotspot-tooltip.placement-bottom:not(.align-left):not(.align-right) {
      left: 50%;
      right: auto;
      --tt-from: translateX(-50%) translateY(-6px) scale(0.97);
      --tt-to: translateX(-50%) translateY(0) scale(1);
    }

    /* Align Left (For pins near left edge) */
    .hotspot-tooltip.align-left {
      left: -8px;
      right: auto;
      --tt-from: translateY(6px) scale(0.97);
      --tt-to: translateY(0) scale(1);
    }

    .hotspot-tooltip.placement-bottom.align-left {
      left: -8px;
      right: auto;
      --tt-from: translateY(-6px) scale(0.97);
      --tt-to: translateY(0) scale(1);
    }

    /* Align Right (For pins near right edge) */
    .hotspot-tooltip.align-right {
      right: -8px;
      left: auto;
      --tt-from: translateY(6px) scale(0.97);
      --tt-to: translateY(0) scale(1);
    }

    .hotspot-tooltip.placement-bottom.align-right {
      right: -8px;
      left: auto;
      --tt-from: translateY(-6px) scale(0.97);
      --tt-to: translateY(0) scale(1);
    }

    .hotspot-pin.active + .hotspot-tooltip {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
      animation: hotspotTooltipEntrance 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes hotspotTooltipEntrance {
      0% {
        opacity: 0;
        transform: var(--tt-from, scale(0.97));
      }
      100% {
        opacity: 1;
        transform: var(--tt-to, scale(1));
      }
    }

    .hotspot-callout-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .hotspot-callout-tag {
      font-size: var(--att-fs-caption, 0.75rem);
      font-weight: var(--att-fw-semibold, 600);
      letter-spacing: normal;
      color: var(--att-blue, #009FDB);
    }

    .hotspot-callout-title {
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--bg-card);
      margin: 0;
    }

    .hotspot-callout-content {
      font-size: var(--att-fs-body-sm, 0.875rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--bg-card);
    }

    .hotspot-callout-content p { margin: 0; }

    /* The drawer and modal copy a marker's text and audio out of this block; it is never shown itself. */
    .hotspot-callout-source { display: none !important; }

    /* Audio narration Widget */
    .hotspot-audio-narration {
      margin-top: var(--att-space-2, 8px);
      padding-top: var(--att-space-2, 8px);
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .hotspot-audio-label {
      font-size: var(--att-fs-caption, 0.75rem);
      font-weight: var(--att-fw-semibold, 600);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--att-blue, #009FDB);
    }

    .hotspot-audio-elem {
      width: 100%;
      height: 32px;
      border-radius: var(--att-radius-sm, 6px);
      outline: 3px solid transparent;
    }

    .hotspot-audio-transcript {
      font-size: var(--att-fs-caption, 0.75rem);
      color: var(--bg-card);
      margin-top: 4px;
    }

    .hotspot-audio-transcript summary {
      cursor: pointer;
      font-weight: var(--att-fw-semibold, 600);
      color: var(--att-blue, #009FDB);
    }

    .hotspot-audio-transcript .transcript-body {
      margin-top: 4px;
      padding: 6px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--att-radius-sm, 4px);
      line-height: 1.4;
    }

    /* Side Drawer Callout Mode */
    .hotspot-drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 340px;
      max-width: 90%;
      background-color: var(--bg-card);
      border-left: 1px solid var(--border-color);
      box-shadow: -4px 0 16px rgba(0,0,0,0.15);
      z-index: 40;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      padding: var(--att-space-5, 20px);
      overflow-y: auto;
    }

    .hotspot-drawer.is-open {
      transform: translateX(0);
    }

    .hotspot-drawer-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: relative;
      padding-bottom: var(--att-space-3, 12px);
      border-bottom: 1px solid var(--border-color);
    }

    .hotspot-drawer-badge {
      font-size: var(--att-fs-caption, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--primary);
      letter-spacing: normal;
    }

    .hotspot-drawer-title {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      margin: 0;
      padding-right: 32px;
      line-height: var(--att-lh-heading, 1.25);
    }

    .hotspot-drawer-close {
      position: absolute;
      top: 0;
      right: 0;
      background: transparent;
      border: none;
      color: var(--text-muted);
      width: 32px;
      height: 32px;
      border-radius: var(--att-radius-sm, 6px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .hotspot-drawer-close:hover {
      background-color: var(--bg-body);
      color: var(--text-main);
    }

    .hotspot-drawer-body {
      padding-top: var(--att-space-4, 16px);
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-main);
      line-height: var(--att-lh-body, 1.5);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }

    .hotspot-drawer-body .hotspot-audio-narration {
      border-top-color: var(--border-color);
      background-color: var(--bg-body);
      padding: var(--att-space-3, 12px);
      border-radius: var(--att-radius-md, 8px);
    }

    .hotspot-drawer-body .hotspot-audio-label {
      color: var(--primary);
    }

    .hotspot-drawer-body .hotspot-audio-transcript {
      color: var(--text-main);
    }

    .hotspot-drawer-body .hotspot-audio-transcript summary {
      color: var(--primary);
    }

    .hotspot-drawer-body .hotspot-audio-transcript .transcript-body {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
    }

    .hotspot-drawer-placeholder {
      color: var(--text-muted);
      font-style: italic;
    }

    /* Modal Overlay Callout Mode */
    .hotspot-modal-backdrop {
      position: absolute;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(2px);
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      padding: var(--att-space-4, 16px);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .hotspot-modal-backdrop.is-open {
      display: flex;
      opacity: 1;
    }

    .hotspot-modal {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-lg, 16px);
      box-shadow: 0 16px 32px rgba(0,0,0,0.25);
      width: 480px;
      max-width: 100%;
      max-height: 90%;
      overflow-y: auto;
      padding: var(--att-space-5, 20px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
      transform: scale(0.95);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .hotspot-modal-backdrop.is-open .hotspot-modal {
      transform: scale(1);
    }

    .hotspot-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .hotspot-modal-badge {
      font-size: var(--att-fs-caption, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--primary);
      letter-spacing: normal;
      background-color: var(--bg-body);
      padding: 4px 10px;
      border-radius: var(--att-radius-full, 9999px);
      border: 1px solid var(--border-color);
    }

    .hotspot-modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      width: 32px;
      height: 32px;
      border-radius: var(--att-radius-sm, 6px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .hotspot-modal-close:hover {
      background-color: var(--bg-body);
      color: var(--text-main);
    }

    .hotspot-modal-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      margin: 0;
    }

    .hotspot-modal-body {
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-main);
      line-height: var(--att-lh-body, 1.5);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }

    .hotspot-modal-body .hotspot-audio-narration {
      border-top-color: var(--border-color);
      background-color: var(--bg-body);
      padding: var(--att-space-3, 12px);
      border-radius: var(--att-radius-md, 8px);
    }

    .hotspot-modal-body .hotspot-audio-label { color: var(--primary); }
    .hotspot-modal-body .hotspot-audio-transcript { color: var(--text-main); }
    .hotspot-modal-body .hotspot-audio-transcript summary { color: var(--primary); }
    .hotspot-modal-body .hotspot-audio-transcript .transcript-body {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
    }

    @keyframes pinPulse {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .hotspot-pin .pulse { display: none; }
      .hotspot-canvas-surface, .hotspot-drawer, .hotspot-modal { transition: none !important; }
    }

    @media (max-width: 640px) {
      .hotspots-container { padding: var(--att-space-3, 12px); }
      .hotspot-hud-bar { flex-direction: column; align-items: stretch; }
      .hotspot-zoom-toolbar { justify-content: center; }
      .hotspot-drawer { width: 100%; max-width: 100%; }
    }
  `;
}

export function generateJS(config = {}) {
  // Must define initComponent() — the shared export bootstrap (js/export-shell.js
  // #BOOTSTRAP_JS) calls it once the DOM is ready. A bare IIFE here throws
  // "initComponent is not defined" in every standalone export.
  return `
    function initComponent() {
      var container = document.querySelector('.hotspots-container');
      if (!container) return;

      var calloutMode = container.getAttribute('data-callout-mode') || 'tooltip';
      var autoplayAudio = ${config.autoplayAudio === true};
      var zoomEnabled = container.getAttribute('data-zoom-enabled') !== 'false';
      var pins = container.querySelectorAll('.hotspot-pin');
      var totalItems = pins.length;
      var visitedSet = new Set();
      var activeIndex = -1;

      // Zoom & Pan state
      var zoomScales = [1, 1.5, 2, 2.5, 3];
      var zoomIndex = 0;
      var panX = 0;
      var panY = 0;
      var isDragging = false;
      var startX = 0;
      var startY = 0;

      var viewport = container.querySelector('.hotspot-viewport');
      var surface = container.querySelector('.hotspot-canvas-surface');
      var zoomInBtn = container.querySelector('.btn-zoom-in');
      var zoomOutBtn = container.querySelector('.btn-zoom-out');
      var zoomResetBtn = container.querySelector('.btn-zoom-reset');
      var zoomLevelLabel = container.querySelector('.hotspot-zoom-level');

      // Progress HUD
      var visitedCountEl = container.querySelector('.hotspot-visited-count');
      var visitedPctEl = container.querySelector('.hotspot-visited-pct');
      var progressFillEl = container.querySelector('.hotspot-progress-fill');

      // Drawer & Modal Elements
      var drawer = container.querySelector('.hotspot-drawer');
      var drawerTitle = container.querySelector('.hotspot-drawer-title');
      var drawerBody = container.querySelector('.hotspot-drawer-body');
      var drawerClose = container.querySelector('.hotspot-drawer-close');

      var modalBackdrop = container.querySelector('.hotspot-modal-backdrop');
      var modalTitle = container.querySelector('.hotspot-modal-title');
      var modalBody = container.querySelector('.hotspot-modal-body');
      var modalBadge = container.querySelector('.hotspot-modal-badge');
      var modalClose = container.querySelector('.hotspot-modal-close');

      function updateHUD() {
        var count = visitedSet.size;
        var pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 100;
        if (visitedCountEl) visitedCountEl.textContent = count;
        if (visitedPctEl) visitedPctEl.textContent = pct + '%';
        if (progressFillEl) progressFillEl.style.width = pct + '%';
      }

      function stopAllAudio() {
        container.querySelectorAll('audio').forEach(function(audio) {
          audio.pause();
          audio.currentTime = 0;
        });
      }

      function applyTransform() {
        if (!surface) return;
        var scale = zoomScales[zoomIndex];
        if (scale === 1) {
          panX = 0;
          panY = 0;
        } else if (viewport) {
          var rect = viewport.getBoundingClientRect();
          var maxPanX = (scale - 1) * rect.width;
          var maxPanY = (scale - 1) * rect.height;
          panX = Math.max(-maxPanX, Math.min(0, panX));
          panY = Math.max(-maxPanY, Math.min(0, panY));
        }
        surface.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
        if (zoomLevelLabel) zoomLevelLabel.textContent = Math.round(scale * 100) + '%';
        if (zoomInBtn) zoomInBtn.disabled = zoomIndex >= zoomScales.length - 1;
        if (zoomOutBtn) zoomOutBtn.disabled = zoomIndex <= 0;
        if (viewport) {
          viewport.classList.toggle('is-zoomed', scale > 1);
        }
      }

      function setZoom(newIndex) {
        zoomIndex = Math.max(0, Math.min(zoomScales.length - 1, newIndex));
        applyTransform();
      }

      if (zoomInBtn) zoomInBtn.addEventListener('click', function() { setZoom(zoomIndex + 1); });
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', function() { setZoom(zoomIndex - 1); });
      if (zoomResetBtn) zoomResetBtn.addEventListener('click', function() { setZoom(0); });

      // Mouse drag & Touch Pan
      if (viewport && zoomEnabled) {
        viewport.addEventListener('mousedown', function(e) {
          if (zoomScales[zoomIndex] <= 1) return;
          if (e.target.closest('.hotspot-pin') || e.target.closest('.hotspot-tooltip')) return;
          isDragging = true;
          startX = e.clientX - panX;
          startY = e.clientY - panY;
          viewport.classList.add('is-panning');
          e.preventDefault();
        });

        window.addEventListener('mousemove', function(e) {
          if (!isDragging) return;
          panX = e.clientX - startX;
          panY = e.clientY - startY;
          applyTransform();
        });

        window.addEventListener('mouseup', function() {
          if (isDragging) {
            isDragging = false;
            if (viewport) viewport.classList.remove('is-panning');
          }
        });

        viewport.addEventListener('wheel', function(e) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) setZoom(zoomIndex + 1);
            else setZoom(zoomIndex - 1);
          }
        }, { passive: false });
      }

      function deactivateAll() {
        pins.forEach(function(p) {
          p.classList.remove('active');
          p.setAttribute('aria-expanded', 'false');
          if (p.parentElement) p.parentElement.classList.remove('is-active');
          var tt = p.parentElement.querySelector('.hotspot-tooltip');
          if (tt) tt.setAttribute('aria-hidden', 'true');
        });
        if (drawer) {
          drawer.classList.remove('is-open');
          drawer.setAttribute('aria-hidden', 'true');
        }
        if (modalBackdrop) {
          modalBackdrop.classList.remove('is-open');
          var modal = container.querySelector('.hotspot-modal');
          if (modal) modal.setAttribute('aria-hidden', 'true');
        }
        stopAllAudio();
        activeIndex = -1;
      }

      function extractCalloutData(pin) {
        var parent = pin.parentElement;
        var tt = parent ? parent.querySelector('.hotspot-tooltip') : null;
        var title = pin.getAttribute('aria-label') || 'Marker details';
        var titleEl = tt ? tt.querySelector('.hotspot-callout-title') : null;
        if (titleEl) title = titleEl.textContent;
        var contentEl = tt ? tt.querySelector('.hotspot-callout-content') : null;
        var content = contentEl ? contentEl.innerHTML : '';
        var audioEl = tt ? tt.querySelector('.hotspot-audio-narration') : null;
        var audioHTML = audioEl ? audioEl.outerHTML : '';
        return { title: title, content: content, audioHTML: audioHTML };
      }

      function toggleHotspot(index, pin) {
        var isAlreadyActive = pin.classList.contains('active');
        deactivateAll();

        if (!isAlreadyActive) {
          activeIndex = index;
          pin.classList.add('active');
          pin.classList.add('is-visited');
          pin.setAttribute('aria-expanded', 'true');
          if (pin.parentElement) pin.parentElement.classList.add('is-active');

          visitedSet.add(index);
          updateHUD();
          viewedItems.add(index);
          updateProgress();

          var data = extractCalloutData(pin);

          if (calloutMode === 'tooltip') {
            var tooltip = pin.parentElement ? pin.parentElement.querySelector('.hotspot-tooltip') : null;
            if (tooltip) {
              tooltip.setAttribute('aria-hidden', 'false');

              // Dynamic collision detection with viewport
              var vPort = viewport || container;
              if (vPort) {
                var vpRect = vPort.getBoundingClientRect();
                var pRect = pin.getBoundingClientRect();

                // If pin is near top, flip downward
                if (pRect.top - vpRect.top < 180) {
                  tooltip.classList.add('placement-bottom');
                  tooltip.classList.remove('placement-top');
                } else {
                  tooltip.classList.add('placement-top');
                  tooltip.classList.remove('placement-bottom');
                }

                // If pin is near left or right edge
                if (pRect.left - vpRect.left < 150) {
                  tooltip.classList.add('align-left');
                  tooltip.classList.remove('align-right', 'align-center');
                } else if (vpRect.right - pRect.right < 150) {
                  tooltip.classList.add('align-right');
                  tooltip.classList.remove('align-left', 'align-center');
                }
              }

              announce(tooltip.textContent.trim());
              var audio = tooltip.querySelector('audio');
              if (audio && autoplayAudio) { audio.currentTime = 0; audio.play().catch(function() {}); }
            }
          } else if (calloutMode === 'drawer' && drawer) {
            drawer.classList.add('is-open');
            drawer.setAttribute('aria-hidden', 'false');
            if (drawerTitle) drawerTitle.textContent = data.title;
            if (drawerBody) {
              drawerBody.innerHTML = '<div>' + data.content + '</div>' + data.audioHTML;
              var dAudio = drawerBody.querySelector('audio');
              if (dAudio && autoplayAudio) { dAudio.currentTime = 0; dAudio.play().catch(function() {}); }
            }
            announce('Opened details for ' + data.title);
          } else if (calloutMode === 'modal' && modalBackdrop) {
            modalBackdrop.classList.add('is-open');
            var modal = container.querySelector('.hotspot-modal');
            if (modal) modal.setAttribute('aria-hidden', 'false');
            if (modalBadge) modalBadge.textContent = 'Marker ' + (index + 1);
            if (modalTitle) modalTitle.textContent = data.title;
            if (modalBody) {
              modalBody.innerHTML = '<div>' + data.content + '</div>' + data.audioHTML;
              var mAudio = modalBody.querySelector('audio');
              if (mAudio && autoplayAudio) { mAudio.currentTime = 0; mAudio.play().catch(function() {}); }
            }
            announce('Opened dialog for ' + data.title);
            if (modalClose) modalClose.focus();
          }
        }
      }

      pins.forEach(function(pin) {
        pin.addEventListener('click', function(event) {
          event.stopPropagation();
          var idx = parseInt(pin.getAttribute('data-idx'), 10);
          toggleHotspot(idx, pin);
        });

        pin.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            deactivateAll();
          }
        });
      });

      if (drawerClose) {
        drawerClose.addEventListener('click', function(event) {
          event.stopPropagation();
          deactivateAll();
        });
      }

      if (modalClose) {
        modalClose.addEventListener('click', function(event) {
          event.stopPropagation();
          deactivateAll();
        });
      }

      if (modalBackdrop) {
        modalBackdrop.addEventListener('click', function(event) {
          if (event.target === modalBackdrop) {
            deactivateAll();
          }
        });
      }

      document.addEventListener('click', function(event) {
        if (!event.target.closest('.hotspot-pin') && !event.target.closest('.hotspot-tooltip') && !event.target.closest('.hotspot-drawer') && !event.target.closest('.hotspot-modal')) {
          deactivateAll();
        }
      });

      document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          deactivateAll();
        }
      });
    }
  `;
}

/**
 * Validates hotspots component configuration.
 * @param {HotspotsConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [
    validateHotspotCoordinates(config.items)
  ];

  // Validate each item has required fields
  if (Array.isArray(config.items)) {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Hotspot ${index + 1}: Title is required.` });
      }
      if (!item.content || !String(item.content).trim()) {
        results.push({ valid: false, error: `Hotspot ${index + 1}: Content is required.` });
      }
    });
  }

  return combineValidationResults(results);
}
