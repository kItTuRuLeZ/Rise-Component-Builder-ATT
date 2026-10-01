// @ts-nocheck
import { createDefaultPostPublishConfig, normalizePostPublishConfig } from './schema.js';
import { detectRisePackage } from './package-detector.js';
import { createGlossaryEditor } from './editors/glossary-editor.js';
import { createResourcesEditor } from './editors/resources-editor.js';
import { createHelpEditor } from './editors/help-editor.js';
import { createSettingsEditor } from './editors/settings-editor.js';
import { generateSimulatorPreviewHTML } from './preview.js';
import { validatePostPublishConfig } from './validator.js';
import { planEnhancement } from './zip-enhancer.js';
import { enhanceRisePackage } from './zip-enhancer.js';
import { escapeHTML, formatStorageBytes } from '../utilities.js';

export function createPostPublishWorkflow({ onBack = null } = {}) {
  const container = document.createElement('div');
  container.className = 'ppt-workflow-container';

  let currentStep = 1;
  let uploadedFile = null;
  let packageDetection = null;
  let currentConfig = createDefaultPostPublishConfig();

  // Top Stepper Navigation
  const stepper = document.createElement('nav');
  stepper.className = 'ppt-stepper-nav';
  stepper.setAttribute('aria-label', 'Post-Publish Enhancement Steps');

  const stepsMeta = [
    { num: 1, title: 'Upload Package' },
    { num: 2, title: 'Choose Tools' },
    { num: 3, title: 'Add Content' },
    { num: 4, title: 'Style & Position' },
    { num: 5, title: 'Preview & Validate' },
    { num: 6, title: 'Download ZIP' }
  ];

  function renderStepper() {
    stepper.innerHTML = stepsMeta.map(s => {
      const isCurrent = s.num === currentStep;
      const isPast = s.num < currentStep;
      return `
        <button type="button" class="ppt-step-node ${isCurrent ? 'active' : ''} ${isPast ? 'completed' : ''}" data-step="${s.num}">
          <span class="ppt-step-num">${isPast ? '✓' : s.num}</span>
          <span class="ppt-step-title">${s.title}</span>
        </button>
      `;
    }).join('<div class="ppt-step-connector"></div>');

    stepper.querySelectorAll('.ppt-step-node').forEach(btn => {
      btn.addEventListener('click', () => {
        const stepNum = parseInt(btn.getAttribute('data-step'), 10);
        if (stepNum < currentStep || canNavigateToStep(stepNum)) {
          goToStep(stepNum);
        }
      });
    });
  }

  function canNavigateToStep(targetStep) {
    if (targetStep > 1 && !uploadedFile) {
      alert('Please upload a valid Rise course ZIP package first.');
      return false;
    }
    return true;
  }

  const stepContentContainer = document.createElement('div');
  stepContentContainer.className = 'ppt-step-content-area';

  const footerNav = document.createElement('div');
  footerNav.className = 'ppt-workflow-footer-nav';

  function renderFooter() {
    const isStep1Blocked = currentStep === 1 && (!uploadedFile || !packageDetection || !packageDetection.valid);
    footerNav.innerHTML = `
      <div class="ppt-footer-left">
        ${currentStep > 1 ? `<button type="button" class="btn btn-secondary" id="btn-ppt-prev">← Previous Step</button>` : ''}
      </div>
      <div class="ppt-footer-right">
        ${currentStep < 6 ? `
          <button type="button" class="btn btn-primary" id="btn-ppt-next" ${isStep1Blocked ? 'disabled title="Upload and validate a Rise ZIP package before continuing"' : ''}>
            Next Step →
          </button>
        ` : ''}
      </div>
    `;

    const prevBtn = footerNav.querySelector('#btn-ppt-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => goToStep(currentStep - 1));

    const nextBtn = footerNav.querySelector('#btn-ppt-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentStep === 1 && (!uploadedFile || !packageDetection || !packageDetection.valid)) {
          alert('Please upload a valid Rise course ZIP package before continuing.');
          return;
        }
        if (currentStep === 2) {
          const enabled = currentConfig.settings.enabledTools;
          if (!enabled.glossary && !enabled.resources && !enabled.help) {
            alert('Please select at least one tool to include.');
            return;
          }
        }
        goToStep(currentStep + 1);
      });
    }
  }

  function goToStep(stepNum) {
    currentStep = stepNum;
    renderStepper();
    renderFooter();
    renderStepContent();
  }

  function renderStepContent() {
    stepContentContainer.innerHTML = '';

    if (currentStep === 1) renderStep1Upload();
    else if (currentStep === 2) renderStep2ChooseTools();
    else if (currentStep === 3) renderStep3AddContent();
    else if (currentStep === 4) renderStep4StylePosition();
    else if (currentStep === 5) renderStep5PreviewValidate();
    else if (currentStep === 6) renderStep6Download();
  }

  // --- STEP 1: Upload Package ---
  function renderStep1Upload() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel';
    box.innerHTML = `
      <div class="ppt-step-header">
        <h2>Step 1: Upload Published Rise Package</h2>
        <p>Select the exported <strong>.zip</strong> package from Rise 360 (Web or SCORM LMS export). Processing is 100% private and runs offline inside your browser.</p>
      </div>

      <div class="ppt-upload-dropzone ${uploadedFile ? 'has-file' : ''}" id="ppt-zip-dropzone">
        <svg class="ppt-dropzone-icon" width="48" height="48" viewBox="0 0 32 32" fill="currentColor"><path d="M26 24v4H6v-4H4v4a2 2 0 002 2h20a2 2 0 002-2v-4z"/><path d="M15 3v16.17l-4.59-4.58L9 16l7 7 7-7-1.41-1.41L17 19.17V3h-2z"/></svg>
        <h3>${uploadedFile ? escapeHTML(uploadedFile.name) : 'Drag and drop your Rise .zip package here'}</h3>
        <p class="field-hint">${uploadedFile ? `Package Size: ${formatStorageBytes(uploadedFile.size)}` : 'or click to browse local files'}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-browse-zip">${uploadedFile ? 'Change .zip File' : 'Browse .zip File'}</button>
        <input type="file" id="ppt-zip-input" accept=".zip,application/zip" style="display:none;">
      </div>

      ${packageDetection ? `
        <div class="ppt-package-detected-card ${packageDetection.valid ? 'success' : 'error'}">
          <h4>${packageDetection.valid ? (packageDetection.kind === 'generic-web' ? '⚠️ Accepted as a generic web page' : '✓ Package detected') : '⛔ This ZIP cannot be used'}</h4>
          <p><strong>Detected as:</strong> ${escapeHTML(packageDetection.label || 'Unknown')}</p>
          <p><strong>Launch document:</strong> ${escapeHTML(packageDetection.launchHtmlPath || 'None')}</p>
          ${(packageDetection.warnings || []).length ? `<ul class="ppt-package-warnings">${packageDetection.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
          ${packageDetection.valid ? '<p class="field-hint">Detection uses file structure only; it has not been checked against a live Rise course.</p>' : ''}
          ${packageDetection.isPreviouslyEnhanced ? `
            <div class="ppt-prior-enhancement-alert">
              <span>🌟 This package was previously enhanced. Its prior settings have been automatically loaded for you to update or modify.</span>
            </div>
          ` : ''}
          ${packageDetection.error ? `<p class="ppt-error-text">${escapeHTML(packageDetection.error)}</p>` : ''}
          
          <div style="display: flex; gap: 8px; margin-top: 14px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-replace-pkg">Replace Package</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-remove-pkg">Remove Package</button>
          </div>
        </div>
      ` : ''}

      <div class="ppt-info-callout">
        <strong>Important Note:</strong> Post-publish tools are applied to an exported Rise package. If the course is republished from Rise in the future, simply apply the tools again to the new export.
      </div>
    `;

    const dropzone = box.querySelector('#ppt-zip-dropzone');
    const fileInput = box.querySelector('#ppt-zip-input');
    const browseBtn = box.querySelector('#btn-browse-zip');
    const replaceBtn = box.querySelector('#btn-replace-pkg');
    const removeBtn = box.querySelector('#btn-remove-pkg');

    browseBtn.addEventListener('click', () => fileInput.click());
    if (replaceBtn) replaceBtn.addEventListener('click', () => fileInput.click());
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        uploadedFile = null;
        packageDetection = null;
        renderStepContent();
        renderFooter();
      });
    }

    dropzone.addEventListener('click', (e) => {
      if (e.target !== browseBtn && !e.target.closest('button')) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file) handleUploadedZip(file);
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) handleUploadedZip(file);
    });

    async function handleUploadedZip(file) {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        alert('Please select a valid .zip archive file.');
        return;
      }
      uploadedFile = file;
      packageDetection = await detectRisePackage(file);
      if (packageDetection.isPreviouslyEnhanced && packageDetection.previousConfig) {
        currentConfig = normalizePostPublishConfig(packageDetection.previousConfig);
      }
      renderStepContent();
      renderFooter();
    }

    stepContentContainer.appendChild(box);
  }

  // --- STEP 2: Choose Tools ---
  function renderStep2ChooseTools() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel';
    const enabled = currentConfig.settings.enabledTools;

    box.innerHTML = `
      <div class="ppt-step-header">
        <h2>Step 2: Choose Persistent Tools</h2>
        <p>Select which tools will be included inside the persistent <strong>Course Tools</strong> learner launcher.</p>
      </div>

      <div class="ppt-tool-selection-grid">
        <label class="ppt-tool-card ${enabled.glossary ? 'selected' : ''}">
          <input type="checkbox" class="ppt-tool-chk" data-tool="glossary" ${enabled.glossary ? 'checked' : ''}>
          <div class="ppt-tool-card-body">
            <div class="ppt-tool-card-icon">📖</div>
            <h3>Persistent Glossary</h3>
            <p>Instant search, alphabetical A–Z browsing, category filtering, and rich definitions accessible from every lesson.</p>
            <span class="ppt-badge">${currentConfig.glossary.entries.length} terms configured</span>
          </div>
        </label>

        <label class="ppt-tool-card ${enabled.resources ? 'selected' : ''}">
          <input type="checkbox" class="ppt-tool-chk" data-tool="resources" ${enabled.resources ? 'checked' : ''}>
          <div class="ppt-tool-card-body">
            <div class="ppt-tool-card-icon">📁</div>
            <h3>Persistent Resources</h3>
            <p>Reference documents, job aids, external links, and downloadable files packaged directly into the course ZIP.</p>
            <span class="ppt-badge">${currentConfig.resources.items.length} items configured</span>
          </div>
        </label>

        <label class="ppt-tool-card ${enabled.help ? 'selected' : ''}">
          <input type="checkbox" class="ppt-tool-chk" data-tool="help" ${enabled.help ? 'checked' : ''}>
          <div class="ppt-tool-card-body">
            <div class="ppt-tool-card-icon">🛟</div>
            <h3>Help & Support</h3>
            <p>Course contacts (email, phone, support portal), office hours, response time, and an accessible FAQ troubleshooting accordion.</p>
            <span class="ppt-badge">${currentConfig.help.faqItems.length} FAQs configured</span>
          </div>
        </label>
      </div>
    `;

    box.querySelectorAll('.ppt-tool-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const toolKey = chk.getAttribute('data-tool');
        currentConfig.settings.enabledTools[toolKey] = chk.checked;
        // Update the card in place. This used to call renderStep2ChooseTools() again, which only
        // appends a panel (the container is cleared by renderStepContent(), not here), so every
        // toggle stacked another copy of the step. Nothing else on screen depends on the choice
        // (the footer checks it when Next is pressed), and keeping the node keeps keyboard focus.
        chk.closest('.ppt-tool-card')?.classList.toggle('selected', chk.checked);
      });
    });

    stepContentContainer.appendChild(box);
  }

  // --- STEP 3: Add Content ---
  function renderStep3AddContent() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel';

    const enabled = currentConfig.settings.enabledTools;
    const availableTabs = [];
    if (enabled.glossary) availableTabs.push({ key: 'glossary', label: '📖 Glossary' });
    if (enabled.resources) availableTabs.push({ key: 'resources', label: '📁 Resources' });
    if (enabled.help) availableTabs.push({ key: 'help', label: '🛟 Help & Support' });

    let activeContentTab = availableTabs[0]?.key || 'glossary';

    const tabNav = document.createElement('div');
    tabNav.className = 'ppt-content-subtabs';
    tabNav.innerHTML = availableTabs.map(t => `
      <button type="button" class="ppt-subtab-btn ${t.key === activeContentTab ? 'active' : ''}" data-tab="${t.key}">
        ${t.label}
      </button>
    `).join('');

    const editorMount = document.createElement('div');
    editorMount.className = 'ppt-editor-mount-point';

    function renderEditorTab() {
      editorMount.innerHTML = '';
      tabNav.querySelectorAll('.ppt-subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === activeContentTab);
      });

      if (activeContentTab === 'glossary') {
        editorMount.appendChild(createGlossaryEditor(currentConfig, () => {}));
      } else if (activeContentTab === 'resources') {
        editorMount.appendChild(createResourcesEditor(currentConfig, () => {}));
      } else if (activeContentTab === 'help') {
        editorMount.appendChild(createHelpEditor(currentConfig, () => {}));
      }
    }

    tabNav.querySelectorAll('.ppt-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeContentTab = btn.getAttribute('data-tab');
        renderEditorTab();
      });
    });

    box.appendChild(tabNav);
    box.appendChild(editorMount);
    renderEditorTab();

    stepContentContainer.appendChild(box);
  }

  // --- STEP 4: Style & Position ---
  function renderStep4StylePosition() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel';
    box.appendChild(createSettingsEditor(currentConfig, () => {}));
    stepContentContainer.appendChild(box);
  }

  // --- STEP 5: Preview & Validate ---
  function renderStep5PreviewValidate() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel ppt-preview-validate-panel';

    const validation = validatePostPublishConfig(currentConfig);

    box.innerHTML = `
      <div class="ppt-preview-header">
        <div class="ppt-viewport-toolbar">
          <span>Viewport Preview:</span>
          <button type="button" class="btn btn-secondary btn-sm ppt-vp-btn active" data-width="100%">Desktop (100%)</button>
          <button type="button" class="btn btn-secondary btn-sm ppt-vp-btn" data-width="768px">Tablet (768px)</button>
          <button type="button" class="btn btn-secondary btn-sm ppt-vp-btn" data-width="375px">Mobile (375px)</button>
        </div>
      </div>

      <p class="ppt-demo-label" role="note" style="margin: 0 0 8px; padding: 8px 12px; border: 1px solid #F59E0B; background: #FFFBEB; border-radius: 8px; font-size: 0.8125rem;">
        <strong>Demo simulator — not your uploaded course.</strong> This is a made-up course page used to show how the tools look and behave with your settings. Your uploaded package has not been opened or rendered, so this preview does not validate it.
      </p>
      <div class="ppt-preview-frame-shell">
        <iframe id="ppt-sim-iframe" class="ppt-sim-iframe" title="Demo simulator (sample course page, not your uploaded course)"></iframe>
      </div>

      <div class="ppt-validation-report-card">
        <h3>Tool settings checks</h3>
        <p class="field-hint" style="margin: 0 0 8px;">${validation.notes.map(escapeHTML).join(' ')}</p>
        ${validation.samples.length ? `
          <label class="ppt-sample-ack" style="display: flex; gap: 8px; align-items: flex-start; margin: 0 0 10px; font-size: 0.875rem;">
            <input type="checkbox" id="ppt-sample-ack" ${currentConfig.settings.sampleContentAcknowledged ? 'checked' : ''}>
            <span>I understand this export includes sample content (${validation.samples.length} item${validation.samples.length === 1 ? '' : 's'}). Placeholder links and addresses still block export.</span>
          </label>` : ''}
        <div class="ppt-val-groups">
          <div class="ppt-val-group passed">
            <h4>✓ Passed Checks (${validation.passed.length})</h4>
            <ul>${validation.passed.map(p => `<li>${escapeHTML(p)}</li>`).join('')}</ul>
          </div>
          ${validation.warnings.length > 0 ? `
            <div class="ppt-val-group warnings">
              <h4>⚠️ Warnings (${validation.warnings.length})</h4>
              <ul>${validation.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>
            </div>
          ` : ''}
          ${validation.errors.length > 0 ? `
            <div class="ppt-val-group errors">
              <h4>⛔ Critical Errors Blocking Export (${validation.errors.length})</h4>
              <ul>${validation.errors.map(e => `<li>${escapeHTML(e)}</li>`).join('')}</ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    box.querySelector('#ppt-sample-ack')?.addEventListener('change', event => {
      currentConfig.settings.sampleContentAcknowledged = event.target.checked;
      renderStepContent();
    });

    const iframe = box.querySelector('#ppt-sim-iframe');
    generateSimulatorPreviewHTML(currentConfig).then(html => {
      if (iframe) {
        iframe.srcdoc = html;
      }
    }).catch(err => {
      console.error('Failed to generate simulator preview:', err);
    });

    box.querySelectorAll('.ppt-vp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        box.querySelectorAll('.ppt-vp-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        iframe.style.width = btn.getAttribute('data-width');
      });
    });

    stepContentContainer.appendChild(box);
  }

  // --- STEP 6: Download Enhanced ZIP ---
  function renderStep6Download() {
    const box = document.createElement('div');
    box.className = 'ppt-step-panel';

    const validation = validatePostPublishConfig(currentConfig);

    box.innerHTML = `
      <div class="ppt-step-header">
        <h2>Step 6: Download Enhanced Package</h2>
        <p>Package your persistent course tools into the final distribution ZIP archive.</p>
      </div>

      <div class="ppt-package-summary" id="ppt-package-summary" aria-live="polite">Preparing summary of what will change…</div>

      ${validation.errors.length > 0 ? `
        <div class="ppt-package-detected-card error">
          <h4>Export Blocked by Validation Errors</h4>
          <p>Please resolve the following errors before exporting:</p>
          <ul>${validation.errors.map(e => `<li>${escapeHTML(e)}</li>`).join('')}</ul>
        </div>
      ` : `
        <div class="ppt-export-action-box">
          <button type="button" class="btn btn-primary btn-lg" id="btn-run-enhancement" aria-label="Download Enhanced Rise Package">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor"><path d="M26 24v4H6v-4H4v4a2 2 0 002 2h20a2 2 0 002-2v-4z"/><path d="M15 3v16.17l-4.59-4.58L9 16l7 7 7-7-1.41-1.41L17 19.17V3h-2z"/></svg>
            <span>Download Enhanced Rise Package</span>
          </button>
          <div id="ppt-enhancement-status" class="ppt-enhancement-status" style="display:none;"></div>
        </div>

        <div class="ppt-report-preview-box" id="ppt-report-box" style="display:none;">
          <h4>Enhancement Report Summary</h4>
          <pre class="ppt-report-pre" id="ppt-report-text"></pre>
        </div>
      `}
    `;

    planEnhancement(uploadedFile, packageDetection, currentConfig).then(plan => {
      const target = box.querySelector('#ppt-package-summary');
      if (!target) return;
      const outstanding = [...(packageDetection?.warnings || []), ...validation.warnings, ...plan.warnings];
      target.innerHTML = `
        <div class="ppt-package-detected-card success">
          <h4>What this download will change</h4>
          <p><strong>Package:</strong> ${escapeHTML(uploadedFile?.name || '')} — ${escapeHTML(packageDetection?.label || '')}</p>
          <p><strong>Existing file modified:</strong> <code>${escapeHTML(plan.modifiedFile)}</code> (a script/style block is added before <code>&lt;/body&gt;</code>)</p>
          <p><strong>Tools enabled:</strong> ${plan.enabledTools.length ? plan.enabledTools.map(escapeHTML).join(', ') : 'none'}</p>
          <p><strong>Files added:</strong></p>
          <ul>${plan.addedFiles.map(f => `<li><code>${escapeHTML(f)}</code></li>`).join('')}</ul>
          ${outstanding.length ? `<p><strong>Outstanding warnings:</strong></p><ul>${outstanding.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
          <p class="field-hint">Everything else in the package is left byte-for-byte as uploaded. This step adds the tools; it does not repair problems that were already in the course.</p>
        </div>`;
    }).catch(err => {
      const target = box.querySelector('#ppt-package-summary');
      if (target) target.textContent = `Could not prepare the summary: ${err.message}`;
    });

    const dlBtn = box.querySelector('#btn-run-enhancement');
    const statusEl = box.querySelector('#ppt-enhancement-status');
    const reportBox = box.querySelector('#ppt-report-box');
    const reportText = box.querySelector('#ppt-report-text');

    if (dlBtn) {
      dlBtn.addEventListener('click', async () => {
        dlBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.textContent = 'Generating enhanced course package...';

        try {
          const result = await enhanceRisePackage(uploadedFile, currentConfig);
          if (!result.success) {
            alert(`Enhancement failed: ${result.error}`);
            statusEl.textContent = 'Enhancement failed.';
            dlBtn.disabled = false;
            return;
          }

          // Trigger browser download
          const blobUrl = URL.createObjectURL(result.enhancedBlob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = result.downloadFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

          statusEl.textContent = `✓ Successfully downloaded "${result.downloadFilename}" (${formatStorageBytes(result.enhancedBlob.size)})`;
          reportBox.style.display = 'block';
          reportText.textContent = result.report;
        } catch (err) {
          alert(`Error generating enhanced package: ${err.message}`);
          statusEl.textContent = 'Error during enhancement.';
        } finally {
          dlBtn.disabled = false;
        }
      });
    }

    stepContentContainer.appendChild(box);
  }

  const workflowHeader = document.createElement('div');
  workflowHeader.className = 'ppt-workflow-header';
  workflowHeader.innerHTML = `
    <div class="ppt-header-top-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div class="workspace-breadcrumbs">
        <button id="ppt-back-btn" class="breadcrumb-back-btn" title="Back to Projects Dashboard" aria-label="Back to Projects Dashboard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Course Projects Dashboard</span>
        </button>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">Rise Post-Publish Toolkit</span>
      </div>
    </div>
    <h1 class="ppt-page-title" style="font-size: 1.5rem; font-weight: 700; margin: 0 0 4px 0; color: var(--text-main, #111);">Persistent Course Tools</h1>
    <p style="font-size: 0.875rem; color: var(--text-muted, #666); margin: 0 0 16px 0;">Add persistent glossary, resources, and help to an exported Rise course.</p>
  `;

  const backBtn = workflowHeader.querySelector('#ppt-back-btn');
  if (backBtn && onBack) {
    backBtn.addEventListener('click', () => {
      onBack();
    });
  }

  container.appendChild(workflowHeader);
  container.appendChild(stepper);
  container.appendChild(stepContentContainer);
  container.appendChild(footerNav);

  renderStepper();
  renderFooter();
  renderStepContent();

  return container;
}
