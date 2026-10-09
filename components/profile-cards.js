import { getEditorSchema } from '../js/editor-schemas.js';
import { escapeAttribute, escapeHTML, sanitizeRichText, richInline, isRichTextEmpty, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'profile-cards';
export const name = 'Modern Profile Grid';
export const category = 'cards';
export const defaultConfig = {
  profileEnableModal: true,
  items: [
    {
      title: 'Sarah Jenkins',
      roleTag: 'Lead Instructional Designer',
      content: 'Dedicated to creating engaging eLearning pathways.',
      quote: 'Empowering learners through human-centered digital experiences.',
      contactUrl: 'mailto:sjenkins@example.com',
      contactLabel: 'Contact Sarah'
    },
    {
      title: 'Marcus Chen',
      roleTag: 'UX Systems Engineer',
      content: 'Expert in web layout rendering and responsive CSS frameworks.',
      quote: 'Clean architecture builds accessible futures.',
      contactUrl: 'https://linkedin.com',
      contactLabel: 'LinkedIn Profile'
    }
  ]
};
export const editorSchema = getEditorSchema(id);

export function generateHTML(config, instanceId) {
  const enableModal = config.profileEnableModal !== false;
  const interactive = enableModal || config.trackCompletion === true;
  const cardClass = `profile-card-item${enableModal ? ' has-modal' : ''}${interactive ? '' : ' is-static'}`;

  return `
    <div class="profiles-grid" id="${instanceId}">
      ${config.items.map((item, idx) => {
        const roleHtml = !isRichTextEmpty(item.roleTag) ? `<span class="profile-role-badge">${richInline(item.roleTag)}</span>` : '';
        const quoteHtml = (item.quote || '').trim() ? `<blockquote class="profile-pull-quote">&ldquo;${escapeHTML(item.quote)}&rdquo;</blockquote>` : '';
        const contactHtml = !isRichTextEmpty(item.contactUrl) ? `
          <a href="${escapeAttribute(richTextToPlain(item.contactUrl))}" target="_blank" rel="noopener noreferrer" class="profile-contact-link" onclick="event.stopPropagation();">
            ${getAttIconSvg('open-new', { width: 14, height: 14, ariaHidden: true })} ${richInline(item.contactLabel, 'Connect')}
          </a>
        ` : '';

        return `
        <div class="${cardClass}" id="${instanceId}-card-${idx}" data-idx="${idx}"${interactive ? ' tabindex="0"' : ''} role="${enableModal ? 'button' : 'article'}" aria-haspopup="${enableModal ? 'dialog' : 'false'}" aria-label="Profile of ${escapeAttribute(richTextToPlain(item.title) || 'Expert')}">
          <div class="profile-avatar-circle ${item.imageCrop === 'square' ? 'square' : ''}">
            ${item.image ? `<img src="${escapeAttribute(item.image)}" alt="${item.decorative ? '' : escapeAttribute(item.altText || '')}" ${item.decorative ? 'aria-hidden="true"' : ''}>` : getAttIconSvg('person', { width: 24, height: 24, ariaHidden: true })}
          </div>
          <div class="profile-card-content">
            <div class="profile-header-meta">
              <h4>${richInline(item.title, 'Expert name')}</h4>
              ${roleHtml}
            </div>
            <div class="profile-card-bio">${sanitizeRichText(item.content || 'Professional background summary bio.')}</div>
            ${quoteHtml}
            <div class="profile-actions-row">
              ${contactHtml}
              ${enableModal ? `<span class="profile-view-bio-hint" aria-hidden="true">View full bio &rarr;</span>` : ''}
            </div>
          </div>
        </div>
      `;
      }).join('')}

      <!-- Modal Bio Drawer -->
      ${enableModal ? `
        <div class="profile-modal-backdrop" id="${instanceId}-modal" hidden role="dialog" aria-modal="true" aria-label="Profile bio detail">
          <div class="profile-modal-overlay"></div>
          <div class="profile-modal-drawer">
            <button type="button" class="profile-modal-close-btn" aria-label="Close bio">&times;</button>
            <div class="profile-modal-body" id="${instanceId}-modal-body"></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function generateCSS() {
  return `
    .profiles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--att-space-5, 20px);
      position: relative;
    }
    .profile-card-item {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-5, 20px);
      display: flex;
      gap: var(--att-space-4, 16px);
      align-items: flex-start;
      transition: all 0.2s ease;
    }
    /* Only a card that does something looks like a button. */
    .profile-card-item:not(.is-static) {
      cursor: pointer;
    }
    .profile-card-item:not(.is-static):hover {
      border-color: var(--primary);
      box-shadow: var(--att-shadow-2, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    }
    .profile-card-item:not(.is-static):active {
      transform: scale(0.98);
    }
    /* With the full bio one click away, the card shows a short summary rather than the whole bio. */
    .profile-card-item.has-modal .profile-card-bio {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
    }
    .profile-card-item:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .profile-card-item.active {
      border-color: var(--primary);
      box-shadow: var(--att-shadow-2, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    }
    .profile-avatar-circle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background-color: var(--border-color);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid var(--border-color);
      overflow: hidden;
    }
    .profile-avatar-circle.square { border-radius: var(--att-radius-sm, 8px); }
    .profile-avatar-circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .profile-card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .profile-header-meta h4 {
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      margin: 0 0 4px 0;
      color: var(--text-main);
      text-wrap: pretty;
    }
    .profile-role-badge {
      display: inline-block;
      font-size: var(--att-fs-eyebrow, 11px);
      font-weight: 700;
      color: var(--primary);
      background-color: rgba(0, 87, 184, 0.08);
      padding: 2px 8px;
      border-radius: var(--att-radius-pill, 999px);
      letter-spacing: normal;
    }
    .profile-card-content p,
    .profile-card-bio {
      font-size: var(--att-fs-body-sm, 0.875rem);
      color: var(--text-muted);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
      margin: 0;
    }
    .profile-pull-quote {
      margin: 6px 0 0 0;
      padding-left: 10px;
      border-left: 2px solid var(--accent);
      font-size: var(--att-fs-body-sm, 13px);
      font-style: italic;
      color: var(--text-main);
    }
    .profile-actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed var(--border-color);
    }
    .profile-contact-link {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .profile-contact-link:hover {
      text-decoration: underline;
    }
    .profile-view-bio-hint {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .profile-modal-backdrop {
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
    .profile-modal-backdrop[hidden] {
      display: none;
    }
    .profile-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
    }
    .profile-modal-drawer {
      position: relative;
      background: var(--bg-card);
      border-radius: var(--att-radius-lg, 16px);
      box-shadow: 0 12px 36px rgba(0,0,0,0.25);
      max-width: 540px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      padding: 24px;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    }
    .profile-modal-close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      background: var(--bg-body);
      border: 1px solid var(--border-color);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-main);
    }`;
}

export function generateJS(config, instanceId) {
  const itemsJson = JSON.stringify(config.items);
  const enableModal = config.profileEnableModal !== false;

  return `
    var profilePersonIcon = ${JSON.stringify(getAttIconSvg('person', { width: 34, height: 34, ariaHidden: true }))};
    var profileItems = ${itemsJson};

    function initComponent() {
      var container = document.getElementById('${instanceId}') || document;
      var modal = document.getElementById('${instanceId}-modal');
      var modalBody = document.getElementById('${instanceId}-modal-body');
      var lastFocus = null;

      function openModal(idx) {
        if (!${enableModal} || !modal || !modalBody) return;
        var p = profileItems[idx];
        if (!p) return;

        var avatarHtml = p.image
          ? '<img src="' + p.image + '" alt="' + (p.altText || '') + '" style="width:72px;height:72px;border-radius:' + (p.imageCrop === 'square' ? '8px' : '50%') + ';object-fit:cover;border:2px solid var(--primary);">'
          : '<div style="width:72px;height:72px;border-radius:50%;background:var(--border-color);display:flex;align-items:center;justify-content:center;color:var(--text-muted);">' + profilePersonIcon + '</div>';

        var role = p.roleTag ? '<span class="profile-role-badge">' + p.roleTag + '</span>' : '';
        var quote = p.quote ? '<blockquote class="profile-pull-quote" style="margin:12px 0;">&ldquo;' + p.quote + '&rdquo;</blockquote>' : '';
        var contact = p.contactUrl ? '<div style="margin-top:16px;"><a href="' + p.contactUrl + '" target="_blank" rel="noopener noreferrer" class="profile-contact-link">' + (p.contactLabel || 'Connect direct') + ' &rarr;</a></div>' : '';

        modalBody.innerHTML = '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;">' + avatarHtml + '<div><h3 style="margin:0 0 4px 0;font-size:1.25rem;">' + (p.title || 'Expert') + '</h3>' + role + '</div></div>' +
          '<div style="font-size:1rem;line-height:1.5;color:var(--text-muted);">' + (p.content || '') + '</div>' + quote + contact;

        modal.hidden = false;
        var closeBtn = modal.querySelector('.profile-modal-close-btn');
        if (closeBtn) closeBtn.focus();
      }

      function closeModal() {
        if (modal) {
          modal.hidden = true;
          if (lastFocus) lastFocus.focus();
        }
      }

      container.querySelectorAll('.profile-card-item:not(.is-static)').forEach(function(card) {
        var idx = parseInt(card.getAttribute('data-idx'), 10);
        card.addEventListener('click', function() {
          lastFocus = card;
          card.classList.add('active');
          viewedItems.add(idx);
          updateProgress();
          if (${enableModal}) openModal(idx);
        });
        card.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        });
      });

      if (modal) {
        var closeBtn = modal.querySelector('.profile-modal-close-btn');
        var overlay = modal.querySelector('.profile-modal-overlay');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        modal.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') closeModal();
        });
      }
    }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add at least one profile.'];
  return { valid: errors.length === 0, errors };
}

