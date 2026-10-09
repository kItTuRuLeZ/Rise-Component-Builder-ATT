import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeRichText, richInline, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'menu-list';
export const name = 'Secondary Menu Drawer';
export const category = 'navigation';
export const defaultConfig = {
  searchable: false,
  indexingMode: 'none',
  showQuickJump: false,
  items: [
    { title: 'Module 1: Getting Started', content: 'Introduction and setup basics for modern AT&T enterprise interfaces.', category: 'Fundamentals', badge: 'Core' },
    { title: 'Module 2: Advanced Design', content: 'Explore layouts, responsive grids, shadows, and WCAG spacing tokens.', category: 'Architecture', badge: 'Design' },
    { title: 'Module 3: Code Exporting', content: 'Embedding components inside Articulate Rise SCORM packages and web packages.', category: 'Deployment', badge: 'SCORM' }
  ]
};
export const editorSchema = getEditorSchema(id);

const chevronDownIcon = getAttIconSvg('chevron-down', { className: 'menu-arrow', width: 16, height: 16, ariaHidden: true });
const searchIcon = getAttIconSvg('search', { width: 14, height: 14, ariaHidden: true });

export function generateHTML(config, instanceId) {
  const searchable = config.searchable === true;
  const indexingMode = ['alphabetical', 'category'].includes(config.indexingMode) ? config.indexingMode : 'none';
  const showQuickJump = config.showQuickJump === true || indexingMode !== 'none';
  const items = Array.isArray(config.items) ? config.items : [];

  let quickJumpNav = '';
  if (showQuickJump) {
    if (indexingMode === 'category') {
      const categories = [...new Set(items.map(it => (it.category || '').trim()).filter(Boolean))];
      if (categories.length > 1) {
        quickJumpNav = `
          <div class="menu-quickjump-bar" role="group" aria-label="Jump to category">
            <span class="quickjump-label">Filter:</span>
            <button type="button" class="quickjump-chip active" data-filter-cat="all">All</button>
            ${categories.map(cat => `<button type="button" class="quickjump-chip" data-filter-cat="${escapeAttribute(cat)}">${escapeHTML(cat)}</button>`).join('')}
          </div>
        `;
      }
    } else {
      // Alphabetical index
      const letters = [...new Set(items.map(it => (it.title || 'A').trim().charAt(0).toUpperCase()))].sort();
      if (letters.length > 1) {
        quickJumpNav = `
          <div class="menu-quickjump-bar" role="group" aria-label="Jump to letter">
            <span class="quickjump-label">Index:</span>
            <button type="button" class="quickjump-chip active" data-filter-letter="all">All</button>
            ${letters.map(l => `<button type="button" class="quickjump-chip" data-filter-letter="${escapeAttribute(l)}">${escapeHTML(l)}</button>`).join('')}
          </div>
        `;
      }
    }
  }

  const searchBox = searchable ? `
    <div class="menu-search-wrap">
      <div class="menu-search-input-wrap">
        <span class="search-icon-slot" aria-hidden="true">${searchIcon}</span>
        <input type="search" class="menu-search-input" id="${instanceId}-search" placeholder="Search reference topics..." aria-label="Search topics and glossary">
      </div>
      <p class="search-status-text sr-only" id="${instanceId}-search-status" role="status" aria-live="polite"></p>
    </div>
  ` : '';

  return `
    <div class="menu-explorer-container" id="${instanceId}-container">
      ${searchBox}
      ${quickJumpNav}
      <div class="menu-drawer-list" id="${instanceId}-list">
        ${items.map((item, idx) => {
          const cat = richTextToPlain(item.category);
          const badge = richTextToPlain(item.badge);
          const letter = (item.title || 'A').trim().charAt(0).toUpperCase();
          const numLabel = idx < 9 ? `0${idx + 1}` : `${idx + 1}`;
          return `
            <div class="menu-drawer-item" data-idx="${idx}" data-category="${escapeAttribute(cat)}" data-letter="${escapeAttribute(letter)}" id="${instanceId}-item-${idx}">
              <div class="menu-item-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="${instanceId}-desc-${idx}" id="${instanceId}-summary-${idx}">
                <div class="menu-item-left">
                  <span class="menu-num">${numLabel}</span>
                  <div class="menu-title-wrap">
                    <span class="menu-title">${richInline(item.title, 'Lesson segment')}</span>
                    ${badge ? `<span class="menu-badge">${escapeHTML(badge)}</span>` : ''}
                    ${cat ? `<span class="menu-category-tag">${escapeHTML(cat)}</span>` : ''}
                  </div>
                </div>
                ${chevronDownIcon}
              </div>
              <div class="menu-item-desc" id="${instanceId}-desc-${idx}" role="region" aria-labelledby="${instanceId}-summary-${idx}" hidden>
                <div class="menu-item-desc-inner">
                  ${sanitizeRichText(item.content || 'Description content details...')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${searchable ? `<p class="menu-no-results" id="${instanceId}-no-results" style="display:none;">No matching reference items found.</p>` : ''}
    </div>
  `;
}

export function generateCSS() {
  return `
    .menu-explorer-container {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      width: 100%;
    }
    .menu-search-wrap {
      width: 100%;
      max-width: 440px;
    }
    .menu-search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-icon-slot {
      position: absolute;
      left: 14px;
      color: var(--text-muted);
      pointer-events: none;
      display: inline-flex;
    }
    .menu-search-input {
      width: 100%;
      padding: 10px 14px 10px 38px;
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--bg-card);
      color: var(--text-main);
      font-size: var(--att-fs-body-sm, 14px);
      font-family: var(--font-family, inherit);
      min-height: 44px;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }
    .menu-search-input:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
      border-color: var(--primary);
    }
    .menu-quickjump-bar {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      flex-wrap: wrap;
      padding-bottom: 4px;
    }
    .quickjump-label {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      letter-spacing: normal;
      color: var(--text-muted);
    }
    .quickjump-chip {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--att-radius-pill, 999px);
      padding: 4px 12px;
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 600;
      color: var(--text-main);
      cursor: pointer;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .quickjump-chip:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .quickjump-chip.active {
      background-color: var(--primary);
      border-color: var(--primary);
      color: var(--on-primary);
    }
    .quickjump-chip:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .menu-drawer-list {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }
    .menu-drawer-item {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      overflow: hidden;
      transition: all 0.2s;
    }
    .menu-drawer-item:hover {
      box-shadow: var(--att-shadow-2, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    }
    .menu-drawer-item.active {
      border-color: var(--att-blue, var(--primary));
      border-left: 4px solid var(--att-blue, var(--primary));
    }
    .menu-item-summary {
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 44px;
      box-sizing: border-box;
      cursor: pointer;
      user-select: none;
    }
    .menu-item-summary:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: -2px;
    }
    .menu-item-left {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 14px);
      flex: 1;
    }
    .menu-num {
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--primary);
      flex-shrink: 0;
    }
    .menu-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      flex-wrap: wrap;
    }
    .menu-title {
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      text-wrap: pretty;
    }
    .menu-badge {
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 700;
      letter-spacing: normal;
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .menu-category-tag {
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-muted);
      border: 1px solid var(--border-color);
    }
    .menu-arrow {
      color: var(--primary);
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .menu-drawer-item.active .menu-arrow {
      transform: rotate(180deg);
    }
    .menu-item-desc {
      background-color: var(--att-grey-1, #F3F4F5);
      border-top: 1px solid var(--border-color);
    }
    .menu-item-desc-inner {
      padding: var(--att-space-4, 16px) var(--att-space-5, 24px) var(--att-space-4, 16px) 52px;
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--text-muted);
      max-width: 70ch;
    }
    .menu-no-results {
      font-size: var(--att-fs-body, 14px);
      color: var(--text-muted);
      font-style: italic;
      padding: 8px 0;
    }`;
}

export function generateJS(config, instanceId) {
  const searchable = config.searchable === true;
  return `
    function toggleMenuDrawer(index, item) {
      var summary = item.querySelector('.menu-item-summary');
      var desc = item.querySelector('.menu-item-desc');
      var isCurrentlyActive = item.classList.contains('active');

      document.querySelectorAll('.menu-drawer-item').forEach(function(el) {
        el.classList.remove('active');
        var s = el.querySelector('.menu-item-summary');
        var d = el.querySelector('.menu-item-desc');
        if (s) s.setAttribute('aria-expanded', 'false');
        if (d) d.hidden = true;
      });

      if (!isCurrentlyActive) {
        item.classList.add('active');
        if (summary) summary.setAttribute('aria-expanded', 'true');
        if (desc) desc.hidden = false;
        viewedItems.add(index);
        updateProgress();
      }
    }

    function initComponent() {
      document.querySelectorAll('.menu-drawer-item').forEach(function(item) {
        var summary = item.querySelector('.menu-item-summary');
        if (summary) {
          summary.addEventListener('click', function() {
            toggleMenuDrawer(parseInt(item.getAttribute('data-idx'), 10), item);
          });
          summary.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleMenuDrawer(parseInt(item.getAttribute('data-idx'), 10), item);
            }
          });
        }
      });

      ${searchable ? `
      var searchInput = document.getElementById('${instanceId}-search');
      var statusText = document.getElementById('${instanceId}-search-status');
      var noResults = document.getElementById('${instanceId}-no-results');

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var query = searchInput.value.toLowerCase().trim();
          var visibleCount = 0;

          document.querySelectorAll('.menu-drawer-item').forEach(function(item) {
            var title = (item.querySelector('.menu-title') ? item.querySelector('.menu-title').textContent : '').toLowerCase();
            var desc = (item.querySelector('.menu-item-desc') ? item.querySelector('.menu-item-desc').textContent : '').toLowerCase();
            var cat = (item.getAttribute('data-category') || '').toLowerCase();
            var matches = !query || title.indexOf(query) !== -1 || desc.indexOf(query) !== -1 || cat.indexOf(query) !== -1;
            item.style.display = matches ? 'block' : 'none';
            if (matches) visibleCount++;
          });

          if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';
          if (statusText) statusText.textContent = visibleCount + ' topic' + (visibleCount === 1 ? '' : 's') + ' available';
        });
      }` : ''}

      document.querySelectorAll('.quickjump-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          document.querySelectorAll('.quickjump-chip').forEach(function(c) { c.classList.remove('active'); });
          chip.classList.add('active');

          var catFilter = chip.getAttribute('data-filter-cat');
          var letterFilter = chip.getAttribute('data-filter-letter');

          document.querySelectorAll('.menu-drawer-item').forEach(function(item) {
            var match = true;
            if (catFilter && catFilter !== 'all') {
              match = (item.getAttribute('data-category') || '') === catFilter;
            } else if (letterFilter && letterFilter !== 'all') {
              match = (item.getAttribute('data-letter') || '') === letterFilter;
            }
            item.style.display = match ? 'block' : 'none';
          });
        });
      });
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one menu item.'];
  return { valid: errors.length === 0, errors };
}
