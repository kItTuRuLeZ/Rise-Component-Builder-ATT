/**
 * Course Project Multi-Component Structured ZIP Exporter
 * Bundles all course sections, component HTML packages, manifest, and assets into an organized ZIP.
 */

import { getProject } from '../storage.js';
import { createZip } from '../zip.js';
import { prepareMediaExport } from '../export.js';
import { COMPONENT_REGISTRY } from '../component-registry.js';
import { generateIframeContent as compilePreview } from '../preview.js';
import { toRgba as colorToRgba } from '../utilities.js';
import { auditCourseProject } from './project-qa.js';
import { isolateModal } from './att-modal.js';
import { showToast } from '../toast.js';
import { describeTechnicalStatus, getCourseReadiness } from './course-readiness.js';

const componentRegistry = Object.fromEntries(
  COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, validate: entry.validate, version: entry.version }])
);

function sanitizeSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function padZero(num) {
  return String(num).padStart(2, '0');
}

/**
 * Thrown when a course cannot be exported as a portable package (missing local media,
 * or a compiled component that would still reference something the ZIP does not contain).
 * The message always names the component so the author knows what to fix.
 */
export class CourseExportError extends Error {
  /** @param {string} message @param {{ componentName?: string, assets?: string[] }} [details] */
  constructor(message, details = {}) {
    super(message);
    this.name = 'CourseExportError';
    this.componentName = details.componentName || '';
    this.assets = details.assets || [];
  }
}

