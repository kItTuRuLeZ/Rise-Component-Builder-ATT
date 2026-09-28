import { getEditorSchema } from '../js/editor-schemas.js';
import { sanitizeRichText } from '../js/utilities.js';
import { validateNonEmptyArray, combineValidationResults } from '../js/validation-utils.js';
import { getAttIconSvg } from '../js/att-icons.js';
import { wrapItemMediaContent, getItemMediaCSS, validateItemMedia } from '../js/item-media.js';

/**
 * Accordion Component Configuration
 * @typedef {Object} AccordionConfig
 * @property {boolean} accordionMulti - Allow multiple items open simultaneously
 * @property {boolean} accordionAnimation - Enable expand/collapse animation
 * @property {'chevron'|'plus-minus'|'arrow'} iconStyle - Icon style for expand indicators
 * @property {boolean} [accordionSequential] - Lock each panel until the previous one has been opened
 * @property {boolean} [accordionShowProgress] - Shows an "N of M explored" indicator, independent of trackCompletion
 * @property {boolean} [accordionShowVisitedBadge] - Shows a "Visited" badge on each panel once opened
 * @property {boolean} [accordionAllowReset] - Shows a "Reset" action clearing visited/opened/lock state
 * @property {boolean} [accordionSearch] - Shows a search input that filters panels by title/body text
 * @property {boolean} [accordionExpandCollapseAll] - Shows learner-facing Expand All/Collapse All controls (multi-open, non-sequential only)
 * @property {Array<{title: string, content: string, media?: any}>} items - Array of accordion items
 */

export const id = 'accordion';
export const name = 'Responsive Accordion';
export const category = 'interactive';

/** @type {AccordionConfig} */
export const defaultConfig = {
  accordionMulti: true,
  accordionAnimation: true,
  iconStyle: 'chevron',
  // Free-exploration is the original, unchanged default — every accordionX guided-mode
  // field below is additive/optional, so a project saved before this feature existed
  // renders and behaves identically.
  accordionSequential: false,
  accordionShowProgress: false,
  accordionShowVisitedBadge: false,
  accordionAllowReset: false,
  accordionSearch: false,
  accordionExpandCollapseAll: false,
  items: [
    { title: 'Understanding User Intent', content: 'Instructional design begins by identifying the core learning objectives and alignment with business outcomes.' },
    { title: 'Designing for Engagement', content: 'Modern eLearning relies on micro-interactions, clean visual layouts, and bite-sized chunks of information.' },
    { title: 'SCORM and Tracking Analytics', content: 'Export clean standard elements to trace course completion, custom interaction states, and score cards.' }
  ]
};

export const editorSchema = getEditorSchema(id);

