import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeRichText, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';
import { combineValidationResults } from '../js/validation-utils.js';
import { wrapItemMediaContent, getItemMediaCSS, validateItemMedia } from '../js/item-media.js';

/**
 * Vertical Timeline Component Configuration
 * @typedef {Object} VerticalTimelineConfig
 * @property {Array<{title: string, content: string, category?: string, media?: any}>} items - Array of timeline steps
 * @property {boolean} [timelineCategoriesEnabled] - Shows a category badge per step and a filter chip row
 * @property {boolean} [timelineCompareMode] - Splits steps into two labeled streams by category (requires 2+ distinct categories)
 * @property {boolean} [timelineCollapsibleDetails] - Steps start collapsed; click/Enter expands
 * @property {boolean} [timelineShowProgress] - Shows an "N of M explored" indicator, independent of trackCompletion
 * @property {boolean} [timelineChronologicalReveal] - Locks each step until the previous one has been viewed
 * @property {boolean} [timelineShowVisitedBadge] - Shows a "Visited" check badge on each step the learner has opened
 * @property {boolean} [timelineAllowReset] - Shows a "Reset" action clearing visited/expanded/lock/filter state
 */

export const id = 'vertical-timeline';
export const name = 'Vertical Step Timeline';
export const category = 'timelines';

/** @type {VerticalTimelineConfig} */
export const defaultConfig = {
  // Free, single-track browsing is the original, unchanged default — every timelineX
  // field below is additive/optional, so a project saved before this feature existed
  // renders and behaves identically.
  timelineCategoriesEnabled: false,
  timelineCompareMode: false,
  timelineCollapsibleDetails: false,
  timelineShowProgress: false,
  timelineChronologicalReveal: false,
  timelineShowVisitedBadge: false,
  timelineAllowReset: false,
  items: [
    { title: 'Phase 1: Research', content: 'Collect data assets, requirements, and verify targets.' },
    { title: 'Phase 2: Build Layout', content: 'Configure colors, fonts, margins, and borders in the tool.' },
    { title: 'Phase 3: Export HTML', content: 'Copy custom block and import inside Articulate Rise blocks.' }
  ]
};
export const editorSchema = getEditorSchema(id);

const lockIconSvg = getAttIconSvg('padlock', { className: 'step-lock-icon', width: 11, height: 11, ariaHidden: true });
const visitedCheckIconSvg = getAttIconSvg('check', { className: 'step-visited-icon', width: 11, height: 11, ariaHidden: true });

