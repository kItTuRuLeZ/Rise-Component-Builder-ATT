// @ts-nocheck
import { escapeAttribute, escapeHTML } from '../../utilities.js';
import { createRichTextEditor } from '../../rich-text-editor.js';

/**
 * Creates the interactive Help & Support authoring UI.
 * @param {any} config
 * @param {() => void} onUpdate
 * @returns {HTMLElement}
 */
export function createHelpEditor(config, onUpdate) {
  const container = document.createElement('div');
  container.className = 'ppt-tool-editor ppt-help-editor';

  const header = document.createElement('div');
  header.className = 'ppt-editor-header-bar';
  header.innerHTML = `
    <div class="ppt-editor-title-group">
      <h3>Help & Support Configuration</h3>
      <p class="field-hint">Provide course contact channels, support hours, and an accessible FAQ / troubleshooting guide.</p>
    </div>
  `;
  container.appendChild(header);

  // Section 1: Contact Details & Instructions
  const contactSection = document.createElement('div');
  contactSection.className = 'ppt-section-box';
  contactSection.innerHTML = `
    <h4 class="ppt-section-title">Support Channels & Instructions</h4>
    <div class="input-wrapper rte-wrapper-slot">
      <label>Welcome / Introductory Instructions</label>
      <div class="rte-intro-slot"></div>
    </div>

    <div class="ppt-form-grid">
      <div class="input-wrapper">
        <label>Support Email Address</label>
        <input type="email" class="input-help-email" value="${escapeAttribute(config.help.supportEmail || '')}" placeholder="support@company.com">
      </div>
      <div class="input-wrapper">
        <label>Support Phone / Hotline</label>
        <input type="tel" class="input-help-phone" value="${escapeAttribute(config.help.supportPhone || '')}" placeholder="1-800-555-0199">
      </div>
      <div class="input-wrapper">
        <label>Support Portal URL</label>
        <input type="url" class="input-help-portal-url" value="${escapeAttribute(config.help.supportPortalUrl || '')}" placeholder="https://helpdesk.company.com">
      </div>
      <div class="input-wrapper">
        <label>Support Portal Button Label</label>
        <input type="text" class="input-help-portal-label" value="${escapeAttribute(config.help.supportPortalLabel || '')}" placeholder="e.g. Open IT Helpdesk">
      </div>
      <div class="input-wrapper">
        <label>Support / Office Hours</label>
        <input type="text" class="input-help-hours" value="${escapeAttribute(config.help.supportHours || '')}" placeholder="e.g. Mon–Fri 8 AM–5 PM EST">
      </div>
      <div class="input-wrapper">
        <label>Expected Response Time</label>
        <input type="text" class="input-help-response" value="${escapeAttribute(config.help.responseTime || '')}" placeholder="e.g. Inquiries answered within 4 hours">
      </div>
      <div class="input-wrapper">
        <label>Course Owner / Department</label>
        <input type="text" class="input-help-dept" value="${escapeAttribute(config.help.department || '')}" placeholder="e.g. Technical Training Ops">
      </div>
    </div>
  `;
  container.appendChild(contactSection);

  // Mount RTE for Intro
  const rteSlot = contactSection.querySelector('.rte-intro-slot');
  if (rteSlot) {
    const rte = createRichTextEditor({
      ariaLabel: 'Welcome / Introductory Instructions',
      value: config.help.intro || '',
      onChange: (sanitized) => {
        config.help.intro = sanitized;
        onUpdate();
      }
    });
    rteSlot.appendChild(rte.element);
  }

  // Bind contact inputs
  const emailInput = contactSection.querySelector('.input-help-email');
  emailInput.addEventListener('input', () => { config.help.supportEmail = emailInput.value; onUpdate(); });

  const phoneInput = contactSection.querySelector('.input-help-phone');
  phoneInput.addEventListener('input', () => { config.help.supportPhone = phoneInput.value; onUpdate(); });

  const portalUrlInput = contactSection.querySelector('.input-help-portal-url');
  portalUrlInput.addEventListener('input', () => { config.help.supportPortalUrl = portalUrlInput.value; onUpdate(); });

  const portalLabelInput = contactSection.querySelector('.input-help-portal-label');
  portalLabelInput.addEventListener('input', () => { config.help.supportPortalLabel = portalLabelInput.value; onUpdate(); });

  const hoursInput = contactSection.querySelector('.input-help-hours');
  hoursInput.addEventListener('input', () => { config.help.supportHours = hoursInput.value; onUpdate(); });

  const respInput = contactSection.querySelector('.input-help-response');
  respInput.addEventListener('input', () => { config.help.responseTime = respInput.value; onUpdate(); });

  const deptInput = contactSection.querySelector('.input-help-dept');
  deptInput.addEventListener('input', () => { config.help.department = deptInput.value; onUpdate(); });

  // Section 2: Troubleshooting FAQs
  const faqSection = document.createElement('div');
  faqSection.className = 'ppt-section-box';
  faqSection.innerHTML = `
    <div class="ppt-editor-header-bar" style="margin-bottom: 12px;">
      <h4 class="ppt-section-title" style="margin: 0;">Troubleshooting & FAQs (Accessible Accordion)</h4>
      <button type="button" class="btn btn-primary btn-sm" id="btn-add-faq">
        <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M17 9h-2v6H9v2h6v6h2v-6h6v-2h-6z"/></svg>
        <span>Add FAQ Item</span>
      </button>
    </div>
    <div class="ppt-faq-items-list"></div>
  `;
  container.appendChild(faqSection);

  const faqListContainer = faqSection.querySelector('.ppt-faq-items-list');

  function renderFaqItems() {
    faqListContainer.innerHTML = '';
    const items = config.help.faqItems;

    if (items.length === 0) {
      faqListContainer.innerHTML = `
        <div class="ppt-empty-state">
          <p>No FAQ troubleshooting items added yet. Click <strong>Add FAQ Item</strong> to add common questions and answers.</p>
        </div>
      `;
      return;
    }

    items.forEach((faq, idx) => {
      const card = document.createElement('div');
      card.className = 'ppt-entry-card';
      card.innerHTML = `
        <div class="ppt-card-header">
          <div class="ppt-card-title-row">
            <span class="ppt-card-index">Q${idx + 1}</span>
            <span class="ppt-card-term-title">${escapeHTML(faq.question || 'Untitled Question')}</span>
          </div>
          <div class="ppt-card-header-actions">
            <button type="button" class="btn-icon-sm btn-delete-faq" title="Delete question" aria-label="Delete question">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M12 12h2v12h-2zm6 0h2v12h-2z"/><path d="M4 6v2h2v20a2 2 0 002 2h16a2 2 0 002-2V8h2V6h-6V4a2 2 0 00-2-2h-8a2 2 0 00-2 2v2H4zm4 22V8h16v20H8zm4-24h8v2h-8V4z"/></svg>
            </button>
          </div>
        </div>

        <div class="ppt-card-body">
          <div class="input-wrapper">
            <label>Question <span class="required">*</span></label>
            <input type="text" class="input-faq-question" value="${escapeAttribute(faq.question)}" placeholder="e.g. How do I get course completion credit?">
          </div>
          <div class="input-wrapper rte-wrapper-slot">
            <label>Answer / Resolution Steps <span class="required">*</span></label>
            <div class="rte-faq-answer-slot"></div>
          </div>
        </div>
      `;

      // Mount RTE for Answer
      const ansSlot = card.querySelector('.rte-faq-answer-slot');
      if (ansSlot) {
        const rte = createRichTextEditor({
          ariaLabel: `Answer / Resolution Steps for FAQ ${idx + 1}`,
          value: faq.answer || '',
          onChange: (sanitized) => {
            faq.answer = sanitized;
            onUpdate();
          }
        });
        ansSlot.appendChild(rte.element);
      }

      const qInput = card.querySelector('.input-faq-question');
      qInput.addEventListener('input', () => {
        faq.question = qInput.value;
        card.querySelector('.ppt-card-term-title').textContent = faq.question || 'Untitled Question';
        onUpdate();
      });

      card.querySelector('.btn-delete-faq').addEventListener('click', () => {
        config.help.faqItems.splice(idx, 1);
        renderFaqItems();
        onUpdate();
      });

      faqListContainer.appendChild(card);
    });
  }

  renderFaqItems();

  faqSection.querySelector('#btn-add-faq').addEventListener('click', () => {
    config.help.faqItems.push({
      id: `faq-${Date.now().toString(36)}`,
      question: 'New Troubleshooting Question',
      answer: '<p>Provide clear step-by-step guidance here.</p>'
    });
    renderFaqItems();
    onUpdate();
  });

  return container;
}
