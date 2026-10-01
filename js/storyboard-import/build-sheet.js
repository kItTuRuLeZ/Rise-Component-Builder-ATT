// The Rise build sheet: an ordered, copyable/downloadable plain-text list of every kind:"rise"
// component in a project (storyboard import, docs/STORYBOARD-IMPORT-DESIGN.md), grouped by
// section in outline order. RISE rows are reference-only inside this Builder — nothing here
// compiles or exports them — so this is the one place their content is handed back to whoever
// is doing the actual authoring in Rise itself, per the spec's "accessible way to copy or
// download the ordered Rise build sheet" requirement.

import { isolateModal } from '../dashboard/att-modal.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * @param {any} project a schema v3 project (js/project-schema.js)
 * @returns {string} plain text, never empty even with zero RISE rows (says so explicitly)
 */
export function buildRiseSheetText(project) {
  const lines = [`# ${project.name || 'Untitled Course'} — Rise Build Sheet`, ''];
  let riseCount = 0;

  const sectionIds = project.sectionOrder || [];
  for (const secId of sectionIds) {
    const section = project.sections?.[secId];
    if (!section) continue;
    const riseRows = (section.componentOrder || [])
      .map(compId => project.components?.[compId])
      .filter(comp => comp && comp.kind === 'rise');
    if (riseRows.length === 0) continue;

    lines.push(`## ${section.name || 'Untitled Section'}`);
    for (const comp of riseRows) {
      riseCount++;
      const blockId = comp.config?.blockId || comp.id;
      lines.push(`- ${blockId} — ${comp.name || 'Untitled block'} (${comp.type || 'Rise block'})`);
      if (comp.config?.notes) lines.push(`  ${comp.config.notes}`);
    }
    lines.push('');
  }

  if (riseCount === 0) {
    lines.push('No Rise-authored blocks in this course.');
    lines.push('');
  }

  lines.push(`Generated ${new Date().toISOString()} — ${riseCount} Rise block${riseCount === 1 ? '' : 's'}.`);
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the execCommand fallback below
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

export function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens a modal showing the project's Rise build sheet with Copy and Download actions.
 * @param {{ project: any, triggerElement?: Element|null }} options
 */
export function showRiseBuildSheetDialog({ project, triggerElement = (typeof document !== 'undefined' ? document.activeElement : null) }) {
  const text = buildRiseSheetText(project);
  const filename = `${(project.name || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course'}-rise-build-sheet.md`;

  const existing = document.getElementById('att-dynamic-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'att-dynamic-modal-overlay';
  overlay.className = 'modal-overlay is-active';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'att-rise-sheet-title');

  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 640px;">
      <div class="modal-header">
        <h2 id="att-rise-sheet-title" class="modal-title">Rise Build Sheet</h2>
        <button id="att-modal-close-btn" class="project-menu-btn" aria-label="Close dialog" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p style="margin: 0 0 10px 0; font-size: 0.875rem; color: #555;">Every Rise-authored block in this course, in outline order — copy or download it for whoever is building directly in Rise.</p>
        <textarea id="att-rise-sheet-text" class="form-input" readonly style="width: 100%; min-height: 260px; font-family: ui-monospace, Consolas, monospace; font-size: 0.8125rem; resize: vertical;">${escapeHtml(text)}</textarea>
      </div>
      <div class="modal-footer">
        <button id="att-rise-sheet-download-btn" class="btn-att-secondary" type="button">Download .md</button>
        <button id="att-rise-sheet-copy-btn" class="btn-att-primary" type="button">Copy to Clipboard</button>
      </div>
    </div>
  `;

  const modalRoot = document.getElementById('modal-root') || document.body;
  modalRoot.appendChild(overlay);

  const cleanup = () => {
    cleanupIsolation();
    overlay.remove();
  };
  const cleanupIsolation = isolateModal(overlay, {
    triggerElement,
    onDismiss: cleanup,
    initialFocusSelector: '#att-rise-sheet-copy-btn'
  });

  overlay.querySelector('#att-modal-close-btn').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

  overlay.querySelector('#att-rise-sheet-copy-btn').addEventListener('click', async () => {
    const copied = await copyText(text);
    showToast(copied ? 'Rise build sheet copied to clipboard.' : 'Could not copy automatically — select the text and copy manually.', copied ? 'success' : 'error');
  });

  overlay.querySelector('#att-rise-sheet-download-btn').addEventListener('click', () => {
    downloadText(text, filename);
  });
}