function renderStep(item, index, instanceId, opts) {
  const { collapsible, locked, showCategoryBadge, showVisitedBadge } = opts;
  const trimmedCategory = (item.category || '').trim();
  const stepNum = index + 1;
  const contentHtml = sanitizeRichText(item.content || 'Step content description details go here.');
  const categoryBadge = showCategoryBadge && trimmedCategory ? `<span class="step-category-badge">${escapeHTML(trimmedCategory)}</span>` : '';
  const visitedBadge = showVisitedBadge ? `<span class="step-visited-badge" id="${instanceId}-visited-${index}" hidden>${visitedCheckIconSvg} Visited</span>` : '';
  const categoryAttr = trimmedCategory ? ` data-category="${escapeAttribute(trimmedCategory)}"` : '';
  const lockNote = locked ? `<p class="step-lock-note" id="${instanceId}-step-lock-note-${index}">Locked — reveal the previous step first.</p>` : '';
  const lockIconSlot = collapsible || locked ? `<span class="step-lock-icon-slot" ${locked ? '' : 'hidden'}>${lockIconSvg}</span>` : '';

  if (collapsible) {
    return `<div class="timeline-step${locked ? ' locked' : ''}" data-idx="${index}"${categoryAttr} id="${instanceId}-step-${index}">
      <div class="step-marker" aria-hidden="true"><span class="step-num">${stepNum}</span></div>
      <div class="step-card">
        <button type="button" class="step-toggle-btn" id="${instanceId}-step-toggle-${index}" aria-expanded="false" aria-controls="${instanceId}-step-body-${index}" ${locked ? `aria-disabled="true" aria-describedby="${instanceId}-step-lock-note-${index}"` : ''}>
          ${lockIconSlot}<h4>${item.title ? sanitizeRichText(item.title) : 'Step Title'}</h4>${categoryBadge}${visitedBadge}
        </button>
        <div class="step-body" id="${instanceId}-step-body-${index}" hidden>${wrapItemMediaContent(item.media, `<p>${contentHtml}</p>`, instanceId, index)}</div>
        ${lockNote}
      </div>
    </div>`;
  }

  return `<div class="timeline-step${locked ? ' locked' : ''}" role="listitem" tabindex="0" data-idx="${index}"${categoryAttr} id="${instanceId}-step-${index}" aria-label="Step ${stepNum}: ${escapeAttribute(richTextToPlain(item.title) || 'Step Title')}" aria-pressed="false" ${locked ? `aria-disabled="true" aria-describedby="${instanceId}-step-lock-note-${index}"` : ''}>
    <div class="step-marker" aria-hidden="true"><span class="step-num">${stepNum}</span></div>
    <div class="step-card">
      <h4>${lockIconSlot}${item.title ? sanitizeRichText(item.title) : 'Step Title'}${categoryBadge}${visitedBadge}</h4>
      ${wrapItemMediaContent(item.media, `<p>${contentHtml}</p>`, instanceId, index)}
      ${lockNote}
    </div>
  </div>`;
}

export function generateHTML(config, instanceId) {
  const categoriesEnabled = config.timelineCategoriesEnabled === true;
  const collapsible = config.timelineCollapsibleDetails === true;
  const showProgress = config.timelineShowProgress === true;
  const chronological = config.timelineChronologicalReveal === true;
  const showVisitedBadge = config.timelineShowVisitedBadge === true;
  const allowReset = config.timelineAllowReset === true;
  const total = config.items.length;

  const distinctCategories = categoriesEnabled
    ? [...new Set(config.items.map(it => (it.category || '').trim()).filter(Boolean))]
    : [];
  // Compare mode needs something real to compare — with fewer than 2 distinct
  // categories authored, it silently falls back to the normal single-track list
  // (still showing category badges if any are set) rather than rendering a
  // half-empty second column.
  const compareMode = config.timelineCompareMode === true && categoriesEnabled && distinctCategories.length >= 2;

  const filterChips = categoriesEnabled && !compareMode && distinctCategories.length ? `
    <div class="timeline-filter-chips" role="group" aria-label="Filter by category">
      <button type="button" class="timeline-filter-chip active" data-filter-category="">All</button>
      ${distinctCategories.map(cat => `<button type="button" class="timeline-filter-chip" data-filter-category="${escapeAttribute(cat)}">${escapeHTML(cat)}</button>`).join('')}
    </div>
  ` : '';

  const toolbar = (filterChips || showProgress || allowReset) ? `
    <div class="timeline-toolbar">
      ${filterChips}
      <div class="timeline-toolbar-row">
        ${allowReset ? '<button type="button" class="timeline-toolbar-btn timeline-reset-btn">Reset</button>' : ''}
        ${showProgress ? `<span class="timeline-progress-text" id="${instanceId}-timeline-progress" role="status" aria-live="polite">0 of ${total} explored</span>` : ''}
      </div>
    </div>
  ` : '';

  if (compareMode) {
    const [streamA, streamB] = distinctCategories;
    const itemsWithIndex = config.items.map((item, index) => ({ item, index }));
    const columnA = itemsWithIndex.filter(entry => (entry.item.category || '').trim() === streamA);
    const columnB = itemsWithIndex.filter(entry => (entry.item.category || '').trim() !== streamA);
    const renderColumn = (label, entries) => `
      <div class="timeline-compare-column">
        <h3 class="timeline-compare-column-title">${escapeHTML(label)}</h3>
        <div class="vertical-timeline-container" role="list" aria-label="${escapeAttribute(label)} timeline">
          <div class="timeline-spine-track"><div class="timeline-spine-fill"></div></div>
          ${entries.map(entry => renderStep(entry.item, entry.index, instanceId, { collapsible, locked: chronological && entry.index > 0, showCategoryBadge: false, showVisitedBadge })).join('')}
        </div>
      </div>`;
    return `${toolbar}<div class="timeline-compare-layout">${renderColumn(streamA, columnA)}${renderColumn(streamB || 'Other', columnB)}</div>`;
  }

  return `${toolbar}<div class="vertical-timeline-container" role="list" aria-label="Timeline">
    <div class="timeline-spine-track"><div class="timeline-spine-fill" id="${instanceId}-spine-fill"></div></div>
    ${config.items.map((item, index) => renderStep(item, index, instanceId, {
    collapsible,
    locked: chronological && index > 0,
    showCategoryBadge: categoriesEnabled,
    showVisitedBadge
  })).join('')}</div>`;
}