const lockIconSvg = getAttIconSvg('padlock', { className: 'accordion-lock-icon', width: 13, height: 13, ariaHidden: true });
const visitedCheckIconSvg = getAttIconSvg('check', { className: 'accordion-visited-icon', width: 12, height: 12, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const icon = config.iconStyle === 'chevron'
    ? getAttIconSvg('chevron-down', { className: 'acc-arrow', width: 18, height: 18, ariaHidden: true })
    : config.iconStyle === 'plus-minus'
      ? '<div class="acc-plus-minus"></div>'
      : getAttIconSvg('arrow-down', { className: 'acc-arrow', width: 18, height: 18, ariaHidden: true });

  const sequential = config.accordionSequential === true;
  const showProgress = config.accordionShowProgress === true;
  const showVisitedBadge = config.accordionShowVisitedBadge === true;
  const allowReset = config.accordionAllowReset === true;
  const searchEnabled = config.accordionSearch === true;
  const showExpandCollapseAll = config.accordionExpandCollapseAll === true && config.accordionMulti === true && !sequential;
  const total = config.items.length;

  const toolbar = (searchEnabled || showExpandCollapseAll || allowReset || showProgress) ? `
    <div class="accordion-toolbar">
      ${searchEnabled ? `
        <div class="accordion-search-row">
          <input type="search" class="accordion-search-input" id="${instanceId}-accordion-search" placeholder="Search sections..." aria-label="Search accordion sections">
          <button type="button" class="accordion-search-clear" hidden>Clear</button>
        </div>
        <div class="accordion-search-status" id="${instanceId}-accordion-search-status" role="status" aria-live="polite"></div>
      ` : ''}
      <div class="accordion-toolbar-row">
        ${showExpandCollapseAll ? `
          <button type="button" class="accordion-toolbar-btn accordion-expand-all-btn">Expand All</button>
          <button type="button" class="accordion-toolbar-btn accordion-collapse-all-btn">Collapse All</button>
        ` : ''}
        ${allowReset ? '<button type="button" class="accordion-toolbar-btn accordion-reset-btn">Reset</button>' : ''}
        ${showProgress ? `<span class="accordion-progress-text" id="${instanceId}-accordion-progress" role="status" aria-live="polite">0 of ${total} explored</span>` : ''}
      </div>
    </div>
  ` : '';

  return `${toolbar}<div class="accordion-group" id="${instanceId}-accordion-group">${config.items.map((item, index) => {
    const locked = sequential && index > 0;
    const rawBody = `<p>${sanitizeRichText(item.content || 'Customize accordion body descriptions.')}</p>`;
    const bodyContent = wrapItemMediaContent(item.media, rawBody, instanceId, index);

    return `
    <div class="accordion-item${locked ? ' locked' : ''}" id="${instanceId}-item-${index}" data-idx="${index}">
      <h3><button class="accordion-trigger" id="${instanceId}-accordion-trigger-${index}" data-idx="${index}" aria-expanded="false" aria-controls="${instanceId}-accordion-panel-${index}" ${sequential ? `aria-describedby="${instanceId}-lock-note-${index}"` : ''} ${locked ? 'aria-disabled="true"' : ''}>
        <span class="accordion-trigger-text">
          ${sequential ? `<span class="accordion-lock-icon-slot" ${locked ? '' : 'hidden'}>${lockIconSvg}</span>` : ''}
          <span>${item.title ? sanitizeRichText(item.title) : 'Item Title Header'}</span>
          ${showVisitedBadge ? `<span class="accordion-visited-badge" hidden>${visitedCheckIconSvg} Visited</span>` : ''}
        </span>
        ${icon}
      </button></h3>
      ${sequential ? `<p class="accordion-lock-note" id="${instanceId}-lock-note-${index}" ${locked ? '' : 'hidden'}>Locked — open the previous section first.</p>` : ''}
      <div class="accordion-content" id="${instanceId}-accordion-panel-${index}" role="region" aria-labelledby="${instanceId}-accordion-trigger-${index}" aria-hidden="true"><div class="accordion-body">${bodyContent}</div></div>
    </div>`;
  }).join('')}</div>`;
}

export function generateCSS() {
  return `
    .accordion-group {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }

    .accordion-item {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      overflow: hidden;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, border-left 0.2s ease;
    }

    .accordion-item[hidden] {
      display: none;
    }

    .accordion-trigger {
      width: 100%;
      min-height: 44px;
      background: transparent;
      border: none;
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--font-family);
      font-size: var(--att-fs-body, 16px);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      color: var(--text-main);
    }

    .accordion-trigger:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }

    .accordion-trigger:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary)) !important;
      outline-offset: 2px !important;
      box-shadow: none;
    }

    .accordion-trigger[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .accordion-trigger-text {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .accordion-lock-icon-slot {
      display: inline-flex;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .accordion-lock-note {
      margin: -8px 20px 12px;
      font-size: var(--att-fs-body-sm, 14px);
      font-style: italic;
      color: var(--text-muted);
    }

    .accordion-visited-badge {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 10px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--att-grey-2, var(--border-color));
      color: var(--text-main);
    }

    .acc-arrow {
      transition: transform 0.25s ease;
      color: var(--primary);
      flex-shrink: 0;
    }

    .accordion-item.active {
      border-color: var(--att-blue, var(--primary));
      border-left: 4px solid var(--att-blue, var(--primary));
    }

    .accordion-item.active .acc-arrow {
      transform: rotate(180deg);
      color: var(--att-blue, var(--primary));
    }

    .acc-plus-minus {
      position: relative;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .acc-plus-minus::before,
    .acc-plus-minus::after {
      content: '';
      position: absolute;
      background-color: var(--primary);
      transition: transform 0.25s ease, opacity 0.25s ease;
    }

    .acc-plus-minus::before {
      top: 6px;
      left: 0;
      right: 0;
      height: 2px;
    }

    .acc-plus-minus::after {
      top: 0;
      bottom: 0;
      left: 6px;
      width: 2px;
    }

    .accordion-item.active .acc-plus-minus::before,
    .accordion-item.active .acc-plus-minus::after {
      background-color: var(--att-blue, var(--primary));
    }

    .accordion-item.active .acc-plus-minus::after {
      transform: rotate(90deg);
      opacity: 0;
    }

    .accordion-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
    }

    .accordion-body {
      padding: 0 var(--att-space-5, 24px) var(--att-space-5, 24px) var(--att-space-5, 24px);
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      width: 100%;
      box-sizing: border-box;
    }

    .accordion-body p,
    .accordion-body .item-text-slot {
      max-width: 70ch;
    }

    .accordion-toolbar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    .accordion-search-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .accordion-search-input {
      flex: 1;
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-md, var(--button-radius, 12px));
      padding: 8px 14px;
      font-size: var(--att-fs-body-sm, 14px);
      color: var(--text-main);
      min-height: 44px;
    }

    .accordion-search-input:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary)) !important;
      outline-offset: 2px !important;
    }

    .accordion-toolbar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .accordion-toolbar-btn, .accordion-search-clear {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-md, var(--button-radius, 12px));
      padding: 8px 16px;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-main);
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .accordion-toolbar-btn:focus-visible, .accordion-search-clear:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary)) !important;
      outline-offset: 2px !important;
    }

    .accordion-progress, .accordion-search-status {
      font-size: var(--att-fs-body-sm, 14px);
      color: var(--text-muted);
    }

    /* Density variants */
    .rise-block-wrapper.density-compact .accordion-group {
      gap: 8px;
    }
    .rise-block-wrapper.density-compact .accordion-trigger {
      padding: 10px 16px;
      min-height: 44px;
    }
    .rise-block-wrapper.density-compact .accordion-body {
      padding: 0 16px 14px 16px;
    }

    .rise-block-wrapper.density-standard .accordion-group {
      gap: 12px;
    }
    .rise-block-wrapper.density-standard .accordion-trigger {
      padding: 16px 20px;
      min-height: 48px;
    }
    .rise-block-wrapper.density-standard .accordion-body {
      padding: 0 20px 20px 20px;
    }

    .rise-block-wrapper.density-spacious .accordion-group {
      gap: 18px;
    }
    .rise-block-wrapper.density-spacious .accordion-trigger {
      padding: 22px 24px;
      min-height: 56px;
    }
    .rise-block-wrapper.density-spacious .accordion-body {
      padding: 0 24px 26px 24px;
    }

    @media (prefers-reduced-motion: reduce) {
      .accordion-item,
      .acc-arrow,
      .acc-plus-minus,
      .acc-plus-minus::before,
      .acc-plus-minus::after,
      .accordion-content {
        transition: none !important;
        animation: none !important;
      }
    }

    ${getItemMediaCSS()}`;
}

export function generateJS(config, instanceId) {
  const sequential = config.accordionSequential === true;
  const showVisitedBadge = config.accordionShowVisitedBadge === true;
  const showProgress = config.accordionShowProgress === true;
  const total = Array.isArray(config.items) ? config.items.length : (config.accordionTotal || 3);

  return `
    var multiOpen = ${Boolean(config.accordionMulti)};
    var allowAnimation = ${Boolean(config.accordionAnimation)};
    var sequentialMode = ${sequential};
    var showVisitedBadge = ${showVisitedBadge};
    var showProgress = ${showProgress};
    var accordionTotal = ${total};

    function pauseMediaInPanel(panel) {
      if (!panel) return;
      panel.querySelectorAll('audio, video').forEach(function(mediaEl) {
        if (!mediaEl.paused) {
          mediaEl.pause();
        }
      });
    }

    function isPanelLocked(index) {
      return sequentialMode && index > 0 && !viewedItems.has(index - 1);
    }

    function refreshLockState() {
      if (!sequentialMode) return;
      document.querySelectorAll('.accordion-item').forEach(function(itemEl) {
        var idx = parseInt(itemEl.getAttribute('data-idx'), 10);
        var locked = isPanelLocked(idx);
        var trigger = itemEl.querySelector('.accordion-trigger');
        var lockIconSlot = itemEl.querySelector('.accordion-lock-icon-slot');
        var lockNote = itemEl.querySelector('.accordion-lock-note');
        itemEl.classList.toggle('locked', locked);
        if (trigger) {
          if (locked) trigger.setAttribute('aria-disabled', 'true');
          else trigger.removeAttribute('aria-disabled');
        }
        if (lockIconSlot) lockIconSlot.hidden = !locked;
        if (lockNote) lockNote.hidden = !locked;
      });
    }

    function updateVisitedBadge(index) {
      if (!showVisitedBadge) return;
      var item = document.getElementById('${instanceId}-item-' + index);
      var badge = item && item.querySelector('.accordion-visited-badge');
      if (badge) badge.hidden = !viewedItems.has(index);
    }

    function updateProgressText() {
      if (!showProgress) return;
      var progress = document.getElementById('${instanceId}-accordion-progress');
      if (progress) progress.textContent = viewedItems.size + ' of ' + accordionTotal + ' explored';
    }

    function toggleAccordion(index) {
      if (isPanelLocked(index)) {
        announce('This section is locked. Open the previous section first.');
        return;
      }

      var item = document.getElementById('${instanceId}-item-' + index);
      var isCurrentlyActive = item.classList.contains('active');

      if (!multiOpen) {
        document.querySelectorAll('.accordion-item').forEach(function(el) {
          if (el !== item) {
            el.classList.remove('active');
            var panel = el.querySelector('.accordion-content');
            var trigger = el.querySelector('.accordion-trigger');
            if (panel) {
              panel.style.maxHeight = null;
              panel.setAttribute('aria-hidden', 'true');
              pauseMediaInPanel(panel);
            }
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
          }
        });
      }

      var contentPanel = item.querySelector('.accordion-content');

      if (isCurrentlyActive) {
        item.classList.remove('active');
        contentPanel.style.maxHeight = null;
        contentPanel.setAttribute('aria-hidden', 'true');
        item.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'false');
        pauseMediaInPanel(contentPanel);
      } else {
        item.classList.add('active');
        contentPanel.style.maxHeight = contentPanel.scrollHeight + 'px';
        contentPanel.setAttribute('aria-hidden', 'false');
        item.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'true');
        viewedItems.add(index);
        updateProgress();
        updateVisitedBadge(index);
        updateProgressText();
        refreshLockState();
      }
    }

    // A panel's max-height above is measured via scrollHeight the instant it opens — but its
    // item-media <img> is loading="lazy" (js/item-media.js), and a lazily-loaded image inside a
    // still-collapsed (max-height:0) panel doesn't start fetching until the panel actually
    // expands, which happens in the same tick as the scrollHeight read. So on a panel's first
    // open, scrollHeight is measured before the image has any rendered height, and the image is
    // clipped by overflow:hidden once it finishes loading a moment later — reported as "the
    // image doesn't show on first click, only after opening another item and reopening this
    // one" (reopening re-measures scrollHeight against the by-then-cached, already-loaded
    // image). Re-measuring the still-open panel's height once its image actually finishes
    // loading fixes this without waiting for a second open.
    function refreshPanelHeightIfActive(item) {
      if (!item.classList.contains('active')) return;
      var contentPanel = item.querySelector('.accordion-content');
      if (contentPanel) contentPanel.style.maxHeight = contentPanel.scrollHeight + 'px';
    }

    function watchLateLoadingImages() {
      document.querySelectorAll('.accordion-item').forEach(function(item) {
        var contentPanel = item.querySelector('.accordion-content');
        if (!contentPanel) return;
        contentPanel.querySelectorAll('img').forEach(function(img) {
          if (img.complete) return;
          img.addEventListener('load', function() { refreshPanelHeightIfActive(item); }, { once: true });
          img.addEventListener('error', function() { refreshPanelHeightIfActive(item); }, { once: true });
        });
      });
    }

    function expandAllPanels() {
      document.querySelectorAll('.accordion-item').forEach(function(itemEl) {
        var idx = parseInt(itemEl.getAttribute('data-idx'), 10);
        if (!itemEl.classList.contains('active') && !isPanelLocked(idx)) toggleAccordion(idx);
      });
    }

    function collapseAllPanels() {
      document.querySelectorAll('.accordion-item.active').forEach(function(itemEl) {
        toggleAccordion(parseInt(itemEl.getAttribute('data-idx'), 10));
      });
    }

    function applyAccordionSearch(query) {
      var q = query.trim().toLowerCase();
      var matchCount = 0;
      var total = 0;
      document.querySelectorAll('.accordion-item').forEach(function(itemEl) {
        total++;
        if (!q) { itemEl.hidden = false; matchCount++; return; }
        var visible = itemEl.textContent.toLowerCase().indexOf(q) !== -1;
        itemEl.hidden = !visible;
        if (visible) matchCount++;
      });
      var clearBtn = document.querySelector('.accordion-search-clear');
      if (clearBtn) clearBtn.hidden = !q;
      var status = document.getElementById('${instanceId}-accordion-search-status');
      if (status) status.textContent = q ? (matchCount + ' of ' + total + ' sections match.') : '';
    }

    function resetAccordion() {
      viewedItems.clear();
      document.querySelectorAll('.accordion-item').forEach(function(itemEl) {
        itemEl.classList.remove('active');
        itemEl.hidden = false;
        var panel = itemEl.querySelector('.accordion-content');
        var trigger = itemEl.querySelector('.accordion-trigger');
        if (panel) {
          panel.style.maxHeight = null;
          panel.setAttribute('aria-hidden', 'true');
          pauseMediaInPanel(panel);
        }
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        updateVisitedBadge(parseInt(itemEl.getAttribute('data-idx'), 10));
      });
      refreshLockState();
      updateProgressText();
      updateProgress();
      var searchInput = document.getElementById('${instanceId}-accordion-search');
      if (searchInput) { searchInput.value = ''; applyAccordionSearch(''); }
      var firstTrigger = document.querySelector('.accordion-trigger');
      if (firstTrigger) firstTrigger.focus();
      announce('Accordion reset.');
    }

    function initComponent() {
      document.querySelectorAll('.accordion-trigger').forEach(function(trigger) {
        trigger.addEventListener('click', function() {
          toggleAccordion(parseInt(trigger.getAttribute('data-idx'), 10));
        });
      });

      watchLateLoadingImages();
      refreshLockState();
      updateProgressText();

      var expandAllBtn = document.querySelector('.accordion-expand-all-btn');
      if (expandAllBtn) expandAllBtn.addEventListener('click', expandAllPanels);
      var collapseAllBtn = document.querySelector('.accordion-collapse-all-btn');
      if (collapseAllBtn) collapseAllBtn.addEventListener('click', collapseAllPanels);

      var resetBtn = document.querySelector('.accordion-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', resetAccordion);

      var searchInput = document.getElementById('${instanceId}-accordion-search');
      if (searchInput) {
        searchInput.addEventListener('input', function(event) { applyAccordionSearch(event.target.value); });
        var clearBtn = document.querySelector('.accordion-search-clear');
        if (clearBtn) clearBtn.addEventListener('click', function() {
          searchInput.value = '';
          applyAccordionSearch('');
          searchInput.focus();
        });
      }
    }`;
}

/**
 * Validates accordion component configuration.
 * @param {AccordionConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [
    validateNonEmptyArray(config.items, 'Accordion items')
  ];

  // Validate each item has required fields
  if (Array.isArray(config.items)) {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Item ${index + 1}: Title is required.` });
      }
      if (!item.content || !String(item.content).trim()) {
        results.push({ valid: false, error: `Item ${index + 1}: Content is required.` });
      }
      if (item.media && item.media.type && item.media.type !== 'none') {
        const mediaVal = validateItemMedia(item.media, index);
        mediaVal.errors.forEach(err => results.push({ valid: false, error: err }));
      }
    });
  }

  return combineValidationResults(results);
}
