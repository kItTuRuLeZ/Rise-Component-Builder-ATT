import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeURL, richInline, isRichTextEmpty } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'button-list';
export const name = 'Quick Link Buttons';
export const category = 'navigation';
export const defaultConfig = {
  searchable: false,
  items: [
    { title: 'Launch Resource Hub', content: 'https://community.articulate.com', category: 'Portals', fileType: '', fileSize: '', styleVariant: 'primary' },
    { title: 'Download User Manual', content: 'https://github.com', category: 'Documentation', fileType: 'PDF', fileSize: '2.4 MB', styleVariant: 'secondary' }
  ]
};
export const editorSchema = getEditorSchema(id);

const openNewIcon = getAttIconSvg('open-new', { width: 14, height: 14, ariaHidden: true });
const downloadIcon = getAttIconSvg('download', { width: 14, height: 14, ariaHidden: true });
const searchIcon = getAttIconSvg('search', { width: 14, height: 14, ariaHidden: true });

function renderButton(item, idx) {
  const url = sanitizeURL(item.content, { allowRelative: true }) || '#';
  const isDownload = !isRichTextEmpty(item.fileType) || !isRichTextEmpty(item.fileSize);
  const icon = isDownload ? downloadIcon : openNewIcon;
  const variant = ['secondary', 'outline'].includes(item.styleVariant) ? item.styleVariant : 'primary';
  const categoryAttr = item.category ? ` data-category="${escapeAttribute(item.category)}"` : '';

  const metaPills = isDownload ? `
    <span class="btn-meta-pills">
      ${!isRichTextEmpty(item.fileType) ? `<span class="btn-meta-pill file-type">${richInline(item.fileType)}</span>` : ''}
      ${!isRichTextEmpty(item.fileSize) ? `<span class="btn-meta-pill file-size">${richInline(item.fileSize)}</span>` : ''}
    </span>
  ` : '';

  return `
    <a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer" class="link-button-item${variant !== 'primary' ? ` variant-${variant}` : ''}" data-idx="${idx}"${categoryAttr}>
      <span class="btn-label-wrap">
        <span class="btn-title">${richInline(item.title, 'Launch Link')}</span>
        ${metaPills}
      </span>
      <span class="btn-icon-wrap" aria-hidden="true">${icon}</span>
    </a>
  `;
}

