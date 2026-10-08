import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeRichText, isRichTextEmpty, richTextToPlain, richInline } from '../js/utilities.js';
import { combineValidationResults } from '../js/validation-utils.js';
import { wrapItemMediaContent, getItemMediaCSS, validateItemMedia } from '../js/item-media.js';

/**
 * Horizontal Timeline Component Configuration
 * @typedef {Object} HorizontalTimelineConfig
 * @property {Array<{title: string, content: string, date?: string, year?: string, markerLabel?: string, image?: string, imageAlt?: string, media?: any}>} items - Array of timeline events
 */

export const id = 'horizontal-timeline';
export const name = 'Horizontal Journey Map';
export const category = 'timelines';

/** @type {HorizontalTimelineConfig} */
export const defaultConfig = {
  items: [
    { title: 'Phase 1: Research', content: 'Collect data assets, requirements, and verify targets.', image: '', imageAlt: '' },
    { title: 'Phase 2: Build Layout', content: 'Configure colors, fonts, margins, and borders in the tool.', image: '', imageAlt: '' },
    { title: 'Phase 3: Export HTML', content: 'Copy custom block and import inside Articulate Rise blocks.', image: '', imageAlt: '' }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  return `
    <div class="horizontal-timeline-container" id="${instanceId}">
      <div class="timeline-nodes-row" role="tablist" aria-label="Timeline steps">
        ${config.items.map((item, idx) => `
          <div class="timeline-node ${idx === 0 ? 'active' : ''}" id="${instanceId}-timeline-tab-${idx}" data-idx="${idx}" role="tab" tabindex="${idx === 0 ? '0' : '-1'}" aria-selected="${idx === 0}" aria-controls="${instanceId}-timeline-slide-${idx}">
            <div class="node-marker">${!isRichTextEmpty(item.markerLabel) ? `<span class="node-marker-label" aria-hidden="true">${richInline(item.markerLabel)}</span>` : ''}</div>
            <span class="node-label">${item.title ? sanitizeRichText(item.title) : 'Step'}</span>
          </div>
        `).join('')}
      </div>
      <div class="timeline-slider-box" id="${instanceId}-slider-box" aria-live="polite">
        ${config.items.map((item, idx) => {
          const contentHtml = sanitizeRichText(item.content || 'Milestone description goes here.');
          const hasImage = Boolean((item.image || '').trim());
          const imageHtml = hasImage ? `
            <div class="timeline-slide-media">
              <button type="button" class="timeline-media-popup-btn" data-img-src="${escapeAttribute(item.image)}" data-img-alt="${escapeAttribute(item.imageAlt || item.title || 'Milestone image')}" aria-label="View enlarged image for ${escapeAttribute(richTextToPlain(item.title) || 'step')}">
                <img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.imageAlt || item.title || 'Milestone image')}" class="timeline-slide-thumb" loading="lazy">
                <span class="timeline-media-zoom-hint" aria-hidden="true">Enlarge</span>
              </button>
            </div>
          ` : '';

          return `
          <div class="timeline-slide ${idx === 0 ? 'active' : ''}" id="${instanceId}-timeline-slide-${idx}" role="tabpanel" aria-labelledby="${instanceId}-timeline-tab-${idx}" tabindex="0" ${idx === 0 ? '' : 'hidden'}>
            <div class="timeline-slide-layout ${hasImage ? 'has-media' : ''}">
              ${imageHtml}
              <div class="timeline-slide-text">
                <h4>${item.title ? sanitizeRichText(item.title) : 'Phase header'}</h4>
                ${wrapItemMediaContent(item.media, `<p>${contentHtml}</p>`, instanceId, idx)}
              </div>
            </div>
          </div>
        `;
        }).join('')}
        <div class="timeline-nav-buttons">
          <button type="button" class="timeline-nav-btn timeline-prev-btn" aria-label="Previous milestone" disabled>&larr; Prev</button>
          <span class="timeline-step-indicator" id="${instanceId}-step-indicator">1 of ${config.items.length}</span>
          <button type="button" class="timeline-nav-btn timeline-next-btn" aria-label="Next milestone"${config.items.length <= 1 ? ' disabled' : ''}>Next &rarr;</button>
        </div>
      </div>

      <!-- Lightbox modal for milestone image popup -->
      <div class="timeline-lightbox" id="${instanceId}-lightbox" hidden role="dialog" aria-modal="true" aria-label="Enlarged milestone image">
        <div class="timeline-modal-backdrop"></div>
        <div class="timeline-lightbox-content">
          <button type="button" class="timeline-lightbox-close" aria-label="Close image popup">&times;</button>
          <!-- No src attribute (not src=""): JS sets it from the clicked thumbnail's data-img-src
               when the lightbox opens. An empty src, unlike a missing one, reads to the course
               export gate as a broken/dropped media reference (js/dashboard/project-export.js). -->
          <img alt="" class="timeline-lightbox-img" id="${instanceId}-lightbox-img">
          <p class="timeline-lightbox-caption" id="${instanceId}-lightbox-caption"></p>
        </div>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .horizontal-timeline-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-5, 20px);
      position: relative;
    }
    .timeline-nodes-row {
      display: flex;
      justify-content: flex-start;
      position: relative;
      padding: 6px 4px 14px;
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--border-color, #DCDFE3) transparent;
      -webkit-overflow-scrolling: touch;
    }
    .timeline-nodes-row::-webkit-scrollbar {
      height: 6px;
    }
    .timeline-nodes-row::-webkit-scrollbar-track {
      background: transparent;
    }
    .timeline-nodes-row::-webkit-scrollbar-thumb {
      background-color: var(--border-color, #DCDFE3);
      border-radius: 999px;
    }
    .timeline-nodes-row::-webkit-scrollbar-thumb:hover {
      background-color: var(--text-muted);
    }
    .timeline-nodes-row::-webkit-scrollbar-button {
      display: none;
      width: 0;
      height: 0;
    }
    .timeline-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      z-index: 2;
      flex: 1 0 100px;
      min-width: 90px;
      min-height: 44px;
      justify-content: flex-start;
      position: relative;
      padding: 0 4px;
    }
    .timeline-node::before {
      content: '';
      position: absolute;
      left: -50%;
      right: 50%;
      top: 11px;
      height: 2px;
      background-color: var(--border-color, #DCDFE3);
      z-index: 1;
    }
    .timeline-node:first-child::before {
      display: none;
    }
    .timeline-node:focus-visible {
      outline: none;
    }
    .timeline-node:focus-visible .node-marker {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .timeline-node:active .node-marker {
      transform: scale(0.98);
    }
    .node-marker {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: var(--bg-card);
      border: 3px solid var(--primary);
      transition: all 0.2s;
      box-shadow: var(--shadow-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 2;
    }
    .node-marker-label {
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: 1;
      color: var(--primary);
    }
    .timeline-node.active .node-marker {
      background-color: var(--primary);
    }
    .timeline-node.active .node-marker-label {
      color: var(--on-primary);
    }
    .node-label {
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      color: var(--text-muted);
      margin-top: 8px;
      text-align: center;
      transition: color 0.2s;
      word-break: break-word;
      max-width: 100%;
    }
    .timeline-node.active .node-label {
      color: var(--primary);
      font-weight: var(--att-fw-bold, 700);
    }
    .timeline-slider-box {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, var(--border-radius, 12px));
      padding: var(--att-space-5, 20px);
      min-height: 120px;
      position: relative;
      touch-action: pan-y;
      user-select: none;
    }
    .timeline-slide {
      display: none;
      animation: fadeIn 0.3s ease;
    }
    .timeline-slide.active {
      display: block;
    }
    .timeline-slide-layout.has-media {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: var(--att-space-4, 16px);
      align-items: start;
    }
    @media (max-width: 600px) {
      .timeline-slide-layout.has-media {
        grid-template-columns: 1fr;
      }
    }
    .timeline-slide-media {
      position: relative;
    }
    .timeline-media-popup-btn {
      background: none;
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 8px);
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      display: block;
      position: relative;
      width: 100%;
    }
    .timeline-media-popup-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .timeline-slide-thumb {
      width: 100%;
      height: 120px;
      object-fit: cover;
      display: block;
      transition: transform 0.2s ease;
    }
    .timeline-media-popup-btn:hover .timeline-slide-thumb {
      transform: scale(1.04);
    }
    .timeline-media-zoom-hint {
      position: absolute;
      bottom: 6px;
      right: 6px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .timeline-slide h4 {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      margin-bottom: 8px;
      color: var(--text-main);
      text-wrap: pretty;
    }
    .timeline-slide p {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-muted);
      max-width: 70ch;
      margin: 0;
    }
    .timeline-nav-buttons {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--att-space-4, 16px);
      padding-top: var(--att-space-3, 12px);
      border-top: 1px solid var(--border-color);
    }
    .timeline-nav-btn {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-pill, 999px);
      padding: 6px 14px;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-main);
      cursor: pointer;
      min-height: 38px;
    }
    .timeline-nav-btn:hover:not(:disabled) {
      border-color: var(--primary);
    }
    .timeline-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .timeline-step-indicator {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-muted);
    }
    .timeline-lightbox {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .timeline-lightbox[hidden] {
      display: none;
    }
    .timeline-modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
    }
    .timeline-lightbox-content {
      position: relative;
      background: var(--bg-card);
      padding: 16px;
      border-radius: var(--att-radius-lg, 12px);
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10000;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .timeline-lightbox-img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
      border-radius: var(--att-radius-sm, 4px);
    }
    .timeline-lightbox-caption {
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-main);
      text-align: center;
    }
    .timeline-lightbox-close {
      position: absolute;
      top: 8px;
      right: 8px;
      background: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-main);
    }

    ${getItemMediaCSS()}`;
}

