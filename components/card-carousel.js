import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeRichText, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

/**
 * Card Stack / Carousel Component
 * @typedef {Object} CardCarouselConfig
 * @property {string} [title] - Header title
 * @property {string} [content] - Explanatory caption / instructions
 * @property {boolean} [showPaginationDots] - Whether to show clickable pagination dot pills
 * @property {boolean} [loop] - Whether carousel wraps around at ends
 * @property {number} [cardsPerView] - Number of cards visible simultaneously (1, 2, or 3)
 * @property {Array<{title: string, category?: string, content: string, image?: string, altText?: string, buttonLabel?: string, buttonUrl?: string}>} items
 */

export const id = 'card-carousel';
export const name = 'Card Stack / Carousel';
export const category = 'cards';

/** @type {CardCarouselConfig} */
export const defaultConfig = {
  title: '5G Enterprise Solutions Portfolio',
  content: 'Explore how AT&T 5G and dedicated cellular infrastructure empower modern enterprise operations.',
  showPaginationDots: true,
  loop: false,
  cardsPerView: 1,
  items: [
    {
      title: 'Dedicated Private 5G Networks',
      category: 'Enterprise Security',
      content: 'High-security, custom-engineered cellular networks for manufacturing facilities, healthcare campuses, and defense sites requiring localized data processing and deterministic sub-10ms latency.',
      image: '',
      altText: '',
      buttonLabel: 'Explore Architecture',
      buttonUrl: ''
    },
    {
      title: 'Multi-Access Edge Computing (MEC)',
      category: 'Edge Cloud',
      content: 'Brings cloud processing power directly to local facility boundaries. Accelerates automated optical inspection, real-time analytics, and high-frame-rate computer vision with zero cloud egress bottlenecks.',
      image: '',
      altText: '',
      buttonLabel: 'View Case Studies',
      buttonUrl: ''
    },
    {
      title: 'AT&T Dynamic Defense',
      category: 'Cybersecurity',
      content: 'First-of-its-kind network security embedded directly into the AT&T core. Automatically intercepts and neutralizes distributed threat vectors before malicious traffic reaches customer premises.',
      image: '',
      altText: '',
      buttonLabel: 'Learn More',
      buttonUrl: ''
    }
  ]
};

export const editorSchema = getEditorSchema(id);