export function generateHTML(config, instanceId) {
  const searchable = config.searchable === true;
  const items = Array.isArray(config.items) ? config.items : [];
  
  // Check if items have categories
  const categories = [...new Set(items.map(it => (it.category || '').trim()).filter(Boolean))];
  const hasCategories = categories.length > 0;

  const searchBox = searchable ? `
    <div class="button-list-search-wrap">
      <div class="button-list-search-input-wrap">
        <span class="search-icon-slot" aria-hidden="true">${searchIcon}</span>
        <input type="search" class="button-list-search-input" id="${instanceId}-search" placeholder="Search links & resources..." aria-label="Search resources">
      </div>
      <p class="search-status-text sr-only" id="${instanceId}-search-status" role="status" aria-live="polite"></p>
    </div>
  ` : '';

  let buttonsContent = '';
  if (hasCategories) {
    buttonsContent = categories.map(cat => {
      const catItems = items.map((it, idx) => ({ it, idx })).filter(entry => (entry.it.category || '').trim() === cat);
      return `
        <div class="button-group-section" data-group-category="${escapeAttribute(cat)}">
          <h4 class="button-group-title">${escapeHTML(cat)}</h4>
          <div class="buttons-container">
            ${catItems.map(entry => renderButton(entry.it, entry.idx)).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Handle uncategorized items if any
    const uncategorized = items.map((it, idx) => ({ it, idx })).filter(entry => !(entry.it.category || '').trim());
    if (uncategorized.length) {
      buttonsContent += `
        <div class="button-group-section" data-group-category="General">
          <h4 class="button-group-title">Other Resources</h4>
          <div class="buttons-container">
            ${uncategorized.map(entry => renderButton(entry.it, entry.idx)).join('')}
          </div>
        </div>
      `;
    }
  } else {
    buttonsContent = `
      <div class="buttons-container">
        ${items.map((it, idx) => renderButton(it, idx)).join('')}
      </div>
    `;
  }

  return `
    <div class="button-list-wrapper" id="${instanceId}-wrapper">
      ${searchBox}
      <div class="button-list-content" id="${instanceId}-content">
        ${buttonsContent}
      </div>
      ${searchable ? `<p class="button-list-no-results" id="${instanceId}-no-results" style="display:none;">No matching resources found.</p>` : ''}
    </div>
  `;
}

export function generateCSS() {
  return `
    .button-list-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 16px);
      width: 100%;
    }
    .button-list-search-wrap {
      width: 100%;
      max-width: 420px;
    }
    .button-list-search-input-wrap {
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
    .button-list-search-input {
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
    .button-list-search-input:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
      border-color: var(--primary);
    }
    .button-group-section {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2, 8px);
      margin-bottom: var(--att-space-3, 12px);
    }
    .button-group-title {
      font-size: var(--att-fs-body-sm, 14px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin: 0 0 4px 4px;
    }
    .buttons-container {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-3, 12px);
      justify-content: flex-start;
    }
    .link-button-item {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--att-space-3, 10px);
      padding: 10px 20px;
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      box-shadow: var(--shadow-style);
      font-size: var(--att-fs-body, 1rem);
      font-weight: var(--att-fw-bold, 700);
      min-height: 44px;
      box-sizing: border-box;
      transition: all var(--animation-speed);
      text-decoration: none;
      cursor: pointer;
    }
    .link-button-item.variant-primary {
      background-color: var(--primary);
      color: var(--on-primary);
      border: 1px solid var(--primary);
    }
    .link-button-item.variant-primary:hover {
      background-color: var(--primary-hover);
      border-color: var(--primary-hover);
      box-shadow: var(--att-shadow-2);
    }
    .link-button-item.variant-secondary {
      background-color: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .link-button-item.variant-secondary:hover {
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: var(--att-shadow-2);
    }
    .link-button-item.variant-outline {
      background-color: transparent;
      color: var(--primary);
      border: 1.5px solid var(--primary);
    }
    .link-button-item.variant-outline:hover {
      background-color: var(--primary);
      color: var(--on-primary);
    }
    .link-button-item:active {
      transform: scale(0.98);
    }
    .link-button-item:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .btn-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-meta-pills {
      display: inline-flex;
      gap: 4px;
    }
    .btn-meta-pill {
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 6px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: rgba(255, 255, 255, 0.25);
      color: inherit;
    }
    .link-button-item.variant-secondary .btn-meta-pill,
    .link-button-item.variant-outline .btn-meta-pill {
      background-color: var(--bg-body, #F3F4F5);
      color: var(--text-main);
    }
    .btn-icon-wrap {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    .button-list-no-results {
      font-size: var(--att-fs-body, 14px);
      color: var(--text-muted);
      font-style: italic;
      padding: 8px 0;
    }`;
}

export function generateJS(config, instanceId) {
  const searchable = config.searchable === true;
  return `
    function trackLinkClick(index) {
      viewedItems.add(index);
      updateProgress();
    }

    function initComponent() {
      document.querySelectorAll('.link-button-item').forEach(function(link) {
        link.addEventListener('click', function() {
          trackLinkClick(parseInt(link.getAttribute('data-idx'), 10));
        });
      });

      ${searchable ? `
      var searchInput = document.getElementById('${instanceId}-search');
      var statusText = document.getElementById('${instanceId}-search-status');
      var noResults = document.getElementById('${instanceId}-no-results');

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var query = searchInput.value.toLowerCase().trim();
          var visibleCount = 0;

          document.querySelectorAll('.link-button-item').forEach(function(btn) {
            var title = (btn.querySelector('.btn-title') ? btn.querySelector('.btn-title').textContent : '').toLowerCase();
            var category = (btn.getAttribute('data-category') || '').toLowerCase();
            var matches = !query || title.indexOf(query) !== -1 || category.indexOf(query) !== -1;
            btn.style.display = matches ? 'inline-flex' : 'none';
            if (matches) visibleCount++;
          });

          document.querySelectorAll('.button-group-section').forEach(function(section) {
            var visibleInGroup = section.querySelectorAll('.link-button-item:not([style*="display: none"])').length;
            section.style.display = visibleInGroup > 0 ? 'flex' : 'none';
          });

          if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';
          if (statusText) statusText.textContent = visibleCount + ' link' + (visibleCount === 1 ? '' : 's') + ' available';
        });
      }` : ''}
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one link button.'];
  return { valid: errors.length === 0, errors };
}
