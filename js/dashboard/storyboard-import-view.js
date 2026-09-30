/**
 * @file storyboard-import-view.js
 * The "Import Storyboard (.docx)" workflow: parse -> validate -> review -> confirm
 * (docs/STORYBOARD-IMPORT-DESIGN.md). A separate top-level dashboard entry point from the
 * existing JSON/ZIP "Import Project Package" flow, because this one is multi-step (a file pick
 * alone can't tell the author whether the document is actually importable) where that one is a
 * single "pick file -> open" action.
 */

import { parseDocxToBlocks } from '../storyboard-import/docx-parser.js';
import { extractStoryboard } from '../storyboard-import/storyboard-extract.js';
import { validateStoryboard } from '../storyboard-import/validation.js';
import { buildProjectFromStoryboard } from '../storyboard-import/build-project.js';
import { saveProject } from '../storage.js';
import { EDITION } from '../client-isolation.js';
import { escapeHTML } from '../utilities.js';
import { showToast } from '../toast.js';

// This build's own edition (js/client-isolation.js) — a storyboard import always lands in this
// edition's own project storage, matching every other dashboard starter workflow; there is no
// picker for it (a stray "Client edition: PMI" note inside the .docx's own metadata table is
// informational text for the document's author, not something this app acts on).
const CLIENT_LABEL = String(EDITION) === 'ATT' ? 'AT&T' : EDITION;

function isPlaceholderText(text) {
  const trimmed = (text || '').trim();
  return !trimmed || /^\[.*\]$/.test(trimmed);
}

export class StoryboardImportView {
  constructor({ container = null, onBack = null, onImported = null } = {}) {
    this.container = container;
    this.onBack = onBack;
    this.onImported = onImported;
    this.state = this.initialState();
  }

  initialState() {
    return {
      step: 'select', // 'select' | 'parsing' | 'review' | 'parse-error'
      fileName: null,
      storyboard: null,
      validation: null,
      projectName: '',
      parseErrorMessage: null
    };
  }

  mount() {
    this.render();
  }

  unmount() {
    if (this.container) this.container.innerHTML = '';
  }

  async handleFile(file) {
    if (!file) return;
    this.state.step = 'parsing';
    this.state.fileName = file.name;
    this.render();

    try {
      const blocks = await parseDocxToBlocks(file);
      const storyboard = extractStoryboard(blocks);
      const validation = validateStoryboard(storyboard);
      const courseTitle = (storyboard.metadata['Course title'] || '').trim();
      this.state.storyboard = storyboard;
      this.state.validation = validation;
      this.state.projectName = isPlaceholderText(courseTitle) ? '' : courseTitle;
      this.state.step = 'review';
    } catch (error) {
      this.state.step = 'parse-error';
      this.state.parseErrorMessage = error?.message || 'This file could not be imported.';
    }
    this.render();
  }

  confirmImport() {
    const { storyboard, validation } = this.state;
    if (!storyboard || !validation) return;
    try {
      const project = buildProjectFromStoryboard(storyboard, validation, {
        name: this.state.projectName.trim() || undefined,
        clientLabel: CLIENT_LABEL
      });
      saveProject(project);
      showToast(`Imported “${project.name}” from storyboard.`, 'success');
      if (this.onImported) this.onImported(project.id);
    } catch (error) {
      showToast(`Import failed: ${error.message}`, 'error', 8000);
    }
  }

