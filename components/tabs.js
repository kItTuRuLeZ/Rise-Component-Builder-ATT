import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeRichText, sanitizeURL, serializeForInlineScript } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';
import { wrapItemMediaContent, getItemMediaCSS, validateItemMedia } from '../js/item-media.js';

/**
 * Horizontal Tabs Component Configuration
 * @typedef {Object} TabsConfig
 * @property {Array<{title: string, content: string, iconImage?: string, iconAltText?: string, iconDecorative?: boolean, iconFit?: string}>} items - Array of tab items
 * @property {boolean} [tabsSequential] - Locks each tab until the previous one has been selected
 * @property {boolean} [tabsShowProgress] - Shows an "N of M explored" indicator, independent of trackCompletion
 * @property {boolean} [tabsShowVisitedBadge] - Shows a "Visited" badge on each visited tab
 * @property {boolean} [tabsAllowReset] - Shows a "Reset" action clearing visited/selected/lock state
 * @property {boolean} [tabsNumbered] - Prefixes each tab label with its step number
 * @property {'horizontal'|'vertical'} [tabsOrientation] - Tab list orientation (vertical falls back to horizontal below 480px)
 * @property {boolean} [tabsCompareMode] - Shows an optional side-by-side comparison of two chosen tabs
 */

export const id = 'tab-blocks';
export const name = 'Horizontal Tabs';
export const category = 'interactive';
export const defaultConfig = {
  // Free navigation is the original, unchanged default — every tabsX guided/comparison
  // field below is additive/optional, so a project saved before this feature existed
  // renders and behaves identically.
  tabsSequential: false,
  tabsShowProgress: false,
  tabsShowVisitedBadge: false,
  tabsAllowReset: false,
  tabsNumbered: false,
  tabsOrientation: 'horizontal',
  tabsCompareMode: false,
  tabsAutoAdvance: false,
  tabsAutoAdvanceDelay: 5,
  items: [
    { title: 'Tab 1: Overview', content: 'A high-level explanation of the subject matter, laying a strong conceptual foundation.' },
    { title: 'Tab 2: Details', content: 'In-depth description of procedures, parameters, and design metrics.' },
    { title: 'Tab 3: Summary', content: 'Key takeaways and visual summaries to reinforce memory retention.' }
  ]
};
export const editorSchema = getEditorSchema(id);

const lockIconSvg = getAttIconSvg('padlock', { className: 'tab-lock-icon', width: 12, height: 12, ariaHidden: true });
const visitedCheckIconSvg = getAttIconSvg('check', { className: 'tab-visited-icon', width: 12, height: 12, ariaHidden: true });