// Session-only URLs that stop working the moment the ZIP leaves this tab. A real one is
// `blob:<origin>/<id>`; a bare `blob:` is only a CSP source keyword and is legitimate.
const TRANSIENT_URL_PATTERN = /\b(?:blob|filesystem):(?:https?:|null\/|file:)/i;
// Local packaged references: assets/<file> in an attribute, url(...) or srcset.
const PACKAGED_REF_PATTERN = /(?:["'(=,\s])(assets\/[^"'\s)<>,]+)/g;

/**
 * Compiles one component into a self-contained folder: `<folder>/index.html` plus
 * `<folder>/assets/*` for every locally uploaded file it references (each component
 * folder can therefore be hosted or embedded on its own).
 *
 * Media goes through the same `prepareMediaExport(..., { mode: 'package' })` step as the
 * single-component Web Package ZIP, so it resolves to relative `assets/` paths rather than
 * the preview's `blob:` URLs.
 *
 * @returns {Promise<{ path: string, assets: { path: string, mimeType: string, sourceMediaId: string }[] }>}
 */
async function addComponentToArchive(project, comp, folder, entries, store) {
  const name = comp.name || comp.id;
  const compDef = COMPONENT_REGISTRY.find(r => r.id === comp.type);
  const prepared = await prepareMediaExport(comp.config, { mode: 'package', ...(store ? { store } : {}) });
  if (prepared.missing.length) {
    throw new CourseExportError(
      `Cannot export “${name}”: uploaded media ${prepared.missing.map(m => `“${m}”`).join(', ')} is missing from local storage. Re-upload it or remove it from the component, then export again.`,
      { componentName: name, assets: prepared.missing }
    );
  }

  // The compiler silently drops unregistered blob: sources, so catch them in the prepared
  // config, before compiling, while the offending value is still visible.
  const staleConfigUrl = JSON.stringify(prepared.config).match(TRANSIENT_URL_PATTERN);
  if (staleConfigUrl) {
    throw new CourseExportError(
      `Cannot export “${name}”: it still references a temporary ${staleConfigUrl[0]} media URL that will not work outside this browser. Re-attach the media and export again.`,
      { componentName: name }
    );
  }

  const html = compilePreview({
    selectedComponent: compDef,
    config: prepared.config,
    activeTheme: project.theme,
    componentOverrides: comp.styleOverrides || project.componentOverrides,
    settings: project.settings,
    uiTheme: project.uiTheme
  }, componentRegistry, colorToRgba);

  // Distributable-package gate: refuse to ship anything that only works in this browser tab.
  const transient = html.match(TRANSIENT_URL_PATTERN);
  if (transient) {
    throw new CourseExportError(
      `Cannot export “${name}”: it still references a temporary ${transient[0]} URL that will not work outside this browser. Re-attach the media and export again.`,
      { componentName: name }
    );
  }
  // A media element with no source is the other way a distributable package silently breaks:
  // the compiler drops unregistered blob: URLs, leaving `<img src="">` behind.
  if (/<(?:img|source|video|audio)\b[^>]*\ssrc=(?:""|'')/i.test(html)) {
    throw new CourseExportError(
      `Cannot export “${name}”: it has an image, audio or video with no file attached. Re-attach the media or remove it, then export again.`,
      { componentName: name }
    );
  }
  const packaged = new Set(prepared.assets.map(a => a.relativePath));
  const dangling = [...new Set([...html.matchAll(PACKAGED_REF_PATTERN)].map(m => m[1]))].filter(ref => !packaged.has(ref));
  if (dangling.length) {
    throw new CourseExportError(
      `Cannot export “${name}”: it references ${dangling.map(d => `“${d}”`).join(', ')} but that file is not in the package.`,
      { componentName: name, assets: dangling }
    );
  }

  entries.push({ path: `${folder}/index.html`, data: html });
  for (const asset of prepared.assets) {
    entries.push({ path: `${folder}/${asset.relativePath}`, data: await asset.blob.arrayBuffer() });
  }
  if (prepared.assets.length) {
    entries.push({
      path: `${folder}/assets/manifest.json`,
      data: JSON.stringify({ schemaVersion: 1, assets: prepared.manifest }, null, 2)
    });
  }
  return {
    path: `${folder}/index.html`,
    assets: prepared.manifest.map(m => ({ path: `${folder}/${m.relativePath}`, mimeType: m.mimeType, sourceMediaId: m.sourceMediaId }))
  };
}

/**
 * Builds structured ZIP archive entries for an entire Schema v3 course project.
 * Every component becomes its own folder (`index.html` + `assets/`), so nothing depends on
 * the Builder, IndexedDB, or a browser session. Throws CourseExportError instead of shipping
 * a package with missing or temporary media.
 * @param {string} projectId
 * @param {{ store?: any }} [options] media store override (tests); defaults to the app's IndexedDB store
 * @returns {Promise<Blob>}
 */
export async function buildCourseProjectZip(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found.');

  const entries = [];
  const manifest = {
    courseName: project.name,
    client: project.clientLabel || 'AT&T',
    exportedAt: new Date().toISOString(),
    schemaVersion: project.schemaVersion,
    totalSections: (project.sectionOrder || []).length,
    // RISE-kind components (storyboard import) stand for native Rise blocks and are never part
    // of this package — the manifest's component count should reflect what's actually exported.
    totalComponents: Object.values(project.components || {}).filter(comp => comp.kind !== 'rise').length,
    totalAssets: 0,
    sections: []
  };

  const addGroup = async (groupId, groupName, folder, componentIds) => {
    const group = { sectionId: groupId, sectionName: groupName, folder, components: [] };
    let compIdx = 1;
    for (const compId of componentIds) {
      const comp = project.components?.[compId];
      // RISE-kind components (storyboard import) have no schema-driven config to compile —
      // they never reach the compiler and never appear in the exported package.
      if (!comp || comp.kind === 'rise') continue;
      const compFolder = `${folder}/${padZero(compIdx)}-${sanitizeSlug(comp.name)}`;
      const added = await addComponentToArchive(project, comp, compFolder, entries, options.store);
      manifest.totalAssets += added.assets.length;
      group.components.push({
        componentId: comp.id,
        name: comp.name,
        type: comp.type,
        path: added.path,
        assets: added.assets.map(a => a.path)
      });
      compIdx++;
    }
    manifest.sections.push(group);
  };

  let sectionIdx = 1;
  for (const secId of project.sectionOrder || []) {
    const sec = project.sections?.[secId];
    if (!sec) continue;
    await addGroup(sec.id, sec.name, `${padZero(sectionIdx)}-${sanitizeSlug(sec.name)}`, sec.componentOrder || []);
    sectionIdx++;
  }
  if (project.unsectionedComponentOrder && project.unsectionedComponentOrder.length > 0) {
    await addGroup('unsectioned', 'Unsectioned Components', 'unsectioned-components', project.unsectionedComponentOrder);
  }

  entries.push({ path: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  entries.push({ path: 'project-backup.json', data: JSON.stringify(project, null, 2) });
  entries.push({ path: 'README.md', data: buildCourseReadme(project, manifest) });

  return createZip(entries);
}

function buildCourseReadme(project, manifest) {
  return `# ${project.name}
Course Component Package — prepared for ${project.clientLabel || 'AT&T'}

## What this ZIP is
A set of **standalone interactive components**, one folder per component. Each folder holds an
\`index.html\` and, when the component uses uploaded media, its own \`assets/\` folder. Every
media reference is a relative path inside that folder, so a folder works wherever it is hosted
without the Builder, this browser, or its local media library.

This is **not** a Rise course export and **not** a SCORM package.

${manifest.sections.map(s => `### ${s.sectionName}
${s.components.map(c => `- **${c.name}** (\`${c.type}\`): \`${c.path}\`${c.assets.length ? ` — ${c.assets.length} media file(s)` : ''}`).join('\n')}
`).join('\n')}
## Choosing an export format
| Format | What you get | Use it when |
|---|---|---|
| **This course ZIP** | Every component of the course, each as its own hostable folder | You want to publish or archive the whole course's interactions |
| **Web Package ZIP** (one component) | One \`index.html\` + \`assets/\` | You only need a single block hosted by URL |
| **Copy for Rise** | An HTML fragment for pasting | The block has no uploaded media, or its media is hosted elsewhere |

## Using a component in Articulate Rise 360
Rise cannot import these folders directly. Upload the component folder to a web host you
control (it must serve \`index.html\` and the \`assets/\` folder over **HTTPS**), then in Rise add
a **Multimedia > Embed** (web object) block and point it at that component's \`index.html\` URL.
Fixed-height embeds may clip taller content, so set the embed height to fit.

## What is not included
- \`project-backup.json\` is the editable course definition. It references uploaded media by
  id only, so it does **not** contain the media files themselves. Those files are in each
  component's \`assets/\` folder.
- The Builder's media library is stored in the authoring browser and is not part of this ZIP.

Exported ${manifest.exportedAt} — ${manifest.totalComponents} component(s), ${manifest.totalAssets} media file(s).
`;
}

/**
 * Triggers browser download of the complete course project ZIP.
 * @param {string} projectId
 */
export async function downloadCourseProjectZip(projectId) {
  const project = getProject(projectId);
  const zipBlob = await buildCourseProjectZip(projectId);
  const filename = `${sanitizeSlug(project?.name || 'course')}-full-package.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Shows an interactive Pre-Export Review modal dialog before package generation.
 * @param {Object} options
 * @param {string} options.projectId
 * @param {Function} [options.onProceed]
 * @param {Function} [options.onViewQa]
 * @returns {Promise<boolean>}
 */
export function showPreExportReviewDialog(options, maybeOnProceed = null, maybeOnViewQa = null) {
  let projectId;
  let onProceed;
  let onViewQa;

  if (typeof options === 'string') {
    projectId = options;
    onProceed = maybeOnProceed;
    onViewQa = maybeOnViewQa;
  } else if (options && typeof options === 'object') {
    projectId = options.projectId;
    onProceed = options.onProceed;
    onViewQa = options.onViewQa;
  }

  return new Promise((resolve) => {
    const project = getProject(projectId);
    if (!project) {
      resolve(false);
      return;
    }

    const previouslyFocused = document.activeElement;
    // The dialog opens immediately on the cheap structure checks and updates in place when the
    // full Preflight run finishes. It is the same run Course QA and the editor use, so the
    // counts match. Until then Export stays disabled and nothing claims "passed".
    let readiness = null;
    let readinessFailed = false;
    const readinessPromise = getCourseReadiness(project, auditCourseProject);

    const existing = document.getElementById('att-export-review-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'att-export-review-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'att-export-review-title');

    const escapeHtml = (str) => {
      if (typeof str !== 'string') return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    const build = () => {
      const qaReport = readiness || auditCourseProject(project);
      const pending = !readiness && !readinessFailed;
      const totalSecs = (project.sectionOrder || []).length;
      const totalComps = qaReport.totalComponents;
      const hasBlockers = qaReport.counts.blockers > 0;
      const hasErrors = qaReport.counts.errors > 0;
      const hasWarnings = qaReport.counts.warnings > 0;
      const hasDrafts = qaReport.editorial.draftCount > 0;
    // The actual findings, not just counts, so the dialog agrees with Course QA line for line.
    const listed = qaReport.componentReports.flatMap(report => report.issues
      .filter(issue => issue.severity === 'blocker' || issue.severity === 'error' || issue.severity === 'warning')
      .map(issue => ({ issue, name: report.component.name })));
    const findingsHtml = listed.length ? `
          <div style="border: 1px solid var(--att-border, #DCDFE3); border-radius: 12px; padding: 14px; font-size: 0.8125rem;">
            <div style="font-weight: 700; margin-bottom: 6px; color: var(--att-heading-contrast, #000);">Findings (${listed.length})</div>
            <ul style="margin: 0; padding-left: 18px; line-height: 1.5; max-height: 180px; overflow: auto;">
              ${listed.slice(0, 12).map(({ issue, name }) => `<li><strong>${escapeHtml(issue.severity)}</strong> — ${escapeHtml(name)}: ${escapeHtml(issue.title)}${issue.formats?.length && issue.source === 'preflight' ? ` <span style="color: #555;">(affects ${escapeHtml(issue.formats.join(', '))})</span>` : ''}</li>`).join('')}
              ${listed.length > 12 ? `<li>…and ${listed.length - 12} more in Course QA.</li>` : ''}
            </ul>
          </div>` : '';

      return `
      <div class="modal-card" style="max-width: 640px;">
        <div class="modal-header">
          <div>
            <h2 id="att-export-review-title" class="modal-title">Pre-Export Package Review</h2>
            <p style="margin: 4px 0 0 0; font-size: 0.8125rem; color: var(--att-text-muted, #707780);">
              Review package contents, QA findings, and readiness status before generating ZIP
            </p>
          </div>
          <button id="att-export-review-close-btn" class="project-menu-btn" aria-label="Close review dialog" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Course Info Summary Card -->
          <div style="background: var(--att-grey-1, #F3F4F5); border: 1px solid var(--att-border, #DCDFE3); border-radius: 12px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div>
                <span class="project-client-badge" style="margin-bottom: 4px; display: inline-block;">${escapeHtml(project.clientLabel || 'AT&T')}</span>
                <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700; color: var(--att-heading-contrast, #000000);">${escapeHtml(project.name)}</h3>
              </div>
              <span class="project-card-status ${qaReport.overallStatusClass}" style="margin: 0; font-size: 0.75rem; font-weight: 700;">${escapeHtml(qaReport.overallStatus)}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.8125rem;">
              <div style="background: var(--att-surface, #FFFFFF); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--att-border, #DCDFE3);">
                <div style="color: var(--att-text-muted, #707780); font-size: 0.75rem;">Structure</div>
                <div style="font-weight: 700; color: var(--att-text, #000);">${totalSecs} ${totalSecs === 1 ? 'Section' : 'Sections'} · ${totalComps} ${totalComps === 1 ? 'Component' : 'Components'}</div>
              </div>
              <div style="background: var(--att-surface, #FFFFFF); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--att-border, #DCDFE3);">
                <div style="color: var(--att-text-muted, #707780); font-size: 0.75rem;">Editorial Status</div>
                <div style="font-weight: 700; color: var(--att-text, #000);">${qaReport.editorial.readyCount} Ready · ${qaReport.editorial.draftCount} Draft</div>
              </div>
              <div style="background: var(--att-surface, #FFFFFF); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--att-border, #DCDFE3);">
                <div style="color: var(--att-text-muted, #707780); font-size: 0.75rem;">Technical QA</div>
                <div style="font-weight: 700; color: var(--att-text, #000);">${pending ? 'Running checks…' : readinessFailed ? 'Not completed' : escapeHtml(describeTechnicalStatus(qaReport).replace(/^Technical checks: /, ''))}</div>
              </div>
            </div>
          </div>

          <!-- Canonical QA Status Notice Box -->
          ${pending && !hasBlockers ? `
            <div role="status" style="background: rgba(2, 119, 189, 0.06); border: 1px solid rgba(2, 119, 189, 0.25); border-radius: 12px; padding: 14px; font-size: 0.8125rem;">
              <strong>Running technical checks…</strong> The same Preflight checks the editor uses are being applied to every component. Export becomes available when they finish.
            </div>
          ` : hasBlockers ? `
            <div style="background: rgba(224, 88, 77, 0.08); border: 1px solid rgba(224, 88, 77, 0.3); border-radius: 12px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E0584D" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <div>
                <div style="font-weight: 700; font-size: 0.875rem; color: #E0584D; margin-bottom: 4px;">Export Blocked (${qaReport.counts.blockers} Blocker${qaReport.counts.blockers > 1 ? 's' : ''})</div>
                <p style="margin: 0; font-size: 0.8125rem; color: var(--att-text, #000); line-height: 1.4;">
                  One or more components have critical blockers that prevent generating functional web packages. Please resolve them in Course QA before exporting.
                </p>
              </div>
            </div>
          ` : hasErrors ? `
            <div style="background: rgba(216, 67, 21, 0.08); border: 1px solid rgba(216, 67, 21, 0.3); border-radius: 12px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D84315" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <div>
                <div style="font-weight: 700; font-size: 0.875rem; color: #D84315; margin-bottom: 4px;">Technical Errors Detected (${qaReport.counts.errors} Error${qaReport.counts.errors > 1 ? 's' : ''}, ${qaReport.counts.warnings} Warning${qaReport.counts.warnings > 1 ? 's' : ''})</div>
                <p style="margin: 0; font-size: 0.8125rem; color: var(--att-text, #000); line-height: 1.4;">
                  Technical quality errors exist (such as missing item titles). Exporting now is intended only for development drafts.
                </p>
              </div>
            </div>
          ` : (hasWarnings || hasDrafts) ? `
            <div style="background: rgba(255, 153, 0, 0.08); border: 1px solid rgba(255, 153, 0, 0.3); border-radius: 12px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <div>
                <div style="font-weight: 700; font-size: 0.875rem; color: #B45309; margin-bottom: 4px;">Readiness Notice (${qaReport.editorial.draftCount} Draft${qaReport.editorial.draftCount !== 1 ? 's' : ''}, ${qaReport.counts.warnings} Warning${qaReport.counts.warnings !== 1 ? 's' : ''})</div>
                <p style="margin: 0; font-size: 0.8125rem; color: var(--att-text, #000); line-height: 1.4;">
                  Course components are still marked as Draft or have non-blocking warnings. You can export now for drafting, or review in Course QA first.
                </p>
              </div>
            </div>
          ` : `
            <div style="background: rgba(0, 138, 0, 0.08); border: 1px solid rgba(0, 138, 0, 0.3); border-radius: 12px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008A00" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <div>
                <div style="font-weight: 700; font-size: 0.875rem; color: #008A00; margin-bottom: 4px;">No blocking issues or warnings found</div>
                <p style="margin: 0; font-size: 0.8125rem; color: var(--att-text, #000); line-height: 1.4;">
                  ${readinessFailed
                    ? 'The full technical checks could not run, so only basic structure checks were applied. '
                    : 'The automated Preflight checks found nothing to fix. '}Automated checks cannot certify accessibility conformance or Rise compatibility; review the package in Rise before publishing.
                </p>
              </div>
            </div>
          `}

          ${findingsHtml}

          <!-- Package Details -->
          <div style="border: 1px solid var(--att-border, #DCDFE3); border-radius: 12px; padding: 14px; font-size: 0.8125rem;">
            <div style="font-weight: 700; margin-bottom: 6px; color: var(--att-heading-contrast, #000);">Package Format Details:</div>
            <ul style="margin: 0; padding-left: 18px; color: var(--att-text-muted, #555); line-height: 1.5;">
              <li>Organized folders for each section and component HTML bundle.</li>
              <li>Includes <code>manifest.json</code> course hierarchy and <code>project-backup.json</code>.</li>
              <li>Every uploaded media file is packaged inside each component's own <code>assets/</code> folder; export stops if any file is missing.</li>
              <li>Includes <code>README.md</code> explaining hosting: components are standalone pages to host over HTTPS and embed in Rise, not a Rise or SCORM import.</li>
            </ul>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between;">
          <button id="att-export-review-qa-btn" class="btn-att-secondary" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Review in Course QA
          </button>
          
          <div style="display: flex; gap: 8px;">
            <button id="att-export-review-cancel-btn" class="btn-att-secondary" type="button">Cancel</button>
            ${pending && !hasBlockers ? `
              <button id="att-export-review-proceed-btn" class="btn-att-primary" type="button" disabled title="Checks are still running" style="opacity: 0.5; cursor: not-allowed;">
                Checking…
              </button>
            ` : hasBlockers ? `
              <button id="att-export-review-proceed-btn" class="btn-att-primary" type="button" disabled title="Fix blockers before export" style="opacity: 0.5; cursor: not-allowed;">
                Export Blocked
              </button>
            ` : hasErrors ? `
              <button id="att-export-review-proceed-btn" class="btn-att-primary" type="button" style="background: #D84315;">
                Export Draft Package With Known Errors
              </button>
            ` : (hasWarnings || hasDrafts) ? `
              <button id="att-export-review-proceed-btn" class="btn-att-primary" type="button">
                Export Anyway
              </button>
            ` : `
              <button id="att-export-review-proceed-btn" class="btn-att-primary" type="button">
                Download Package
              </button>
            `}
          </div>
        </div>
      </div>
    `;
    };
    overlay.innerHTML = build();

    const modalRoot = document.getElementById('modal-root') || document.body;
    modalRoot.appendChild(overlay);

    let cleanupIsolation = null;
    const cleanup = () => {
      if (cleanupIsolation) cleanupIsolation();
      overlay.remove();
    };

    cleanupIsolation = isolateModal(overlay, {
      triggerElement: previouslyFocused,
      onDismiss: () => {
        cleanup();
        resolve(false);
      }
    });

    /** @type {HTMLElement[]} */
    // @ts-ignore
    const focusableElements = Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => el instanceof HTMLElement);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    const bind = () => {
      const closeBtn = overlay.querySelector('#att-export-review-close-btn');
      const cancelBtn = overlay.querySelector('#att-export-review-cancel-btn');
      const qaBtn = overlay.querySelector('#att-export-review-qa-btn');
      const proceedBtn = /** @type {HTMLButtonElement|null} */ (overlay.querySelector('#att-export-review-proceed-btn'));
      closeBtn?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      cancelBtn?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      qaBtn?.addEventListener('click', () => {
        cleanup();
        resolve(false);
        if (onViewQa) onViewQa(projectId);
      });

      proceedBtn?.addEventListener('click', async () => {
        if (proceedBtn?.disabled) return;
        cleanup();
        resolve(true);
        if (onProceed) {
          await onProceed(projectId);
        } else {
          try {
            await downloadCourseProjectZip(projectId);
          } catch (err) {
            showToast(`Export failed: ${err.message}`, 'error', 8000);
          }
        }
      });

    };
    bind();

    readinessPromise.then(report => { readiness = report; }, () => { readinessFailed = true; }).then(() => {
      if (!overlay.isConnected) return;
      const focusedId = document.activeElement?.id;
      overlay.innerHTML = build();
      bind();
      if (focusedId) /** @type {HTMLElement|null} */ (overlay.querySelector(`#${focusedId}`))?.focus();
    });
  });
}