  chooseAnotherFile() {
    this.state = this.initialState();
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="project-workspace-view">
        <header class="workspace-header">
          <div class="workspace-breadcrumbs">
            <button id="sbi-back-btn" class="breadcrumb-back-btn" title="Back to Projects Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>Projects Dashboard</span>
            </button>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">Import Storyboard (.docx)</span>
          </div>
        </header>
        <main class="workspace-container">
          ${this.renderStep()}
        </main>
      </div>
    `;
    this.attachEventListeners();
  }

  renderStep() {
    switch (this.state.step) {
      case 'parsing': return this.renderParsing();
      case 'parse-error': return this.renderParseError();
      case 'review': return this.renderReview();
      default: return this.renderSelect();
    }
  }

  renderSelect() {
    return `
      <div class="workspace-banner" style="margin-bottom: 24px;">
        <div class="workspace-banner-info">
          <h1 class="workspace-title">Import Storyboard (.docx)</h1>
          <p class="workspace-desc">
            Upload an instructional designer's filled-in storyboard document to create a new course project.
            Rise-authored blocks (Text, Image, etc.) appear in the outline as reference entries only — they are
            never exported from this Builder — and each Builder block (Accordion, Multiple Choice, Image Gallery,
            or Horizontal Timeline) is imported from its own content record table.
          </p>
        </div>
      </div>
      <div class="dashboard-empty-state" style="border: 2px dashed var(--att-border, #CBD5E1); padding: 48px 24px;">
        <h3 class="empty-state-title">Choose a storyboard .docx file</h3>
        <p class="empty-state-subtitle">Only the documented storyboard template format is supported — see the storyboard importer guide for the required structure.</p>
        <label class="btn btn-primary" style="margin-top: 12px; display: inline-flex; cursor: pointer;">
          <span>Choose File…</span>
          <input type="file" id="sbi-file-input" accept=".docx" style="position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0;" />
        </label>
      </div>
    `;
  }

  renderParsing() {
    return `
      <div class="storyboard-import-loading">
        <div class="storyboard-import-spinner" aria-hidden="true"></div>
        <p class="storyboard-import-loading-text">Reading “${escapeHTML(this.state.fileName || '')}”…</p>
      </div>
    `;
  }

  renderParseError() {
    return `
      <div class="dashboard-empty-state" style="border: 2px solid #FFCDD2; background: #FEECEB;">
        <h3 class="empty-state-title" style="color: #D32F2F;">Could not import “${escapeHTML(this.state.fileName || '')}”</h3>
        <p class="empty-state-subtitle">${escapeHTML(this.state.parseErrorMessage || '')}</p>
        <button id="sbi-retry-btn" class="btn btn-secondary" style="margin-top: 12px;">Choose a different file</button>
      </div>
    `;
  }

  renderReview() {
    const { storyboard, validation, fileName } = this.state;
    const fatal = validation.findings.filter(f => f.severity === 'fatal');
    const warnings = validation.findings.filter(f => f.severity === 'warning');
    const canImport = fatal.length === 0;
    const totalOutlineRows = storyboard.sections.reduce((sum, s) => sum + s.outlineRows.length, 0);
    const builderCount = Object.keys(validation.mappedComponentsByBlockId).length;

    return `
      <div class="workspace-banner" style="margin-bottom: 20px;">
        <div class="workspace-banner-info">
          <h1 class="workspace-title">Review “${escapeHTML(fileName || '')}”</h1>
          <p class="workspace-desc">
            ${storyboard.sections.length} section${storyboard.sections.length === 1 ? '' : 's'},
            ${totalOutlineRows} outline row${totalOutlineRows === 1 ? '' : 's'},
            ${builderCount} Builder block${builderCount === 1 ? '' : 's'} ready to import.
          </p>
        </div>
      </div>

      ${fatal.length > 0 ? `
        <div class="section-card" style="margin-bottom: 16px; border: 1px solid #FFCDD2;">
          <div class="section-card-header" style="background: #FEECEB; padding: 14px 20px;">
            <h3 class="section-title" style="margin: 0; color: #D32F2F; font-size: 1.05rem;">
              🛑 ${fatal.length} issue${fatal.length === 1 ? '' : 's'} must be fixed before this can be imported
            </h3>
          </div>
          <div class="section-card-body" style="padding: 12px 20px;">
            <p style="margin: 0 0 10px 0; font-size: 0.875rem; color: #555;">Fix these in the document itself and re-upload — nothing below can be edited here.</p>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.875rem; color: #333;">
              ${fatal.map(f => `<li style="margin-bottom: 6px;">${escapeHTML(f.message)}</li>`).join('')}
            </ul>
          </div>
        </div>
      ` : ''}

      ${warnings.length > 0 ? `
        <div class="section-card" style="margin-bottom: 16px; border: 1px solid #FFE0B2;">
          <div class="section-card-header" style="background: #FFF3E0; padding: 14px 20px;">
            <h3 class="section-title" style="margin: 0; color: #B45309; font-size: 1.05rem;">
              ⚠️ ${warnings.length} item${warnings.length === 1 ? '' : 's'} to review before publishing
            </h3>
          </div>
          <div class="section-card-body" style="padding: 12px 20px;">
            <ul style="margin: 0; padding-left: 20px; font-size: 0.875rem; color: #333;">
              ${warnings.map(f => `<li style="margin-bottom: 6px;">${escapeHTML(f.message)}</li>`).join('')}
            </ul>
          </div>
        </div>
      ` : ''}

      <div class="section-card" style="margin-bottom: 16px;">
        <div class="section-card-header" style="background: var(--att-grey-1, #F8F9FA); padding: 14px 20px;">
          <h3 class="section-title" style="margin: 0; font-size: 1.05rem;">Outline</h3>
        </div>
        <div class="section-card-body" style="padding: 12px 20px;">
          ${storyboard.sections.map(section => `
            <div style="margin-bottom: 14px;">
              <div style="font-weight: 700; font-size: 0.9375rem; margin-bottom: 6px;">${escapeHTML(section.sectionId)} — ${escapeHTML(section.sectionTitle || '(untitled)')}</div>
              ${section.outlineRows.map(row => {
                const isBuilder = row.kind === 'BUILDER';
                const isRise = row.kind === 'RISE';
                const mapped = isBuilder && Boolean(validation.mappedComponentsByBlockId[row.blockId]);
                const badgeStyle = isRise ? 'background:#E1F5FE; color:#0277BD; border:1px solid #B3E5FC;' : mapped ? 'background:#E8F5E9; color:#2E7D32; border:1px solid #C8E6C9;' : 'background:#FEECEB; color:#D32F2F; border:1px solid #FFCDD2;';
                return `
                  <div style="display:flex; align-items:center; gap:10px; padding:6px 0; font-size:0.875rem;">
                    <span style="font-weight:700; text-transform:uppercase; font-size:11px; padding:2px 7px; border-radius:4px; white-space:nowrap; ${badgeStyle}">${escapeHTML(row.kind)}</span>
                    <span style="color:#555; min-width:80px;">${escapeHTML(row.blockId)}</span>
                    <span style="color:#333;">${escapeHTML(row.blockType)}</span>
                    ${isBuilder && !mapped ? '<span style="color:#D32F2F; font-size:0.8125rem;">— not imported (see issues above)</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-body" style="padding: 16px 20px; display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 220px;">
            <label for="sbi-project-name" style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:6px;">Project name</label>
            <input id="sbi-project-name" class="form-input" type="text" placeholder="Imported Storyboard" value="${escapeHTML(this.state.projectName)}" />
          </div>
          <button id="sbi-choose-different-btn" class="btn btn-secondary">Choose a different file</button>
          <button id="sbi-confirm-btn" class="btn btn-primary" ${canImport ? '' : 'disabled'} title="${canImport ? '' : 'Fix the issues listed above and re-upload before importing.'}">
            Create Project
          </button>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    this.container.querySelector('#sbi-back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    const fileInput = this.container.querySelector('#sbi-file-input');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.handleFile(file);
    });

    this.container.querySelector('#sbi-retry-btn')?.addEventListener('click', () => this.chooseAnotherFile());
    this.container.querySelector('#sbi-choose-different-btn')?.addEventListener('click', () => this.chooseAnotherFile());

    const nameInput = this.container.querySelector('#sbi-project-name');
    nameInput?.addEventListener('input', (e) => {
      this.state.projectName = e.target.value;
    });

    this.container.querySelector('#sbi-confirm-btn')?.addEventListener('click', () => this.confirmImport());
  }
}