function renderTabIcon(item) {
  const source = sanitizeURL(item?.iconImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
  if (!source) return '';
  const decorative = item.iconDecorative !== false;
  const fit = item.iconFit === 'cover' ? 'cover' : 'contain';
  return `<img class="tab-icon-img" src="${escapeAttribute(source)}" alt="${decorative ? '' : escapeAttribute(item.iconAltText || '')}" ${decorative ? 'aria-hidden="true"' : ''} style="object-fit:${fit};">`;
}

export function generateHTML(config, instanceId) {
  const sequential = config.tabsSequential === true;
  const showProgress = config.tabsShowProgress === true;
  const showVisitedBadge = config.tabsShowVisitedBadge === true;
  const allowReset = config.tabsAllowReset === true;
  const numbered = config.tabsNumbered === true;
  const vertical = config.tabsOrientation === 'vertical';
  const compareMode = config.tabsCompareMode === true;
  const autoAdvance = config.tabsAutoAdvance === true;
  const autoAdvanceDelay = Number.isFinite(Number(config.tabsAutoAdvanceDelay)) && Number(config.tabsAutoAdvanceDelay) > 0 ? Number(config.tabsAutoAdvanceDelay) : 5;
  const total = config.items.length;

  const playIcon = getAttIconSvg('play', { width: 14, height: 14, ariaHidden: true, className: 'tabs-play-icon' });
  const pauseIcon = getAttIconSvg('pause', { width: 14, height: 14, ariaHidden: true, className: 'tabs-pause-icon', style: 'display:none;' });

  const toolbar = (showProgress || allowReset || compareMode || autoAdvance) ? `
    <div class="tabs-toolbar">
      ${compareMode ? '<button type="button" class="tabs-toolbar-btn tabs-compare-toggle-btn" aria-pressed="false">Compare sections</button>' : ''}
      ${autoAdvance ? `<button type="button" class="tabs-toolbar-btn tabs-autoadvance-btn" aria-label="Auto-advance tabs" aria-pressed="false">${playIcon}${pauseIcon}<span class="tabs-autoadvance-label">Auto-Play (${autoAdvanceDelay}s)</span></button>` : ''}
      ${allowReset ? '<button type="button" class="tabs-toolbar-btn tabs-reset-btn">Reset</button>' : ''}
      ${showProgress ? `<span class="tabs-progress-text" id="${instanceId}-tabs-progress" role="status" aria-live="polite">0 of ${total} explored</span>` : ''}
    </div>
  ` : '';

  const tabHeaders = config.items.map((item, index) => {
    const locked = sequential && index > 0;
    const icon = renderTabIcon(item);
    return `<button class="tab-btn ${index === 0 ? 'active' : ''}" id="${instanceId}-tab-${index}" role="tab" aria-selected="${index === 0}" aria-controls="${instanceId}-tab-panel-${index}" tabindex="${index === 0 ? '0' : '-1'}" data-idx="${index}" ${sequential ? `aria-describedby="${instanceId}-tab-lock-note-${index}"` : ''} ${locked ? 'aria-disabled="true"' : ''}>${sequential ? `<span class="tab-lock-icon-slot" ${locked ? '' : 'hidden'}>${lockIconSvg}</span>` : ''}${icon}${numbered ? `<span class="tab-number" aria-hidden="true">${index + 1}.</span>` : ''}<span class="tab-label-text">${item.title ? sanitizeRichText(item.title) : 'Tab'}</span>${showVisitedBadge ? `<span class="tab-visited-badge" hidden>${visitedCheckIconSvg} Visited</span>` : ''}</button>${sequential ? `<span class="sr-only tab-lock-note" id="${instanceId}-tab-lock-note-${index}" ${locked ? '' : 'hidden'}>Locked. Select the previous tab first.</span>` : ''}`;
  }).join('');

  const tabPanels = config.items.map((item, index) => `<div class="tab-panel ${index === 0 ? 'active' : ''}" id="${instanceId}-tab-panel-${index}" role="tabpanel" aria-labelledby="${instanceId}-tab-${index}" tabindex="0" ${index === 0 ? '' : 'hidden'}>${wrapItemMediaContent(item.media, `<p>${sanitizeRichText(item.content || '')}</p>`, instanceId, index)}</div>`).join('');

  const compareBlock = compareMode ? `
    <div class="tabs-compare-panel" hidden>
      <p class="tabs-compare-hint" id="${instanceId}-compare-hint">Select up to 2 sections to compare side by side.</p>
      <div class="tabs-compare-checklist" role="group" aria-labelledby="${instanceId}-compare-hint">
        ${config.items.map((item, index) => `
          <label class="tabs-compare-check-item">
            <input type="checkbox" class="tabs-compare-checkbox" data-idx="${index}">
            <span>${item.title ? sanitizeRichText(item.title) : 'Tab'}</span>
          </label>
        `).join('')}
      </div>
      <div class="tabs-compare-columns" id="${instanceId}-compare-columns"></div>
    </div>
  ` : '';

  const leftArrowSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  const rightArrowSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

  return `<div class="tabs-container ${vertical ? 'tabs-vertical' : ''}">
    ${toolbar}
    <div class="tabs-nav-wrapper">
      <button type="button" class="tabs-nav-arrow tabs-nav-prev" id="${instanceId}-nav-prev" aria-label="Scroll tabs left" title="Scroll tabs left" tabindex="-1" disabled>
        ${leftArrowSvg}
      </button>
      <div class="tabs-header" id="${instanceId}-tabs-header" role="tablist" aria-label="Content sections" aria-orientation="${vertical ? 'vertical' : 'horizontal'}">${tabHeaders}</div>
      <button type="button" class="tabs-nav-arrow tabs-nav-next" id="${instanceId}-nav-next" aria-label="Scroll tabs right" title="Scroll tabs right" tabindex="-1">
        ${rightArrowSvg}
      </button>
    </div>
    <div class="tabs-content-wrapper">${tabPanels}</div>
    ${compareBlock}
  </div>`;
}

export function generateCSS() {
  return `
    .tabs-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      overflow: hidden;
    }
    .tabs-toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
      padding: 12px 16px 0;
    }
    .tabs-toolbar-btn {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-md, var(--button-radius, 12px));
      padding: 6px 14px;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-main);
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .tabs-toolbar-btn[aria-pressed="true"] {
      /* Cobalt (--primary), not AT&T Blue: this is the pressed/active state of a
          clickable toggle button, which must use the Cobalt clickable treatment. */
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary) inset;
    }
    .tabs-progress-text {
      margin-left: auto;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-muted);
    }
    .tabs-nav-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 16px 16px 0;
      width: 100%;
    }
    .tabs-header {
      display: flex;
      gap: var(--att-space-2, 8px);
      flex-wrap: nowrap;
      padding: 2px 2px 6px;
      overflow-x: auto;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;
      flex: 1;
      min-width: 0;
    }
    .tabs-header::-webkit-scrollbar {
      display: none;
    }
    .tabs-nav-arrow {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      min-height: 36px;
      padding: 0;
      border-radius: var(--att-radius-pill, 999px);
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-sm);
      z-index: 2;
    }
    .tabs-nav-arrow:hover:not(:disabled) {
      background: var(--bg-body);
      border-color: var(--primary);
      color: var(--primary-hover, var(--primary));
      transform: scale(1.05);
    }
    .tabs-nav-arrow:active:not(:disabled) {
      transform: scale(0.95);
    }
    .tabs-nav-arrow:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .tabs-nav-arrow:disabled,
    .tabs-nav-arrow[aria-disabled="true"] {
      opacity: 0.25;
      cursor: not-allowed;
      pointer-events: none;
    }
    .tabs-nav-arrow[hidden] {
      display: none !important;
    }
    .tab-btn {
      /* Complete capsule (full var(--button-radius)), not an underline tab —
          capsule shapes are reserved for clickable elements and must be a whole
          pill, never a partial rounding. Cobalt outline at rest, filled Cobalt
          when active/selected: every tab is clickable at all times, not only
          once selected, so it carries the Cobalt treatment throughout. */
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--primary);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      padding: 10px 18px;
      font-size: var(--att-fs-body, 16px);
      font-weight: 600;
      color: var(--primary);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      text-align: center;
      line-height: 1.35;
      min-height: 44px;
      transition: all 0.2s;
    }
    .tab-btn:hover:not(.active) {
      border-color: var(--primary-hover);
      color: var(--primary-hover);
    }
    .tab-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--on-primary);
    }
    .tab-btn:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }
    .tab-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .tab-btn[aria-disabled="true"] {
      cursor: not-allowed;
      background: var(--att-grey-2, #DCDFE3);
      border-color: var(--att-grey-2, #DCDFE3);
      color: var(--att-grey-3, #BDC2C7);
      opacity: 0.7;
    }
    .tab-label-text {
      line-height: 1.35;
      word-break: normal;
      overflow-wrap: break-word;
    }
    .tab-icon-img {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      border-radius: var(--att-radius-sm, 6px);
    }
    .tab-lock-icon-slot {
      display: inline-flex;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .tab-visited-badge {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      letter-spacing: normal;
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--border-color);
      color: var(--text-main);
    }
    .tabs-content-wrapper {
      padding: 20px;
      margin-top: 4px;
      border-top: var(--border-style);
    }
    .tab-panel {
      display: none;
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      max-width: 70ch;
      animation: fadeIn 0.3s ease;
    }
    .tab-panel.active {
      display: block;
    }

    .tabs-container.tabs-vertical {
      display: flex;
    }
    .tabs-container.tabs-vertical .tabs-nav-wrapper {
      display: flex;
      flex-direction: column;
      padding: 0;
      width: 240px;
      min-width: 200px;
      max-width: 35%;
      border-right: var(--border-style);
    }
    .tabs-container.tabs-vertical .tabs-nav-arrow {
      display: none !important;
    }
    .tabs-container.tabs-vertical .tabs-header {
      flex-direction: column;
      padding: 20px 16px;
      overflow-x: visible;
      width: 100%;
      min-width: 0;
    }
    .tabs-container.tabs-vertical .tab-btn {
      justify-content: flex-start;
      width: 100%;
      text-align: left;
      white-space: normal;
      padding: 10px 16px;
    }
    .tabs-container.tabs-vertical .tabs-content-wrapper {
      flex: 1;
      min-width: 0;
      margin-top: 0;
      border-top: none;
    }
    @media (max-width: 640px) {
      .tabs-container.tabs-vertical {
        flex-direction: column;
      }
      .tabs-container.tabs-vertical .tabs-nav-wrapper {
        width: 100%;
        max-width: none;
        border-right: none;
        border-bottom: var(--border-style);
        flex-direction: row;
        padding: 16px 12px 0;
      }
      .tabs-container.tabs-vertical .tabs-nav-arrow {
        display: inline-flex !important;
      }
      .tabs-container.tabs-vertical .tabs-header {
        flex-direction: row;
        width: 100%;
        padding: 2px 2px 6px;
        overflow-x: auto;
      }
      .tabs-container.tabs-vertical .tab-btn {
        width: auto;
        text-align: center;
        white-space: nowrap;
      }
      .tabs-container.tabs-vertical .tabs-content-wrapper {
        border-top: var(--border-style);
      }
    }

    .tabs-compare-section {
      border-top: var(--border-style);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tabs-compare-hint {
      font-size: var(--att-fs-body-sm, 14px);
      color: var(--text-muted);
    }
    .tabs-compare-checklist {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .tabs-compare-check-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      cursor: pointer;
    }
    .tabs-compare-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .tabs-compare-column {
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 12px);
      padding: 14px 16px;
      font-size: var(--att-fs-body, 16px);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
    }
    .tabs-compare-column h4 {
      font-size: var(--att-fs-body-lg, 18px);
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 6px;
      text-wrap: pretty;
    }
    @media (max-width: 600px) {
      .tabs-compare-columns {
        grid-template-columns: 1fr;
      }
    }

    ${getItemMediaCSS()}`;
}

export function generateJS(config, instanceId) {
  const sequential = config.tabsSequential === true;
  const showVisitedBadge = config.tabsShowVisitedBadge === true;
  const showProgress = config.tabsShowProgress === true;
  const compareMode = config.tabsCompareMode === true;
  const autoAdvance = config.tabsAutoAdvance === true;
  const autoAdvanceDelay = Number.isFinite(Number(config.tabsAutoAdvanceDelay)) && Number(config.tabsAutoAdvanceDelay) > 0 ? Number(config.tabsAutoAdvanceDelay) : 5;
  const total = config.items.length;

  return `
    var sequentialMode = ${sequential};
    var showVisitedBadge = ${showVisitedBadge};
    var showProgress = ${showProgress};
    var tabsTotal = ${total};
    var autoAdvanceEnabled = ${autoAdvance};
    var autoAdvanceDelayMs = ${autoAdvanceDelay * 1000};
    var autoAdvanceTimer = null;
    var autoAdvanceActive = false;
    var currentActiveIndex = 0;
    ${compareMode ? `var tabItems = ${serializeForInlineScript(config.items)};
    var compareSelected = [];` : ''}

    function isTabLocked(index) {
      return sequentialMode && index > 0 && !viewedItems.has(index - 1);
    }

    function refreshTabLockState() {
      if (!sequentialMode) return;
      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var locked = isTabLocked(idx);
        var lockSlot = btn.querySelector('.tab-lock-icon-slot');
        var note = document.getElementById('${instanceId}-tab-lock-note-' + idx);
        if (locked) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
        if (lockSlot) lockSlot.hidden = !locked;
        if (note) note.hidden = !locked;
      });
    }

    function updateTabVisitedBadge(index) {
      if (!showVisitedBadge) return;
      var btn = document.getElementById('${instanceId}-tab-' + index);
      var badge = btn && btn.querySelector('.tab-visited-badge');
      if (badge) badge.hidden = !viewedItems.has(index);
    }

    function updateTabsProgressText() {
      if (!showProgress) return;
      var progress = document.getElementById('${instanceId}-tabs-progress');
      if (progress) progress.textContent = viewedItems.size + ' of ' + tabsTotal + ' explored';
    }

    function selectTab(index, button, isAuto) {
      if (isTabLocked(index)) {
        if (!isAuto) announce('This tab is locked. Select the previous tab first.');
        if (autoAdvanceActive) stopAutoAdvance();
        return;
      }
      currentActiveIndex = index;
      var container = button.closest('.tabs-container');
      container.querySelectorAll('.tab-btn').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      container.querySelectorAll('.tab-panel').forEach(function(p) {
        // Leaving a tab must not leave its audio or video playing behind the new one.
        p.querySelectorAll('audio, video').forEach(function(mediaEl) {
          if (!mediaEl.paused) mediaEl.pause();
        });
        p.classList.remove('active');
        p.hidden = true;
      });
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      button.setAttribute('tabindex', '0');
      if (typeof button.scrollIntoView === 'function') {
        button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      var panel = document.getElementById('${instanceId}-tab-panel-' + index);
      panel.hidden = false;
      panel.classList.add('active');
      viewedItems.add(index);
      updateProgress();
      updateTabVisitedBadge(index);
      updateTabsProgressText();
      refreshTabLockState();
    }

    function startAutoAdvance() {
      if (!autoAdvanceEnabled) return;
      autoAdvanceActive = true;
      var btn = document.querySelector('.tabs-autoadvance-btn');
      if (btn) {
        btn.setAttribute('aria-pressed', 'true');
        var playSvg = btn.querySelector('.tabs-play-icon');
        var pauseSvg = btn.querySelector('.tabs-pause-icon');
        var label = btn.querySelector('.tabs-autoadvance-label');
        if (playSvg) playSvg.style.display = 'none';
        if (pauseSvg) pauseSvg.style.display = 'inline-block';
        if (label) label.textContent = 'Pause Auto-Play';
      }
      clearInterval(autoAdvanceTimer);
      autoAdvanceTimer = setInterval(function() {
        var tabs = Array.from(document.querySelectorAll('.tab-btn'));
        if (!tabs.length) return;
        var nextIndex = (currentActiveIndex + 1) % tabs.length;
        if (isTabLocked(nextIndex)) {
          stopAutoAdvance();
          return;
        }
        selectTab(nextIndex, tabs[nextIndex], true);
      }, autoAdvanceDelayMs);
    }

    function stopAutoAdvance() {
      autoAdvanceActive = false;
      clearInterval(autoAdvanceTimer);
      var btn = document.querySelector('.tabs-autoadvance-btn');
      if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        var playSvg = btn.querySelector('.tabs-play-icon');
        var pauseSvg = btn.querySelector('.tabs-pause-icon');
        var label = btn.querySelector('.tabs-autoadvance-label');
        if (playSvg) playSvg.style.display = 'inline-block';
        if (pauseSvg) pauseSvg.style.display = 'none';
        if (label) label.textContent = 'Auto-Play (${autoAdvanceDelay}s)';
      }
    }

    ${compareMode ? `
    function updateCompareColumns() {
      var columns = document.getElementById('${instanceId}-compare-columns');
      if (!columns) return;
      columns.innerHTML = '';
      if (compareSelected.length !== 2) return;
      compareSelected.forEach(function(idx) {
        var item = tabItems[idx];
        var col = document.createElement('div');
        col.className = 'tabs-compare-column';
        var heading = document.createElement('h4');
        heading.textContent = item.title || 'Section';
        var body = document.createElement('div');
        body.innerHTML = item.content || '';
        col.appendChild(heading);
        col.appendChild(body);
        columns.appendChild(col);
      });
    }` : ''}

    function resetTabs() {
      if (autoAdvanceActive) stopAutoAdvance();
      viewedItems.clear();
      currentActiveIndex = 0;
      var firstBtn = null;
      document.querySelectorAll('.tab-btn').forEach(function(btn, idx) {
        var isFirst = idx === 0;
        if (isFirst) firstBtn = btn;
        btn.classList.toggle('active', isFirst);
        btn.setAttribute('aria-selected', String(isFirst));
        btn.setAttribute('tabindex', isFirst ? '0' : '-1');
        updateTabVisitedBadge(idx);
      });
      document.querySelectorAll('.tab-panel').forEach(function(panel, idx) {
        panel.classList.toggle('active', idx === 0);
        panel.hidden = idx !== 0;
      });
      refreshTabLockState();
      updateTabsProgressText();
      updateProgress();
      if (firstBtn) firstBtn.focus();
      announce('Tabs reset.');
    }

    function initComponent() {
      var tabs = Array.from(document.querySelectorAll('.tab-btn'));
      tabs.forEach(function(button, idx) {
        button.addEventListener('click', function() {
          if (autoAdvanceActive) stopAutoAdvance();
          selectTab(idx, button);
        });
        button.addEventListener('keydown', function(event) {
          var next = idx;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (idx + 1) % tabs.length;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault();
          if (autoAdvanceActive) stopAutoAdvance();
          selectTab(next, tabs[next]);
          tabs[next].focus();
        });
      });

      refreshTabLockState();
      updateTabsProgressText();

      var tabsHeader = document.getElementById('${instanceId}-tabs-header');
      var prevArrow = document.getElementById('${instanceId}-nav-prev');
      var nextArrow = document.getElementById('${instanceId}-nav-next');

      function updateNavArrows() {
        if (!tabsHeader || !prevArrow || !nextArrow) return;
        var scrollLeft = tabsHeader.scrollLeft;
        var maxScroll = tabsHeader.scrollWidth - tabsHeader.clientWidth;
        var hasOverflow = maxScroll > 4;

        if (!hasOverflow) {
          prevArrow.hidden = true;
          nextArrow.hidden = true;
          prevArrow.disabled = true;
          nextArrow.disabled = true;
        } else {
          prevArrow.hidden = false;
          nextArrow.hidden = false;
          prevArrow.disabled = scrollLeft <= 2;
          nextArrow.disabled = scrollLeft >= maxScroll - 2;
        }
      }

      if (tabsHeader) {
        tabsHeader.addEventListener('scroll', updateNavArrows, { passive: true });
      }
      if (prevArrow) {
        prevArrow.addEventListener('click', function() {
          if (tabsHeader) tabsHeader.scrollBy({ left: -220, behavior: 'smooth' });
        });
      }
      if (nextArrow) {
        nextArrow.addEventListener('click', function() {
          if (tabsHeader) tabsHeader.scrollBy({ left: 220, behavior: 'smooth' });
        });
      }

      updateNavArrows();
      if (window.ResizeObserver && tabsHeader) {
        var ro = new ResizeObserver(function() {
          updateNavArrows();
        });
        ro.observe(tabsHeader);
      }
      window.addEventListener('resize', updateNavArrows);
      setTimeout(updateNavArrows, 100);

      var resetBtn = document.querySelector('.tabs-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', resetTabs);

      var autoAdvanceBtn = document.querySelector('.tabs-autoadvance-btn');
      if (autoAdvanceBtn) {
        autoAdvanceBtn.addEventListener('click', function() {
          if (autoAdvanceActive) stopAutoAdvance();
          else startAutoAdvance();
        });
      }

      var tabsContainer = document.querySelector('.tabs-container');
      if (tabsContainer) {
        tabsContainer.addEventListener('mouseenter', function() {
          if (autoAdvanceActive) clearInterval(autoAdvanceTimer);
        });
        tabsContainer.addEventListener('mouseleave', function() {
          if (autoAdvanceActive) startAutoAdvance();
        });
        tabsContainer.addEventListener('focusin', function() {
          if (autoAdvanceActive) clearInterval(autoAdvanceTimer);
        });
        tabsContainer.addEventListener('focusout', function() {
          if (autoAdvanceActive) startAutoAdvance();
        });
      }

      ${compareMode ? `
      var compareToggleBtn = document.querySelector('.tabs-compare-toggle-btn');
      var comparePanel = document.querySelector('.tabs-compare-panel');
      if (compareToggleBtn && comparePanel) {
        compareToggleBtn.addEventListener('click', function() {
          var willShow = comparePanel.hidden;
          comparePanel.hidden = !willShow;
          compareToggleBtn.setAttribute('aria-pressed', String(willShow));
        });
      }
      document.querySelectorAll('.tabs-compare-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
          var idx = parseInt(checkbox.getAttribute('data-idx'), 10);
          if (checkbox.checked) {
            if (compareSelected.length >= 2) { checkbox.checked = false; return; }
            compareSelected.push(idx);
          } else {
            compareSelected = compareSelected.filter(function(i) { return i !== idx; });
          }
          document.querySelectorAll('.tabs-compare-checkbox').forEach(function(cb) {
            if (!cb.checked) cb.disabled = compareSelected.length >= 2;
          });
          updateCompareColumns();
        });
      });` : ''}
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one tab.'];
  (config.items || []).forEach((item, index) => {
    if (item && item.media && item.media.type && item.media.type !== 'none') {
      validateItemMedia(item.media, index).errors.forEach(err => errors.push(err));
    }
  });
  return { valid: errors.length === 0, errors };
}