export function generateCSS() {
  return `
    .timeline-toolbar {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
      margin-bottom: var(--att-space-4, 16px);
    }
    .timeline-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
    }
    .timeline-toolbar-row {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
    }
    .timeline-filter-chip, .timeline-toolbar-btn {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
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
    .timeline-filter-chip.active {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary) inset;
    }
    .timeline-progress-text {
      margin-left: auto;
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 600;
      color: var(--text-muted);
    }

    .vertical-timeline-container {
      display: flex;
      flex-direction: column;
      position: relative;
      padding-left: var(--att-space-6, 32px);
    }

    .vertical-timeline-container::before {
      content: '';
      position: absolute;
      left: 12px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background-color: var(--border-color);
    }

    .timeline-spine-track {
      position: absolute;
      left: 12px;
      top: 14px;
      bottom: 24px;
      width: 2px;
      background-color: transparent;
      z-index: 1;
    }
    .timeline-spine-fill {
      width: 100%;
      height: 0%;
      background-color: var(--primary);
      transition: height 0.3s ease;
    }

    .timeline-step {
      position: relative;
      margin-bottom: var(--att-space-5, 24px);
      cursor: pointer;
    }

    .timeline-step[hidden] {
      display: none;
    }

    .timeline-step[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .step-marker {
      position: absolute;
      left: -32px;
      top: 14px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background-color: var(--border-color);
      border: 2px solid var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }

    .step-num {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 700;
      color: var(--text-main);
    }

    .step-card {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
    }

    .step-card h4 {
      font-size: var(--att-fs-body-lg, 18px);
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      text-wrap: pretty;
    }

    .step-card p {
      font-size: var(--att-fs-body, 16px);
      color: var(--text-muted);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
    }
    .timeline-step.active .step-marker {
      background-color: var(--primary);
    }
    .timeline-step.active .step-num {
      color: var(--on-primary);
    }
    .timeline-step.active .step-card {
      border-color: var(--primary);
    }

    .step-category-badge {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 10px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--border-color);
      color: var(--text-main);
    }

    /* Visited/complete — check icon (already present) + Cobalt on a neutral grey
       fill, per the brand's "not colour alone" state rule. */
    .step-visited-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 600;
      color: var(--att-cta-bg, #00388F);
      background-color: var(--att-grey-1, #F3F4F5);
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
    }

    .step-lock-icon-slot {
      display: inline-flex;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .step-lock-note {
      margin-top: 6px;
      font-size: var(--att-fs-body-sm, 14px);
      font-style: italic;
      color: var(--text-muted);
    }

    .timeline-step:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    .step-toggle-btn {
      width: 100%;
      background: transparent;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }

    .step-toggle-btn:active:not([aria-disabled="true"]) {
      transform: scale(0.98);
    }

    .step-toggle-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary)) !important;
      outline-offset: 2px !important;
    }

    .step-toggle-btn[aria-disabled="true"] {
      cursor: not-allowed;
    }

    .step-toggle-btn h4 {
      margin: 0;
      flex: 1;
    }

    .step-body {
      margin-top: 8px;
    }

    .step-body p {
      font-size: var(--att-fs-body, 16px);
      color: var(--text-muted);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
    }

    .timeline-compare-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--att-space-5, 24px);
    }
    .timeline-compare-column {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, 20px);
      padding: var(--att-space-4, 16px);
    }
    .timeline-compare-column-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 1px dashed var(--border-color);
    }
    @media (max-width: 600px) {
      .timeline-compare-layout {
        grid-template-columns: 1fr;
      }
    }

    ${getItemMediaCSS()}`;
}

