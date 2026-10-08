import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, sanitizeCSSColor, sanitizeRichText, richInline, isRichTextEmpty } from '../js/utilities.js';

export const id = 'info-grid';
export const name = 'Multi-Column Info Grid';
export const category = 'cards';
export const defaultConfig = {
  items: [
    {
      title: 'SaaS Aesthetic',
      subtitle: 'Design Standard',
      badgeLabel: 'Modern',
      metricValue: '99.9%',
      metricLabel: 'Learner Engagement',
      content: 'Vibrant custom colors, layered shadows, and large margins.'
    },
    {
      title: 'Fully Serverless',
      subtitle: 'Architecture',
      badgeLabel: 'Fast',
      metricValue: '< 50ms',
      metricLabel: 'Render Latency',
      content: 'Direct srcdoc codes containing styles and scripts.'
    },
    {
      title: 'Responsive Shell',
      subtitle: 'Layout Engine',
      badgeLabel: 'Adaptive',
      metricValue: '100%',
      metricLabel: 'Mobile Compatible',
      content: 'Adaptive grid layout structures for all target screens.'
    }
  ]
};
export const editorSchema = getEditorSchema(id);

function renderCustomItemArtwork(item, fallbackMarkup = '') {
  if (!item?.iconImage) return fallbackMarkup;
  const decorative = item.iconDecorative !== false;
  const fit = item.iconFit === 'cover' ? 'cover' : 'contain';
  return `<img class="custom-item-icon" src="${escapeAttribute(item.iconImage)}" alt="${decorative ? '' : escapeAttribute(item.iconAltText || '')}" ${decorative ? 'aria-hidden="true"' : ''} style="object-fit:${fit};">`;
}

export function generateHTML(config) {
  return `
    <div class="info-grid-container">
      ${config.items.map((item) => {
        const accentColor = item.accentColor ? sanitizeCSSColor(item.accentColor, '') : '';
        const badgeHtml = !isRichTextEmpty(item.badgeLabel) ? `<span class="info-grid-badge">${richInline(item.badgeLabel)}</span>` : '';
        const subtitleHtml = !isRichTextEmpty(item.subtitle) ? `<span class="info-grid-subtitle">${richInline(item.subtitle)}</span>` : '';
        const metricHtml = !isRichTextEmpty(item.metricValue) ? `
          <div class="info-grid-metric-box">
            <span class="info-grid-metric-val">${richInline(item.metricValue)}</span>
            ${!isRichTextEmpty(item.metricLabel) ? `<span class="info-grid-metric-lbl">${richInline(item.metricLabel)}</span>` : ''}
          </div>
        ` : '';

        return `
        <div class="info-grid-item">
          <div class="info-grid-header-row">
            <div class="info-grid-icon" style="${accentColor ? `color:${accentColor};` : ''}">
              ${renderCustomItemArtwork(item, '<svg width="20" height="20" viewBox="0 0 96 96" fill="currentColor" aria-hidden="true"><g class="info-grid-icon-accent-dots"><rect x="30" y="43" width="4" height="4"/><rect x="30" y="56" width="4" height="4"/><rect x="30" y="69" width="4" height="4"/></g><g><rect x="37" y="44" width="29" height="2"/><rect x="37" y="57" width="29" height="2"/><rect x="37" y="70" width="29" height="2"/><path d="M56.4 10 24 10C20.7 10 18 12.7 18 16L18 80C18 83.3 20.7 86 24 86L72 86C75.3 86 78 83.3 78 80L78 31.6 56.4 10ZM57 13.4 74.6 31 61 31C58.8 31 57 29.2 57 27L57 13.4ZM72 84 24 84C21.8 84 20 82.2 20 80L20 16C20 13.8 21.8 12 24 12L55 12 55 27C55 30.3 57.7 33 61 33L76 33 76 80C76 82.2 74.2 84 72 84Z"/></g></svg>')}
            </div>
            ${badgeHtml}
          </div>
          ${subtitleHtml}
          <h4>${richInline(item.title, 'Feature Key')}</h4>
          ${metricHtml}
          <p>${sanitizeRichText(item.content || 'Description layout parameters.')}</p>
        </div>
      `;
      }).join('')}
    </div>
  `;
}

export function generateCSS() {
  return `
    .info-grid-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--att-space-5, 20px);
    }
    .info-grid-item {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 20px);
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
    }
    .info-grid-item:hover {
      border-color: var(--primary);
      box-shadow: var(--att-shadow-2, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    }
    .info-grid-item:active {
      transform: scale(0.98);
    }
    .info-grid-item:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .info-grid-item.active {
      border-color: var(--primary);
      border-width: 2px;
    }
    .info-grid-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--att-space-3, 10px);
    }
    .info-grid-icon {
      color: var(--accent);
    }
    .info-grid-icon-accent-dots {
      fill: var(--accent);
    }
    .info-grid-icon .custom-item-icon {
      width: 42px;
      height: 42px;
      border-radius: var(--att-radius-sm, 8px);
    }
    .info-grid-badge {
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      background-color: var(--border-color);
      color: var(--text-main);
    }
    .info-grid-subtitle {
      font-size: var(--att-fs-eyebrow, 12px);
      font-weight: 700;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-grid-item h4 {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      margin-bottom: 6px;
      color: var(--text-main);
      text-wrap: pretty;
    }
    .info-grid-metric-box {
      margin: 6px 0 10px 0;
      padding: 6px 10px;
      background-color: var(--bg-body);
      border-radius: var(--att-radius-md, 6px);
      display: inline-flex;
      flex-direction: column;
      align-self: flex-start;
    }
    .info-grid-metric-val {
      font-size: var(--att-fs-h3, 1.25rem);
      font-weight: 800;
      color: var(--primary);
      line-height: 1.1;
    }
    .info-grid-metric-lbl {
      font-size: var(--att-fs-eyebrow, 11px);
      color: var(--text-muted);
      font-weight: 600;
    }
    .info-grid-item p {
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-muted);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
      margin: 0;
    }`;
}

export function generateJS() {
  return `
    function initComponent() {
      document.querySelectorAll('.info-grid-item').forEach(function(card, idx) {
        card.setAttribute('tabindex', '0');
        card.addEventListener('click', function() {
          card.classList.toggle('active');
          viewedItems.add(idx);
          updateProgress();
        });
      });
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one info card.'];
  return { valid: errors.length === 0, errors };
}