export function generateJS(config, instanceId) {
  const total = config.items.length;
  return `
    var currentTimelineIdx = 0;
    var totalTimelineSlides = ${total};

    function selectTimelineNode(index, node) {
      if (index < 0 || index >= totalTimelineSlides) return;
      currentTimelineIdx = index;
      var container = document.getElementById('${instanceId}') || (node ? node.closest('.horizontal-timeline-container') : document);
      container.querySelectorAll('.timeline-node').forEach(function(n) {
        n.classList.remove('active');
        n.setAttribute('aria-selected', 'false');
        n.setAttribute('tabindex', '-1');
      });
      container.querySelectorAll('.timeline-slide').forEach(function(s) {
        s.querySelectorAll('audio, video').forEach(function(mediaEl) { if (!mediaEl.paused) mediaEl.pause(); });
        s.classList.remove('active');
        s.hidden = true;
      });

      var targetNode = container.querySelector('.timeline-node[data-idx="' + index + '"]');
      if (targetNode) {
        targetNode.classList.add('active');
        targetNode.setAttribute('aria-selected', 'true');
        targetNode.setAttribute('tabindex', '0');
        if (typeof targetNode.scrollIntoView === 'function') {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      var slide = document.getElementById('${instanceId}-timeline-slide-' + index);
      if (slide) {
        slide.hidden = false;
        slide.classList.add('active');
      }

      var indicator = document.getElementById('${instanceId}-step-indicator');
      if (indicator) indicator.textContent = (index + 1) + ' of ' + totalTimelineSlides;

      var prevBtn = container.querySelector('.timeline-prev-btn');
      var nextBtn = container.querySelector('.timeline-next-btn');
      if (prevBtn) prevBtn.disabled = (index === 0);
      if (nextBtn) nextBtn.disabled = (index === totalTimelineSlides - 1);

      viewedItems.add(index);
      updateProgress();
    }

    function initComponent() {
      var container = document.getElementById('${instanceId}');
      if (!container) return;

      container.querySelectorAll('.timeline-node').forEach(function(node) {
        node.addEventListener('click', function() {
          selectTimelineNode(parseInt(node.getAttribute('data-idx'), 10), node);
        });
        node.addEventListener('keydown', function(event) {
          var nodes = Array.from(node.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
          var current = nodes.indexOf(node);
          var next = current;
          if (event.key === 'ArrowRight') next = (current + 1) % nodes.length;
          else if (event.key === 'ArrowLeft') next = (current - 1 + nodes.length) % nodes.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = nodes.length - 1;
          else return;
          event.preventDefault();
          selectTimelineNode(next, nodes[next]);
          nodes[next].focus();
        });
      });

      var prevBtn = container.querySelector('.timeline-prev-btn');
      var nextBtn = container.querySelector('.timeline-next-btn');
      if (prevBtn) prevBtn.addEventListener('click', function() { selectTimelineNode(currentTimelineIdx - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function() { selectTimelineNode(currentTimelineIdx + 1); });

      // Touch / swipe handling on slider box
      var sliderBox = document.getElementById('${instanceId}-slider-box');
      if (sliderBox) {
        var startX = 0;
        var startY = 0;
        sliderBox.addEventListener('touchstart', function(e) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }, { passive: true });

        sliderBox.addEventListener('touchend', function(e) {
          var diffX = e.changedTouches[0].clientX - startX;
          var diffY = e.changedTouches[0].clientY - startY;
          if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0 && currentTimelineIdx < totalTimelineSlides - 1) {
              selectTimelineNode(currentTimelineIdx + 1);
            } else if (diffX > 0 && currentTimelineIdx > 0) {
              selectTimelineNode(currentTimelineIdx - 1);
            }
          }
        }, { passive: true });
      }

      // Lightbox popup handlers
      var lightbox = document.getElementById('${instanceId}-lightbox');
      var lightboxImg = document.getElementById('${instanceId}-lightbox-img');
      var lightboxCaption = document.getElementById('${instanceId}-lightbox-caption');
      var lastFocusedEl = null;

      function closeLightbox() {
        if (lightbox) {
          lightbox.hidden = true;
          if (lastFocusedEl) lastFocusedEl.focus();
        }
      }

      container.querySelectorAll('.timeline-media-popup-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          lastFocusedEl = btn;
          var src = btn.getAttribute('data-img-src');
          var alt = btn.getAttribute('data-img-alt') || '';
          if (lightbox && lightboxImg) {
            lightboxImg.src = src;
            lightboxImg.alt = alt;
            if (lightboxCaption) lightboxCaption.textContent = alt;
            lightbox.hidden = false;
            var closeBtn = lightbox.querySelector('.timeline-lightbox-close');
            if (closeBtn) closeBtn.focus();
          }
        });
      });

      if (lightbox) {
        var closeBtn = lightbox.querySelector('.timeline-lightbox-close');
        var overlay = lightbox.querySelector('.timeline-modal-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
        if (overlay) overlay.addEventListener('click', closeLightbox);
        lightbox.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') closeLightbox();
        });
      }
    }`;
}

/**
 * Validates horizontal timeline component configuration.
 * @param {HorizontalTimelineConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [];
  if (!Array.isArray(config.items) || config.items.length === 0) {
    results.push({ valid: false, error: 'At least one timeline milestone is required.' });
  } else {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Event ${index + 1}: Title is required.` });
      }
      if (!item.content || !String(item.content).trim()) {
        results.push({ valid: false, error: `Event ${index + 1}: Description is required.` });
      }
      if (item.media && item.media.type && item.media.type !== 'none') {
        validateItemMedia(item.media, index).errors.forEach(err => results.push({ valid: false, error: err }));
      }
    });
  }

  return combineValidationResults(results);
}