export function generateJS(config, instanceId) {
  const collapsible = config.timelineCollapsibleDetails === true;
  const chronological = config.timelineChronologicalReveal === true;
  const categoriesEnabled = config.timelineCategoriesEnabled === true;
  const showProgress = config.timelineShowProgress === true;
  const total = config.items.length;

  return `
    var collapsibleSteps = ${collapsible};
    var chronologicalReveal = ${chronological};
    var categoriesEnabled = ${categoriesEnabled};
    var showProgress = ${showProgress};
    var timelineTotal = ${total};

    function isStepLocked(index) {
      return chronologicalReveal && index > 0 && !viewedItems.has(index - 1);
    }

    function refreshStepLockState() {
      if (!chronologicalReveal) return;
      document.querySelectorAll('.timeline-step').forEach(function(stepEl) {
        var idx = parseInt(stepEl.getAttribute('data-idx'), 10);
        var locked = isStepLocked(idx);
        var lockSlot = stepEl.querySelector('.step-lock-icon-slot');
        var note = document.getElementById('${instanceId}-step-lock-note-' + idx);
        var control = stepEl.querySelector('.step-toggle-btn') || stepEl;
        stepEl.classList.toggle('locked', locked);
        if (locked) control.setAttribute('aria-disabled', 'true');
        else control.removeAttribute('aria-disabled');
        if (lockSlot) lockSlot.hidden = !locked;
        if (note) note.hidden = !locked;
      });
    }

    function updateTimelineProgressText() {
      if (!showProgress) return;
      var progress = document.getElementById('${instanceId}-timeline-progress');
      if (progress) progress.textContent = viewedItems.size + ' of ' + timelineTotal + ' explored';
    }

    function updateSpineFill() {
      var spine = document.getElementById('${instanceId}-spine-fill');
      if (spine && timelineTotal > 1) {
        var maxIdx = -1;
        viewedItems.forEach(function(i) { if (i > maxIdx) maxIdx = i; });
        var pct = maxIdx >= 0 ? Math.min(100, Math.round((maxIdx / (timelineTotal - 1)) * 100)) : 0;
        spine.style.height = pct + '%';
      }
    }

    function markStepViewed(index) {
      viewedItems.add(index);
      var badge = document.getElementById('${instanceId}-visited-' + index);
      if (badge) badge.hidden = false;
      updateProgress();
      updateTimelineProgressText();
      updateSpineFill();
      refreshStepLockState();
    }

    function applyTimelineFilter(categoryValue) {
      var visibleCount = 0;
      document.querySelectorAll('.timeline-step').forEach(function(stepEl) {
        var matches = !categoryValue || stepEl.getAttribute('data-category') === categoryValue;
        stepEl.hidden = !matches;
        if (matches) visibleCount++;
      });
      announce(visibleCount + ' step' + (visibleCount === 1 ? '' : 's') + ' shown.');
    }

    function resetTimeline() {
      viewedItems.clear();
      document.querySelectorAll('.timeline-step').forEach(function(stepEl) {
        stepEl.classList.remove('active');
        stepEl.hidden = false;
        if (stepEl.hasAttribute('aria-pressed')) stepEl.setAttribute('aria-pressed', 'false');
        var toggleBtn = stepEl.querySelector('.step-toggle-btn');
        var body = stepEl.querySelector('.step-body');
        if (toggleBtn && body) {
          toggleBtn.setAttribute('aria-expanded', 'false');
          body.hidden = true;
        }
        var badge = stepEl.querySelector('.step-visited-badge');
        if (badge) badge.hidden = true;
      });
      refreshStepLockState();
      updateTimelineProgressText();
      updateSpineFill();
      updateProgress();
      document.querySelectorAll('.timeline-filter-chip').forEach(function(chip) {
        chip.classList.toggle('active', chip.getAttribute('data-filter-category') === '');
      });
      var firstStep = document.querySelector('.timeline-step');
      if (firstStep) (firstStep.querySelector('.step-toggle-btn') || firstStep).focus();
      announce('Timeline reset.');
    }

    function initComponent() {
      document.querySelectorAll('.timeline-step').forEach(function(stepEl) {
        var idx = parseInt(stepEl.getAttribute('data-idx'), 10);

        if (collapsibleSteps) {
          var toggleBtn = stepEl.querySelector('.step-toggle-btn');
          var body = stepEl.querySelector('.step-body');
          if (toggleBtn && body) {
            toggleBtn.addEventListener('click', function() {
              if (isStepLocked(idx)) {
                announce('This step is locked. Reveal the previous step first.');
                return;
              }
              var expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
              toggleBtn.setAttribute('aria-expanded', String(!expanded));
              if (expanded) body.querySelectorAll('audio, video').forEach(function(mediaEl) { if (!mediaEl.paused) mediaEl.pause(); });
              body.hidden = expanded;
              if (!expanded) markStepViewed(idx);
            });
          }
        } else {
          stepEl.addEventListener('click', function() {
            if (isStepLocked(idx)) {
              announce('This step is locked. Reveal the previous step first.');
              return;
            }
            document.querySelectorAll('.timeline-step').forEach(function(item) { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
            stepEl.classList.add('active');
            stepEl.setAttribute('aria-pressed', 'true');
            markStepViewed(idx);
          });
          stepEl.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              stepEl.click();
            }
          });
        }
      });

      refreshStepLockState();
      updateTimelineProgressText();
      updateSpineFill();

      if (categoriesEnabled) {
        document.querySelectorAll('.timeline-filter-chip').forEach(function(chip) {
          chip.addEventListener('click', function() {
            document.querySelectorAll('.timeline-filter-chip').forEach(function(c) { c.classList.remove('active'); });
            chip.classList.add('active');
            applyTimelineFilter(chip.getAttribute('data-filter-category'));
          });
        });
      }

      var resetBtn = document.querySelector('.timeline-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', resetTimeline);
    }`;
}

/**
 * Validates vertical timeline component configuration.
 * @param {VerticalTimelineConfig} config - The configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validate(config) {
  const results = [];
  // No date field exists in this component's schema (items are title+content+category),
  // so this checks item presence directly rather than going through
  // validateTimelineEvents, whose date/chronological-order logic doesn't apply here.
  if (!Array.isArray(config.items) || config.items.length === 0) {
    results.push({ valid: false, error: 'At least one timeline step is required.' });
  } else {
    config.items.forEach((item, index) => {
      if (!item.title || !String(item.title).trim()) {
        results.push({ valid: false, error: `Step ${index + 1}: Title is required.` });
      }
      if (!item.content || !String(item.content).trim()) {
        results.push({ valid: false, error: `Step ${index + 1}: Description is required.` });
      }
      if (item.media && item.media.type && item.media.type !== 'none') {
        validateItemMedia(item.media, index).errors.forEach(err => results.push({ valid: false, error: err }));
      }
    });
  }

  return combineValidationResults(results);
}