const chevronLeftIcon = getAttIconSvg('chevron-left', { width: 20, height: 20, ariaHidden: true });
const chevronRightIcon = getAttIconSvg('chevron-right', { width: 20, height: 20, ariaHidden: true });
const cardsIcon = getAttIconSvg('multi-screen', { width: 22, height: 22, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const items = Array.isArray(config.items) && config.items.length ? config.items : defaultConfig.items;
  const showDots = config.showPaginationDots !== false;
  const isLoop = Boolean(config.loop);
  const cardsPerView = Math.max(1, Math.min(3, Number(config.cardsPerView) || 1));
  const total = items.length;

  const slidesHtml = items.map((item, idx) => {
    const isFirst = idx === 0;
    return `
      <div class="carousel-slide-item ${isFirst ? 'is-active' : ''}"
        id="${instanceId}-slide-${idx}"
        role="group"
        aria-roledescription="slide"
        aria-label="${idx + 1} of ${total}">
        <div class="carousel-card-inner">
          ${item.category ? `
            <div class="carousel-card-category">
              <span class="carousel-category-badge">${richInline(item.category)}</span>
            </div>
          ` : ''}
          ${item.image ? `
            <div class="carousel-card-image-wrap">
              <img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.altText || item.title || '')}" class="carousel-card-image">
            </div>
          ` : ''}
          <h4 class="carousel-card-title">${richInline(item.title, `Card ${idx + 1}`)}</h4>
          <div class="carousel-card-body">${sanitizeRichText(item.content || '')}</div>
          ${item.buttonLabel ? `
            <div class="carousel-card-actions">
              <a href="${escapeAttribute(item.buttonUrl || '#')}" class="carousel-card-btn" ${item.buttonUrl ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                <span>${richInline(item.buttonLabel)}</span>
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  const dotsHtml = showDots ? `
    <div class="carousel-dots-row" id="${instanceId}-dots" role="tablist" aria-label="Carousel navigation dots">
      ${items.map((_, idx) => `
        <button type="button" class="carousel-dot-btn ${idx === 0 ? 'is-active' : ''}"
          id="${instanceId}-dot-${idx}"
          role="tab"
          data-slide-index="${idx}"
          aria-label="Go to card ${idx + 1}"
          aria-selected="${idx === 0 ? 'true' : 'false'}"
          tabindex="${idx === 0 ? '0' : '-1'}">
        </button>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="carousel-card-block" id="${instanceId}-carousel-block"
      data-total="${total}"
      data-cards-per-view="${cardsPerView}"
      data-loop="${isLoop}"
      style="--cards-per-view: ${cardsPerView};">
      ${config.title ? `
        <div class="carousel-header">
          <div class="carousel-header-icon">${cardsIcon}</div>
          <h3 class="carousel-title">${richInline(config.title)}</h3>
        </div>
      ` : ''}
      ${config.content ? `<p class="carousel-description">${sanitizeRichText(config.content)}</p>` : ''}

      <div class="carousel-stage-container" id="${instanceId}-stage" role="region" aria-roledescription="carousel" aria-label="${escapeAttribute(richTextToPlain(config.title) || 'Card Carousel')}">
        <div class="carousel-track-wrapper" id="${instanceId}-track-wrapper" tabindex="0" aria-label="Swipeable card carousel track">
          <div class="carousel-track" id="${instanceId}-track" style="transform: translateX(0%);">
            ${slidesHtml}
          </div>
        </div>

        <div class="carousel-controls-bar">
          <button type="button" class="carousel-nav-btn carousel-btn-prev btn-prev" id="${instanceId}-btn-prev" aria-label="Previous card" ${!isLoop ? 'disabled' : ''}>
            ${chevronLeftIcon}
          </button>
          <div class="carousel-counter" id="${instanceId}-counter" aria-live="polite">
            <span class="carousel-counter-current">1</span> of <span class="carousel-counter-total">${total}</span>
          </div>
          <button type="button" class="carousel-nav-btn carousel-btn-next btn-next" id="${instanceId}-btn-next" aria-label="Next card" ${total <= cardsPerView && !isLoop ? 'disabled' : ''}>
            ${chevronRightIcon}
          </button>
        </div>

        ${dotsHtml}
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .carousel-card-block {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .carousel-header {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 12px);
    }
    .carousel-header-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--primary, #00388F);
      flex-shrink: 0;
    }
    .carousel-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
      margin: 0;
    }
    .carousel-description {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
      margin: 0;
    }
    .carousel-stage-container {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      width: 100%;
    }
    .carousel-track-wrapper {
      overflow: hidden;
      border-radius: var(--att-radius-md, 16px);
      background-color: var(--bg-body, #F3F4F5);
      padding: var(--att-space-3, 12px);
      touch-action: pan-y;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
    }
    .carousel-track-wrapper.is-dragging {
      cursor: grabbing;
    }
    .carousel-track {
      display: flex;
      width: 100%;
      transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .carousel-track {
        transition: none;
      }
    }
    .carousel-slide-item {
      flex: 0 0 calc(100% / var(--cards-per-view, 1));
      min-width: calc(100% / var(--cards-per-view, 1));
      box-sizing: border-box;
      padding: var(--att-space-2, 8px);
    }
    @media (max-width: 768px) {
      .carousel-slide-item {
        flex: 0 0 100% !important;
        min-width: 100% !important;
      }
    }
    .carousel-card-inner {
      background-color: var(--bg-card, #FFFFFF);
      border: 1px solid var(--border-color, #DCDFE3);
      border-radius: var(--att-radius-md, 16px);
      padding: var(--att-space-5, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
      min-height: 220px;
      height: 100%;
      box-sizing: border-box;
      box-shadow: var(--shadow-style);
    }
    .carousel-card-category {
      display: flex;
    }
    .carousel-category-badge {
      display: inline-block;
      padding: 3px var(--att-space-3, 12px);
      border-radius: 9999px;
      background-color: var(--bg-body, #F3F4F5);
      color: var(--primary, #00388F);
      font-size: var(--att-fs-xs, 0.8125rem);
      font-weight: var(--att-fw-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .carousel-card-image-wrap {
      width: 100%;
      max-height: 220px;
      overflow: hidden;
      border-radius: var(--att-radius-sm, 12px);
    }
    .carousel-card-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .carousel-card-title {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.3);
      color: var(--primary, #00388F);
      margin: 0;
    }
    .carousel-card-body {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-main);
    }
    .carousel-card-actions {
      margin-top: auto;
      padding-top: var(--att-space-2, 8px);
      display: flex;
    }
    .carousel-card-btn {
      display: inline-flex;
      align-items: center;
      padding: var(--att-space-2, 8px) var(--att-space-4, 16px);
      border-radius: var(--att-radius-sm, 12px);
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
      text-decoration: none;
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      min-height: 44px;
      transition: background-color 180ms ease;
    }
    .carousel-card-btn:hover {
      background-color: var(--att-blue, #009FDB);
    }
    .carousel-card-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .carousel-controls-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--att-space-4, 16px);
      width: 100%;
    }
    .carousel-nav-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid var(--border-color, #DCDFE3);
      background-color: var(--bg-card, #FFFFFF);
      color: var(--primary, #00388F);
      cursor: pointer;
      transition: all 180ms ease;
      flex-shrink: 0;
    }
    .carousel-nav-btn:hover:not(:disabled) {
      border-color: var(--primary, #00388F);
      background-color: var(--primary, #00388F);
      color: #FFFFFF;
    }
    .carousel-nav-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .carousel-nav-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      border-color: var(--border-color, #DCDFE3);
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-muted, #4B5563);
    }
    .carousel-counter {
      font-family: var(--att-font-sans, sans-serif);
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      font-variant-numeric: tabular-nums;
      min-width: 60px;
      text-align: center;
    }
    .carousel-dots-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--att-space-2, 8px);
      width: 100%;
    }
    .carousel-dot-btn {
      width: 12px;
      height: 12px;
      border-radius: 6px;
      border: none;
      background-color: var(--border-color, #DCDFE3);
      cursor: pointer;
      padding: 0;
      transition: all 200ms ease;
    }
    .carousel-dot-btn:hover {
      background-color: var(--att-blue, #009FDB);
    }
    .carousel-dot-btn:focus-visible {
      outline: 3px solid var(--primary, #00388F);
      outline-offset: 2px;
    }
    .carousel-dot-btn.is-active {
      width: 28px;
      background-color: var(--primary, #00388F);
    }
  `;
}

export function generateJS(config, instanceId) {
  return `
    function initComponent() {
      var root = document.getElementById('${instanceId}-carousel-block');
      var track = document.getElementById('${instanceId}-track');
      var btnPrev = document.getElementById('${instanceId}-btn-prev');
      var btnNext = document.getElementById('${instanceId}-btn-next');
      var counterEl = document.getElementById('${instanceId}-counter');
      var dotsContainer = document.getElementById('${instanceId}-dots');
      var trackWrapper = document.getElementById('${instanceId}-track-wrapper');

      if (!root || !track) return;

      var total = Number(root.dataset.total) || 1;
      var cardsPerView = Number(root.dataset.cardsPerView) || 1;
      var isLoop = root.dataset.loop === 'true';
      var currentIndex = 0;
      var startX = 0;
      var isDragging = false;

      function getEffectiveCardsPerView() {
        return window.innerWidth <= 768 ? 1 : cardsPerView;
      }

      function getMaxIndex() {
        var eff = getEffectiveCardsPerView();
        return Math.max(0, total - eff);
      }

      function updateSlide(index) {
        var maxIdx = getMaxIndex();
        if (index < 0) {
          index = isLoop ? maxIdx : 0;
        } else if (index > maxIdx) {
          index = isLoop ? 0 : maxIdx;
        }

        currentIndex = index;
        var eff = getEffectiveCardsPerView();
        var shiftPct = (100 / eff) * currentIndex;
        track.style.transform = 'translateX(-' + shiftPct + '%)';

        if (counterEl) {
          var curSpan = counterEl.querySelector('.carousel-counter-current');
          if (curSpan) curSpan.textContent = String(currentIndex + 1);
        }

        if (btnPrev && !isLoop) {
          btnPrev.disabled = currentIndex === 0;
        }
        if (btnNext && !isLoop) {
          btnNext.disabled = currentIndex >= maxIdx;
        }

        if (dotsContainer) {
          var dotButtons = dotsContainer.querySelectorAll('.carousel-dot-btn');
          dotButtons.forEach(function(dot, idx) {
            var isActive = idx === currentIndex;
            dot.classList.toggle('is-active', isActive);
            dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
            dot.tabIndex = isActive ? 0 : -1;
          });
        }

        viewedItems.add(currentIndex);
        updateProgress();
      }

      function handleDragStart(clientX) {
        isDragging = true;
        startX = clientX;
        if (trackWrapper) trackWrapper.classList.add('is-dragging');
      }

      function handleDragEnd(clientX) {
        if (!isDragging) return;
        isDragging = false;
        if (trackWrapper) trackWrapper.classList.remove('is-dragging');
        var diff = startX - clientX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) {
            updateSlide(currentIndex + 1);
          } else {
            updateSlide(currentIndex - 1);
          }
        }
      }

      if (btnPrev) {
        btnPrev.addEventListener('click', function() {
          updateSlide(currentIndex - 1);
        });
      }

      if (btnNext) {
        btnNext.addEventListener('click', function() {
          updateSlide(currentIndex + 1);
        });
      }

      if (dotsContainer) {
        dotsContainer.addEventListener('click', function(e) {
          var dot = e.target.closest('.carousel-dot-btn');
          if (!dot) return;
          var slideIdx = Number(dot.dataset.slideIndex);
          if (Number.isFinite(slideIdx)) {
            updateSlide(slideIdx);
          }
        });
      }

      if (trackWrapper) {
        trackWrapper.setAttribute('tabindex', '0');
        trackWrapper.addEventListener('keydown', function(e) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            updateSlide(currentIndex - 1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            updateSlide(currentIndex + 1);
          } else if (e.key === 'Home') {
            e.preventDefault();
            updateSlide(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            updateSlide(getMaxIndex());
          }
        });

        // Touch swipe support (mobile / tablet)
        trackWrapper.addEventListener('touchstart', function(e) {
          if (e.touches && e.touches.length) {
            handleDragStart(e.touches[0].clientX);
          }
        }, { passive: true });

        trackWrapper.addEventListener('touchend', function(e) {
          if (e.changedTouches && e.changedTouches.length) {
            handleDragEnd(e.changedTouches[0].clientX);
          }
        }, { passive: true });

        // Cursor mouse drag swipe support (desktop)
        trackWrapper.addEventListener('mousedown', function(e) {
          if (e.target.closest('a, button, input, textarea, select')) return;
          handleDragStart(e.clientX);
        });

        window.addEventListener('mouseup', function(e) {
          if (isDragging) {
            handleDragEnd(e.clientX);
          }
        });
      }

      window.addEventListener('resize', function() {
        updateSlide(currentIndex);
      });

      // Initial tracking
      updateSlide(0);
    }
  `;
}

export function validate(config) {
  const errors = [];
  if (!config.items || !config.items.length) {
    errors.push('Card Stack / Carousel requires at least one card item.');
  } else {
    config.items.forEach((item, idx) => {
      if (!item.title || !item.title.trim()) {
        errors.push(`Card ${idx + 1} is missing a title.`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

