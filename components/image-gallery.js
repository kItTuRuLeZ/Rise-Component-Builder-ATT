import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeURL, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'image-gallery';
export const name = 'Grid Photo Gallery';
export const category = 'media';
export const defaultConfig = {
  galleryLayout: 'grid',
  items: [
    { title: 'Workspace Design System', category: 'Design', content: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800' },
    { title: 'User Layout Journey', category: 'UX Architecture', content: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800' }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const isMasonry = config.galleryLayout === 'masonry';
  const categories = [...new Set(config.items.map(it => (it.category || '').trim()).filter(Boolean))];

  const filterChipsHtml = categories.length > 0 ? `
    <div class="gallery-filter-chips" role="group" aria-label="Filter gallery by category">
      <button type="button" class="gallery-filter-chip active" data-cat="">All</button>
      ${categories.map(cat => `
        <button type="button" class="gallery-filter-chip" data-cat="${escapeAttribute(cat)}">${escapeHTML(cat)}</button>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="gallery-wrapper" id="${instanceId}">
      ${filterChipsHtml}
      <div class="gallery-grid ${isMasonry ? 'layout-masonry' : 'layout-grid'}">
        ${config.items.map((item, idx) => {
          const safeSrc = sanitizeURL(item.content, { allowRelative: true, allowDataImage: true });
          return `
          <button type="button" class="gallery-item-card" data-cat="${escapeAttribute(item.category || '')}" data-img="${escapeAttribute(safeSrc)}" data-caption="${escapeAttribute(richTextToPlain(item.caption) || richTextToPlain(item.title) || `Image ${idx + 1}`)}" data-alt="${item.decorative ? '' : escapeAttribute(item.altText || '')}" aria-haspopup="dialog" aria-controls="${instanceId}-gallery-lightbox" aria-label="Open image: ${escapeAttribute(richTextToPlain(item.title) || `Image ${idx + 1}`)}">
            <img src="${escapeAttribute(safeSrc)}" alt="${item.decorative ? '' : escapeAttribute(item.altText || '')}" ${item.decorative ? 'aria-hidden="true"' : ''} style="object-fit:${item.imageFit === 'contain' ? 'contain' : 'cover'};">
            <div class="gallery-caption-overlay">
              ${item.category ? `<span class="gallery-cat-tag">${richInline(item.category)}</span>` : ''}
              <span>${richInline(item.title, 'View Layout')}</span>
            </div>
          </button>
        `;
        }).join('')}
      </div>

      <div id="${instanceId}-gallery-lightbox" class="lightbox-overlay" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-lightbox-expanded-caption" tabindex="-1" style="display:none;">
        <div class="lightbox-top-toolbar">
          <div class="lightbox-zoom-controls">
            <button type="button" class="lightbox-zoom-btn" id="${instanceId}-zoom-in" aria-label="Zoom in">+</button>
            <span class="lightbox-zoom-level" id="${instanceId}-zoom-lvl">100%</span>
            <button type="button" class="lightbox-zoom-btn" id="${instanceId}-zoom-out" aria-label="Zoom out">&minus;</button>
            <button type="button" class="lightbox-zoom-btn" id="${instanceId}-zoom-reset" aria-label="Reset zoom">Reset</button>
          </div>
          <button type="button" class="lightbox-close" aria-label="Close image dialog">${getAttIconSvg('close', { className: 'lightbox-close-icon', width: 20, height: 20, ariaHidden: true })}</button>
        </div>
        <div class="lightbox-img-stage" id="${instanceId}-lightbox-stage">
          <!-- No src attribute (not src=""): JS sets it from the clicked card's data-img when the
               lightbox opens. An empty src, unlike a missing one, reads to the course export gate
               as a broken/dropped media reference (js/dashboard/project-export.js). -->
          <img class="lightbox-img" id="${instanceId}-lightbox-expanded-img" alt="Lightbox image">
        </div>
        <div class="lightbox-caption" id="${instanceId}-lightbox-expanded-caption">Caption details</div>
      </div>
    </div>
  `;
}

export function generateCSS() {
  return `
    .gallery-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
    }
    .gallery-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2, 8px);
    }
    .gallery-filter-chip {
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
    .gallery-filter-chip.active {
      border-color: var(--primary);
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .gallery-grid.layout-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--att-space-4, 16px);
    }
    .gallery-grid.layout-masonry {
      column-count: 3;
      column-gap: var(--att-space-4, 16px);
    }
    @media (max-width: 600px) {
      .gallery-grid.layout-masonry {
        column-count: 1;
      }
    }
    .gallery-item-card {
      position: relative;
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      border: var(--border-style);
      box-shadow: var(--shadow-style);
      overflow: hidden;
      cursor: pointer;
      aspect-ratio: 4/3;
      padding: 0;
      font: inherit;
      background: var(--bg-card);
      color: inherit;
      min-height: 44px;
      min-width: 44px;
      transition: transform var(--att-dur-base, 0.2s) ease;
    }
    .layout-masonry .gallery-item-card {
      display: inline-block;
      width: 100%;
      margin-bottom: var(--att-space-4, 16px);
      aspect-ratio: auto;
    }
    .gallery-item-card[hidden] {
      display: none;
    }
    .gallery-item-card:active {
      transform: scale(0.98);
    }
    .gallery-item-card:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .gallery-item-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .gallery-caption-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: var(--text-main);
      padding: 10px 12px;
      color: var(--bg-card);
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      line-height: var(--att-lh-body, 1.5);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .gallery-cat-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent);
    }
    .lightbox-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--att-scrim, rgba(0, 0, 0, 0.85));
      z-index: 200;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .lightbox-top-toolbar {
      position: absolute;
      top: 16px;
      left: 20px;
      right: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 210;
    }
    .lightbox-zoom-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0,0,0,0.6);
      padding: 4px 10px;
      border-radius: var(--att-radius-pill, 999px);
    }
    .lightbox-zoom-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .lightbox-zoom-level {
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      min-width: 40px;
      text-align: center;
    }
    .lightbox-img-stage {
      max-width: 90%;
      max-height: 75vh;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 75vh;
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--att-shadow-2, 0 10px 15px -3px rgba(0,0,0,0.1));
      transition: transform 0.2s ease;
      cursor: grab;
    }
    .lightbox-caption {
      color: var(--bg-card);
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      margin-top: 16px;
      text-align: center;
      max-width: 70ch;
    }
    .lightbox-close {
      color: var(--bg-card);
      font-size: 32px;
      cursor: pointer;
      background: none;
      border: none;
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform var(--att-dur-base, 0.2s) ease;
    }
    .lightbox-close:active {
      transform: scale(0.98);
    }
    .lightbox-close:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }`;
}

export function generateJS(config, instanceId) {
  return `
    var galleryReturnFocus = null;
    var galleryCurrentIndex = 0;
    var galleryCards = [];
    var galleryZoomScale = 1.0;

    function applyZoom(scale) {
      galleryZoomScale = Math.max(0.5, Math.min(3.0, scale));
      var img = document.getElementById('${instanceId}-lightbox-expanded-img');
      var lvl = document.getElementById('${instanceId}-zoom-lvl');
      if (img) img.style.transform = 'scale(' + galleryZoomScale + ')';
      if (lvl) lvl.textContent = Math.round(galleryZoomScale * 100) + '%';
    }

    function showGalleryIndex(index) {
      var lightbox = document.getElementById('${instanceId}-gallery-lightbox');
      var img = document.getElementById('${instanceId}-lightbox-expanded-img');
      var caption = document.getElementById('${instanceId}-lightbox-expanded-caption');
      var card = galleryCards[index];
      if (!lightbox || !img || !caption || !card) return;

      galleryCurrentIndex = index;
      img.src = card.getAttribute('data-img');
      img.alt = card.getAttribute('data-alt') || '';
      caption.textContent = card.getAttribute('data-caption') || ('Image ' + (index + 1));
      applyZoom(1.0);

      viewedItems.add(index);
      updateProgress();
    }

    function openGalleryLightbox(index, src, trigger) {
      var lightbox = document.getElementById('${instanceId}-gallery-lightbox');
      lightbox.style.display = 'flex';
      galleryReturnFocus = trigger || document.activeElement;
      showGalleryIndex(index);
      lightbox.focus();
    }

    function closeGalleryLightbox() {
      var lightbox = document.getElementById('${instanceId}-gallery-lightbox');
      if (!lightbox || lightbox.style.display === 'none') return;
      lightbox.style.display = 'none';
      if (galleryReturnFocus) galleryReturnFocus.focus();
    }

    function initComponent() {
      var container = document.getElementById('${instanceId}') || document;
      galleryCards = Array.prototype.slice.call(container.querySelectorAll('.gallery-item-card'));
      galleryCards.forEach(function(card, idx) {
        card.addEventListener('click', function() {
          openGalleryLightbox(idx, card.getAttribute('data-img'), card);
        });
      });

      var lightbox = document.getElementById('${instanceId}-gallery-lightbox');
      var lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;
      if (lightboxClose) lightboxClose.addEventListener('click', closeGalleryLightbox);

      var zoomIn = document.getElementById('${instanceId}-zoom-in');
      var zoomOut = document.getElementById('${instanceId}-zoom-out');
      var zoomReset = document.getElementById('${instanceId}-zoom-reset');
      if (zoomIn) zoomIn.addEventListener('click', function() { applyZoom(galleryZoomScale + 0.25); });
      if (zoomOut) zoomOut.addEventListener('click', function() { applyZoom(galleryZoomScale - 0.25); });
      if (zoomReset) zoomReset.addEventListener('click', function() { applyZoom(1.0); });

      // Filter chips
      container.querySelectorAll('.gallery-filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          container.querySelectorAll('.gallery-filter-chip').forEach(function(c) { c.classList.remove('active'); });
          chip.classList.add('active');
          var selectedCat = chip.getAttribute('data-cat') || '';
          container.querySelectorAll('.gallery-item-card').forEach(function(card) {
            var cat = card.getAttribute('data-cat') || '';
            card.hidden = (selectedCat !== '' && cat !== selectedCat);
          });
        });
      });

      if (lightbox) {
        lightbox.addEventListener('click', function(event) {
          if (event.target === lightbox || event.target.id === '${instanceId}-lightbox-stage') closeGalleryLightbox();
        });
        lightbox.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeGalleryLightbox();
          }
          if (event.key === 'ArrowRight' && galleryCards.length > 1) {
            event.preventDefault();
            showGalleryIndex((galleryCurrentIndex + 1) % galleryCards.length);
          }
          if (event.key === 'ArrowLeft' && galleryCards.length > 1) {
            event.preventDefault();
            showGalleryIndex((galleryCurrentIndex - 1 + galleryCards.length) % galleryCards.length);
          }
          if (event.key === '+' || event.key === '=') {
            applyZoom(galleryZoomScale + 0.25);
          }
          if (event.key === '-') {
            applyZoom(galleryZoomScale - 0.25);
          }
          if (event.key === '0') {
            applyZoom(1.0);
          }
        });
      }
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one gallery image.'];
  return { valid: errors.length === 0, errors };
}

