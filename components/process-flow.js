import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeHTML, escapeAttribute, sanitizeRichText } from '../js/utilities.js';
import { wrapItemMediaContent, getItemMediaCSS, validateItemMedia } from '../js/item-media.js';

export const id = 'process-flow';
export const name = 'Step-by-Step Flow';
export const category = 'process';
export const defaultConfig = {
  processClickableNav: true,
  processShowCompletionBadges: false,
  processShowSummary: false,
  items: [
    { title: 'Define Objectives', content: 'Align course content with measurable learner metrics.' },
    { title: 'Create Visual Wireframes', content: 'Draft templates in the Rise Component Builder UI.' },
    { title: 'Export SCORM Pack', content: 'Zip files and deploy directly inside the Rise lesson LMS.' }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const clickableNav = config.processClickableNav !== false;
  const showBadges = config.processShowCompletionBadges === true;
  const showSummary = config.processShowSummary === true;
  const total = config.items.length;

  return `
    <div class="process-steps-container" id="${instanceId}">
      <div class="process-progress-header">
        <span class="step-badge" aria-live="polite" aria-atomic="true">Step <span id="${instanceId}-current-process-num">1</span> of ${total}</span>
        <nav class="process-dots" aria-label="Process step navigation">
          ${config.items.map((item, idx) => `
            <button type="button" class="p-dot ${idx === 0 ? 'active' : ''}" id="${instanceId}-dot-${idx}" data-idx="${idx}" aria-label="Go to Step ${idx + 1}: ${escapeAttribute(item.title || 'Step')}" ${!clickableNav && idx > 0 ? 'disabled' : ''}>
              <span class="p-dot-num">${idx + 1}</span>
              ${showBadges ? `<span class="p-dot-check" id="${instanceId}-dot-check-${idx}" hidden aria-hidden="true">&#10003;</span>` : ''}
            </button>
          `).join('')}
          ${showSummary ? `
            <button type="button" class="p-dot p-dot-summary" id="${instanceId}-dot-summary" data-idx="${total}" aria-label="Go to Process Summary" disabled>
              <span>&starf;</span>
            </button>
          ` : ''}
        </nav>
      </div>

      <!-- Breadcrumbs navigation row -->
      <div class="process-breadcrumbs-wrapper">
        <button type="button" class="process-crumb-arrow process-crumb-prev" id="${instanceId}-crumb-prev" aria-label="Scroll steps left" title="Scroll steps left" tabindex="-1" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div class="process-breadcrumbs" id="${instanceId}-breadcrumbs" role="tablist" aria-label="Step progress">
          ${config.items.map((item, idx) => `
            <button type="button" class="process-breadcrumb-item ${idx === 0 ? 'active' : ''}" id="${instanceId}-crumb-${idx}" data-idx="${idx}" role="tab" aria-selected="${idx === 0}">
              <span class="crumb-num">${idx + 1}.</span>
              <span class="crumb-title">${escapeHTML(item.title || 'Step ' + (idx + 1))}</span>
            </button>
          `).join('')}
        </div>
        <button type="button" class="process-crumb-arrow process-crumb-next" id="${instanceId}-crumb-next" aria-label="Scroll steps right" title="Scroll steps right" tabindex="-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <div class="process-slides-wrapper">
        ${config.items.map((item, idx) => {
          const duration = Number(item.durationMinutes);
          const durationLine = Number.isFinite(duration) && duration > 0
            ? `<p class="process-step-duration">Estimated time: ${Math.round(duration)} min</p>`
            : '';
          const contentHtml = sanitizeRichText(item.content || 'Step content description details go here.');
          
          // Optional branching options
          const branches = (item.branches || '').trim();
          let branchControlsHtml = '';
          if (branches) {
            const branchList = branches.split(',').map(b => b.trim()).filter(Boolean);
            if (branchList.length > 0) {
              branchControlsHtml = `
                <div class="process-branch-section">
                  <p class="process-branch-title">Choose next branch:</p>
                  <div class="process-branch-buttons">
                    ${branchList.map(b => {
                      const parts = b.split(':');
                      const label = parts[0].trim();
                      const targetStep = parts[1] ? parseInt(parts[1].trim(), 10) - 1 : idx + 1;
                      return `<button type="button" class="process-branch-btn" data-target-idx="${targetStep}">${escapeHTML(label)}</button>`;
                    }).join('')}
                  </div>
                </div>
              `;
            }
          }

          return `
          <div class="process-slide ${idx === 0 ? 'active' : ''}" id="${instanceId}-process-slide-${idx}" role="group" aria-roledescription="step" aria-label="Step ${idx + 1} of ${total}" tabindex="-1" ${idx === 0 ? '' : 'hidden'}>
            <h3>${escapeHTML(item.title || 'Step Headline')}</h3>
            ${durationLine}
            <div class="process-slide-body">${wrapItemMediaContent(item.media, `<p>${contentHtml}</p>`, instanceId, idx)}</div>
            ${branchControlsHtml}
          </div>
        `;
        }).join('')}

        ${showSummary ? `
          <div class="process-slide process-summary-slide" id="${instanceId}-process-slide-${total}" role="group" aria-roledescription="step" aria-label="Process Summary" tabindex="-1" hidden>
            <h3>Workflow Summary & Review</h3>
            <p class="process-summary-subtitle">Review all completed steps in this process:</p>
            <div class="process-summary-checklist">
              ${config.items.map((item, idx) => `
                <div class="process-summary-item" id="${instanceId}-summary-item-${idx}">
                  <div class="summary-check-icon">&#10003;</div>
                  <div class="summary-item-content">
                    <strong>Step ${idx + 1}: ${escapeHTML(item.title || 'Step')}</strong>
                    <p>${escapeHTML((item.content || '').replace(/<[^>]*>/g, '').substring(0, 120))}${item.content && item.content.length > 120 ? '...' : ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="process-controls-row">
        <button type="button" class="btn btn-secondary btn-small" id="${instanceId}-btn-process-prev" disabled>Previous</button>
        <button type="button" class="btn btn-primary btn-small" id="${instanceId}-btn-process-next">Next Step</button>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .process-steps-container {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .process-progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .step-badge {
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background-color: var(--border-color);
      padding: 4px 12px;
      border-radius: var(--att-radius-pill, 999px);
    }
    .process-dots {
      display: flex;
      gap: var(--att-space-2, 6px);
      align-items: center;
    }
    .p-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: var(--border-color);
      border: 2px solid transparent;
      color: var(--text-main);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      transition: all 0.2s;
      cursor: pointer;
      padding: 0;
      position: relative;
    }
    .p-dot:hover:not(:disabled) {
      border-color: var(--primary);
      transform: scale(1.05);
    }
    .p-dot.active {
      background-color: var(--primary);
      color: var(--on-primary);
      transform: scale(1.1);
    }
    .p-dot.completed {
      background-color: var(--att-cta-bg, #00388F);
      color: #FFF;
    }
    .p-dot:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .p-dot:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .p-dot-check {
      font-size: 11px;
    }
    .process-breadcrumbs-wrapper {
      display: flex;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--border-color);
      padding: 4px 0;
      position: relative;
    }
    .process-breadcrumbs {
      display: flex;
      flex-wrap: nowrap;
      gap: var(--att-space-2, 8px);
      padding: 2px 2px 4px;
      overflow-x: auto;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;
      flex: 1;
      min-width: 0;
    }
    .process-breadcrumbs::-webkit-scrollbar {
      display: none;
    }
    .process-breadcrumb-item {
      background: none;
      border: 1px solid transparent;
      border-radius: var(--att-radius-pill, 999px);
      padding: 4px 10px;
      font-size: var(--att-fs-eyebrow, 12px);
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .process-breadcrumb-item:hover {
      background-color: var(--bg-body);
      color: var(--text-main);
    }
    .process-breadcrumb-item.active {
      background-color: var(--primary);
      color: var(--on-primary);
      font-weight: 600;
    }
    .process-breadcrumb-item.completed {
      color: var(--primary);
      font-weight: 500;
    }
    .process-crumb-arrow {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      min-height: 28px;
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
    .process-crumb-arrow:hover:not(:disabled) {
      background: var(--bg-body);
      border-color: var(--primary);
      color: var(--primary-hover, var(--primary));
    }
    .process-crumb-arrow:disabled {
      opacity: 0.25;
      cursor: not-allowed;
      pointer-events: none;
    }
    .process-crumb-arrow[hidden] {
      display: none !important;
    }
    .process-slides-wrapper {
      min-height: 120px;
      padding: 8px 0;
    }
    .process-slide {
      display: none;
      animation: fadeIn 0.3s ease;
    }
    .process-slide.active {
      display: block;
    }
    .process-slide h3 {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      margin-bottom: 8px;
      color: var(--text-main);
      text-wrap: pretty;
    }
    .process-slide-body p, .process-slide p {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-muted);
      max-width: 70ch;
      margin: 0;
    }
    .process-step-duration {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--accent);
      margin-bottom: 8px;
    }
    .process-branch-section {
      margin-top: 16px;
      padding: 12px;
      background-color: var(--bg-body);
      border: 1px dashed var(--border-color);
      border-radius: var(--att-radius-md, 8px);
    }
    .process-branch-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .process-branch-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .process-branch-btn {
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      border-radius: var(--att-radius-pill, 999px);
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .process-branch-btn:hover {
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .process-summary-checklist {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 14px;
    }
    .process-summary-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px;
      background-color: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-md, 8px);
    }
    .summary-check-icon {
      width: 22px;
      height: 22px;
      background-color: var(--att-cta-bg, #00388F);
      color: #FFF;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .summary-item-content strong {
      font-size: 14px;
      color: var(--text-main);
      display: block;
      margin-bottom: 2px;
    }
    .summary-item-content p {
      font-size: 13px;
      color: var(--text-muted);
      margin: 0;
    }
    .process-controls-row {
      display: flex;
      justify-content: space-between;
      gap: var(--att-space-3, 12px);
    }
    .process-controls-row .btn {
      padding: 10px 24px;
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      border: none;
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      transition: all var(--animation-speed);
    }
    .process-controls-row .btn-small {
      padding: 10px 20px;
      font-size: var(--att-fs-body, 1rem);
    }
    .process-controls-row .btn-primary {
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .process-controls-row .btn-primary:hover:not(:disabled) {
      background-color: var(--primary-hover);
    }
    .process-controls-row .btn-secondary {
      background-color: transparent;
      color: var(--text-main);
      border: var(--border-style);
    }
    .process-controls-row .btn-secondary:hover:not(:disabled) {
      border-color: var(--primary);
      color: var(--primary);
    }
    .process-controls-row .btn:disabled {
      background-color: var(--att-grey-2, #DCDFE3);
      color: var(--att-grey-3, #BDC2C7);
      border-color: var(--att-grey-2, #DCDFE3);
      cursor: not-allowed;
      opacity: 0.6;
    }
    .process-controls-row .btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .process-controls-row .btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }

    ${getItemMediaCSS()}`;
}

export function generateJS(config, instanceId) {
  const showSummary = config.processShowSummary === true;
  const showBadges = config.processShowCompletionBadges === true;
  const total = config.items.length;
  const maxIdx = showSummary ? total : total - 1;

  return `
    var activeProcessIndex = 0;
    var totalProcessSteps = ${total};
    var maxProcessIndex = ${maxIdx};
    var showProcessSummary = ${showSummary};

    function jumpToProcessStep(targetIdx) {
      if (targetIdx < 0 || targetIdx > maxProcessIndex) return;

      var container = document.getElementById('${instanceId}') || document;
      container.querySelectorAll('.process-slide').forEach(function(s) {
        s.querySelectorAll('audio, video').forEach(function(mediaEl) { if (!mediaEl.paused) mediaEl.pause(); });
        s.classList.remove('active');
        s.hidden = true;
      });
      container.querySelectorAll('.p-dot').forEach(function(d) { d.classList.remove('active'); });
      container.querySelectorAll('.process-breadcrumb-item').forEach(function(b) { b.classList.remove('active'); });

      activeProcessIndex = targetIdx;

      var activeSlide = document.getElementById('${instanceId}-process-slide-' + activeProcessIndex);
      if (activeSlide) {
        activeSlide.hidden = false;
        activeSlide.classList.add('active');
      }

      var dot = document.getElementById('${instanceId}-dot-' + activeProcessIndex) || document.getElementById('${instanceId}-dot-summary');
      if (dot) dot.classList.add('active');

      var crumb = document.getElementById('${instanceId}-crumb-' + activeProcessIndex);
      if (crumb) {
        crumb.classList.add('active');
        if (typeof crumb.scrollIntoView === 'function') {
          crumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      var numEl = document.getElementById('${instanceId}-current-process-num');
      if (numEl) numEl.textContent = (activeProcessIndex >= totalProcessSteps ? 'Summary' : (activeProcessIndex + 1));

      var prevBtn = document.getElementById('${instanceId}-btn-process-prev');
      var nextBtn = document.getElementById('${instanceId}-btn-process-next');
      if (prevBtn) prevBtn.disabled = (activeProcessIndex === 0);
      if (nextBtn) {
        nextBtn.disabled = (activeProcessIndex === maxProcessIndex);
        nextBtn.textContent = (activeProcessIndex === totalProcessSteps - 1 && showProcessSummary) ? 'Review Summary' : (activeProcessIndex >= totalProcessSteps ? 'Completed' : 'Next Step');
      }

      if (activeProcessIndex < totalProcessSteps) {
        viewedItems.add(activeProcessIndex);
        ${showBadges ? `
          var badge = document.getElementById('${instanceId}-dot-check-' + activeProcessIndex);
          if (badge) badge.hidden = false;
          if (dot) dot.classList.add('completed');
        ` : ''}
        if (crumb) crumb.classList.add('completed');
      }

      updateProgress();
      if (activeSlide) {
        var h3 = activeSlide.querySelector('h3');
        if (h3) announce('Step ' + (activeProcessIndex + 1) + ': ' + h3.textContent);
      }
    }

    function moveProcessStep(direction) {
      jumpToProcessStep(activeProcessIndex + direction);
    }

    function initComponent() {
      var container = document.getElementById('${instanceId}');
      if (!container) return;

      var prevProcessBtn = document.getElementById('${instanceId}-btn-process-prev');
      var nextProcessBtn = document.getElementById('${instanceId}-btn-process-next');
      if (prevProcessBtn) prevProcessBtn.addEventListener('click', function() { moveProcessStep(-1); });
      if (nextProcessBtn) nextProcessBtn.addEventListener('click', function() { moveProcessStep(1); });

      container.querySelectorAll('.p-dot').forEach(function(dot) {
        dot.addEventListener('click', function() {
          jumpToProcessStep(parseInt(dot.getAttribute('data-idx'), 10));
        });
      });

      container.querySelectorAll('.process-breadcrumb-item').forEach(function(crumb) {
        crumb.addEventListener('click', function() {
          jumpToProcessStep(parseInt(crumb.getAttribute('data-idx'), 10));
        });
      });

      container.querySelectorAll('.process-branch-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var target = parseInt(btn.getAttribute('data-target-idx'), 10);
          jumpToProcessStep(target);
        });
      });

      var breadcrumbs = document.getElementById('${instanceId}-breadcrumbs');
      var prevCrumbArrow = document.getElementById('${instanceId}-crumb-prev');
      var nextCrumbArrow = document.getElementById('${instanceId}-crumb-next');

      function updateCrumbArrows() {
        if (!breadcrumbs || !prevCrumbArrow || !nextCrumbArrow) return;
        var scrollLeft = breadcrumbs.scrollLeft;
        var maxScroll = breadcrumbs.scrollWidth - breadcrumbs.clientWidth;
        var hasOverflow = maxScroll > 4;

        if (!hasOverflow) {
          prevCrumbArrow.hidden = true;
          nextCrumbArrow.hidden = true;
          prevCrumbArrow.disabled = true;
          nextCrumbArrow.disabled = true;
        } else {
          prevCrumbArrow.hidden = false;
          nextCrumbArrow.hidden = false;
          prevCrumbArrow.disabled = scrollLeft <= 2;
          nextCrumbArrow.disabled = scrollLeft >= maxScroll - 2;
        }
      }

      if (breadcrumbs) {
        breadcrumbs.addEventListener('scroll', updateCrumbArrows, { passive: true });
      }
      if (prevCrumbArrow) {
        prevCrumbArrow.addEventListener('click', function() {
          if (breadcrumbs) breadcrumbs.scrollBy({ left: -160, behavior: 'smooth' });
        });
      }
      if (nextCrumbArrow) {
        nextCrumbArrow.addEventListener('click', function() {
          if (breadcrumbs) breadcrumbs.scrollBy({ left: 160, behavior: 'smooth' });
        });
      }

      updateCrumbArrows();
      if (window.ResizeObserver && breadcrumbs) {
        var ro = new ResizeObserver(function() {
          updateCrumbArrows();
        });
        ro.observe(breadcrumbs);
      }
      window.addEventListener('resize', updateCrumbArrows);
      setTimeout(updateCrumbArrows, 100);

      jumpToProcessStep(0);
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length >= 2 ? [] : ['Add at least two process steps.'];
  (config.items || []).forEach((item, index) => {
    if (item && item.media && item.media.type && item.media.type !== 'none') {
      validateItemMedia(item.media, index).errors.forEach(err => errors.push(err));
    }
  });
  return { valid: errors.length === 0, errors };
}

