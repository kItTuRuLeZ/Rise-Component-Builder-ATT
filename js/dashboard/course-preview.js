/**
 * Rise Component Builder AT&T — Real Full-Course Sequential Preview Controller
 * Compiles and renders real authored components in sequence using the canonical preview compiler.
 */

import { getProject } from '../storage.js';
import { generateIframeContent } from '../preview.js';
import { COMPONENT_MODULES, COMPONENT_REGISTRY, normalizeComponentType } from '../component-registry.js';
import { toRgba as colorToRgba, escapeHTML, pluralize } from '../utilities.js';
import { showPreExportReviewDialog, buildCourseProjectZip, downloadCourseProjectZip } from './project-export.js';
import { showToast } from '../toast.js';

export class CoursePreviewView {
  constructor({ container = null, projectId = null, onBack = null, onOpenQa = null, onOpenPreview = null, onEditComponent = null } = {}) {
    this.container = container;
    this.projectId = projectId;
    this.onBack = onBack;
    this.onOpenQa = onOpenQa;
    this.onOpenPreview = onOpenPreview;
    this.onEditComponent = onEditComponent;

    this.state = {
      deviceMode: 'desktop', // 'desktop' | 'tablet' | 'mobile-lg' | 'mobile'
      fitToWidth: false,
      showBoundaries: false,
      showSafeArea: false,
      isFullscreen: false,
      previewKey: Date.now()
    };

    this.boundResizeMessageListener = this.handleIframeResizeMessage.bind(this);
  }

  mount() {
    window.addEventListener('message', this.boundResizeMessageListener);
    this.render();
  }

  unmount() {
    window.removeEventListener('message', this.boundResizeMessageListener);
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  handleIframeResizeMessage(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'rcb-iframe-height' && event.data.frameId && typeof event.data.height === 'number') {
      const iframe = this.container?.querySelector(`#${event.data.frameId}`);
      if (iframe) {
        const targetHeight = Math.max(Math.ceil(event.data.height), 140);
        const currentHeight = parseInt(iframe.style.height || '0', 10);
        if (Math.abs(currentHeight - targetHeight) >= 4) {
          iframe.style.height = `${targetHeight}px`;
        }
      }
    }
  }

  getOrderedComponents(project) {
    const items = [];
    if (!project) return items;

    // Sections in order
    for (const secId of project.sectionOrder || []) {
      const sec = project.sections?.[secId];
      if (!sec) continue;
      items.push({ type: 'section-header', id: sec.id, title: sec.name, description: sec.description });
      for (const compId of sec.componentOrder || []) {
        const comp = project.components?.[compId];
        if (comp) {
          items.push({ type: 'component', component: comp, sectionTitle: sec.name, sectionId: sec.id });
        }
      }
    }

    // Unsectioned components
    if (project.unsectionedComponentOrder && project.unsectionedComponentOrder.length > 0) {
      items.push({ type: 'section-header', id: 'unsectioned', title: 'Unsectioned Components', description: 'Additional standalone components in this course project' });
      for (const compId of project.unsectionedComponentOrder) {
        const comp = project.components?.[compId];
        if (comp) {
          items.push({ type: 'component', component: comp, sectionTitle: 'Unsectioned', sectionId: null });
        }
      }
    }

    return items;
  }

  compileComponentHtml(project, comp) {
    try {
      const canonicalType = normalizeComponentType(comp.type);
      const appState = {
        selectedComponent: { id: canonicalType },
        config: comp.config || {},
        componentOverrides: comp.styleOverrides || {},
        currentProjectId: comp.id,
        activeTheme: project.theme,
        uiTheme: project.uiTheme || 'light'
      };

      const html = generateIframeContent(appState, COMPONENT_MODULES, colorToRgba);

      // Inject auto-resizing script and safe height style into the iframe HTML
      const autoResizeScript = `
        <style>
          html, body {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
          }
        </style>
        <script>
          (function() {
            var lastReported = 0;
            function reportHeight() {
              try {
                var doc = document.documentElement;
                var body = document.body;
                if (!body) return;
                var wrapper = document.querySelector('.rise-block-wrapper') || document.querySelector('.rcb-component-root') || body.firstElementChild || body;
                var wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
                var wrapperHeight = wrapperRect && wrapperRect.height ? Math.ceil(wrapperRect.height) : 0;
                
                var bodyStyle = window.getComputedStyle ? window.getComputedStyle(body) : null;
                var pTop = bodyStyle ? (parseFloat(bodyStyle.paddingTop) || 0) : 30;
                var pBottom = bodyStyle ? (parseFloat(bodyStyle.paddingBottom) || 0) : 30;
                
                // Full measured height including wrapper, body padding, and bottom buffer for buttons & focus rings
                var computedFullHeight = (wrapperHeight > 0) ? Math.ceil(wrapperHeight + pTop + pBottom + 24) : Math.max(body.scrollHeight + 16, 140);
                var finalHeight = Math.max(computedFullHeight, body.scrollHeight + 16, 140);

                if (Math.abs(finalHeight - lastReported) >= 4) {
                  lastReported = finalHeight;
                  window.parent.postMessage({
                    type: 'rcb-iframe-height',
                    frameId: 'iframe-comp-${comp.id}',
                    height: finalHeight
                  }, '*');
                }
              } catch(e) {}
            }
            window.addEventListener('load', function() { setTimeout(reportHeight, 60); setTimeout(reportHeight, 350); });
            window.addEventListener('resize', reportHeight);
            if (window.ResizeObserver && document.body) {
              var observer = new ResizeObserver(function() { reportHeight(); });
              var target = document.querySelector('.rise-block-wrapper') || document.body.firstElementChild || document.body;
              if (target) observer.observe(target);
            }
            document.addEventListener('click', function() { setTimeout(reportHeight, 80); setTimeout(reportHeight, 350); });
            document.addEventListener('change', function() { setTimeout(reportHeight, 80); });
            setTimeout(reportHeight, 100);
            setTimeout(reportHeight, 600);
            setTimeout(reportHeight, 1500);
          })();
        </script>
      `;

      return {
        success: true,
        html: html.replace('</body>', `${autoResizeScript}</body>`)
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Failed to compile component preview'
      };
    }
  }

  render() {
    if (!this.container) return;
    const project = getProject(this.projectId);
    const orderedItems = this.getOrderedComponents(project);

    let maxCanvasWidth = '1080px';
    let deviceLabel = 'Desktop View (1080px max)';
    if (this.state.deviceMode === 'tablet') {
      maxCanvasWidth = '768px';
      deviceLabel = 'Tablet View (768px)';
    } else if (this.state.deviceMode === 'mobile-lg') {
      maxCanvasWidth = '430px';
      deviceLabel = 'Large Mobile (430px)';
    } else if (this.state.deviceMode === 'mobile') {
      maxCanvasWidth = '375px';
      deviceLabel = 'Mobile (375px)';
    }

    if (this.state.fitToWidth) {
      maxCanvasWidth = '100%';
    }

    this.container.innerHTML = `
      <div class="project-workspace-view ${this.state.isFullscreen ? 'preview-fullscreen-mode' : ''}">
        <header class="workspace-header course-preview-toolbar">
          <div class="workspace-breadcrumbs">
            <button id="preview-back-btn" class="breadcrumb-back-btn" title="Return to Course Workspace" aria-label="Return to Course Workspace: ${escapeHTML(project?.name || 'Course Project')}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>${escapeHTML(project?.name || 'Course Project')}</span>
            </button>
            <span class="breadcrumb-separator" aria-hidden="true">/</span>
            <span class="breadcrumb-current">Course Preview</span>
          </div>

          <!-- Workflow Segment Control (Build -> Preview -> QA -> Export) -->
          <div class="workflow-nav-segment" role="tablist" aria-label="Course workflow steps">
            <button class="workflow-tab-btn" id="wp-tab-build" role="tab" aria-selected="false" title="Build & Edit Course">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Build</span>
            </button>
            <button class="workflow-tab-btn active" id="wp-preview-btn" role="tab" aria-selected="true" title="Launch Full Course Preview">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Course Preview</span>
            </button>
            <button class="workflow-tab-btn" id="wp-qa-btn" role="tab" aria-selected="false" title="Course Quality & Compliance QA">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <polyline points="9 12 11 14 15 10"></polyline>
              </svg>
              <span>QA Preflight</span>
            </button>
            <button class="workflow-tab-btn" id="wp-export-btn" role="tab" aria-selected="false" title="Export for Hosting: a hosted ZIP of this course's components. It is not a project backup.">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export for Hosting</span>
            </button>
          </div>

          <div class="workspace-header-actions course-preview-actions">
            <!-- Viewport Switcher -->
            <div class="preview-mode-pill-group" role="group" aria-label="Device viewport mode">
              <button class="filter-chip ${this.state.deviceMode === 'desktop' ? 'active' : ''}" data-device="desktop" title="Desktop mode (1080px max)" aria-label="Desktop view" aria-pressed="${this.state.deviceMode === 'desktop'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                <span class="device-btn-text">Desktop</span>
              </button>
              <button class="filter-chip ${this.state.deviceMode === 'tablet' ? 'active' : ''}" data-device="tablet" title="Tablet mode (768px)" aria-label="Tablet view (768px)" aria-pressed="${this.state.deviceMode === 'tablet'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                <span class="device-btn-text">Tablet</span>
              </button>
              <button class="filter-chip ${this.state.deviceMode === 'mobile-lg' ? 'active' : ''}" data-device="mobile-lg" title="Large Mobile mode (430px)" aria-label="Large mobile view (430px)" aria-pressed="${this.state.deviceMode === 'mobile-lg'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                <span class="device-btn-text">430px</span>
              </button>
              <button class="filter-chip ${this.state.deviceMode === 'mobile' ? 'active' : ''}" data-device="mobile" title="Mobile mode (375px)" aria-label="Mobile view (375px)" aria-pressed="${this.state.deviceMode === 'mobile'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                <span class="device-btn-text">375px</span>
              </button>
            </div>

            <!-- Display Toggles & Utilities -->
            <div class="preview-util-btn-group">
              <button class="btn btn-secondary btn-sm ${this.state.showBoundaries ? 'active' : ''}" id="btn-toggle-boundaries" title="Toggle block boundaries" aria-pressed="${this.state.showBoundaries}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h4v2H5v2H3V3zm14 0h4v4h-2V5h-2V3zM3 17h2v2h2v2H3v-4zm18 0v4h-4v-2h2v-2h2z"></path></svg>
                <span class="btn-text-label">${this.state.showBoundaries ? 'Boundaries On' : 'Boundaries'}</span>
              </button>
              <button class="btn btn-secondary btn-sm ${this.state.showSafeArea ? 'active' : ''}" id="btn-toggle-safe-area" title="Toggle 740px Rise safe area overlay" aria-pressed="${this.state.showSafeArea}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <span class="btn-text-label">${this.state.showSafeArea ? 'Safe Area On' : 'Safe Area'}</span>
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-reset-preview" title="Reset all component interactions" aria-label="Reset all component interactions">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                <span class="btn-text-label">Reset Interactions</span>
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-toggle-fullscreen" title="${this.state.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}" aria-label="${this.state.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                <span class="btn-text-label">${this.state.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              </button>
            </div>
          </div>
        </header>

        <main class="workspace-container course-preview-workspace-main" style="display: flex; flex-direction: column; align-items: center; background: var(--bg-canvas, #F4F6F9); min-height: calc(100vh - 120px); padding: 24px 16px;">
          <div class="course-preview-header-meta" style="width: 100%; max-width: ${maxCanvasWidth}; transition: max-width 0.25s ease; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px;">
            <h1 class="workspace-title" style="font-size: 1.5rem; font-weight: 700; margin: 0; color: #111;">Course Preview</h1>
            <div class="preview-viewport-info-banner" style="font-size: 0.8125rem; color: #555;">
              Showing: <strong>${deviceLabel}</strong> · ${pluralize(orderedItems.filter(i => i.type === 'component').length, 'component')} in sequence
            </div>
          </div>

          <div class="course-preview-canvas ${this.state.showSafeArea ? 'with-safe-area-overlay' : ''}" 
               style="width: 100%; max-width: ${maxCanvasWidth}; transition: max-width 0.25s ease; display: flex; flex-direction: column; gap: 36px;">
            ${(() => {
              let compCounter = 0;
              return orderedItems.map((item, index) => {
                if (item.type === 'section-header') {
                  return `
                    <div class="course-preview-section-header" style="border-bottom: 2px solid var(--att-cobalt, #00388F); padding-bottom: 10px; margin-top: ${index === 0 ? '0' : '20px'};">
                      <h2 style="font-size: 1.375rem; font-weight: 700; color: var(--att-cobalt, #00388F); margin: 0 0 4px 0;">${escapeHTML(item.title)}</h2>
                      ${item.description ? `<p style="font-size: 0.875rem; color: #666; margin: 0;">${escapeHTML(item.description)}</p>` : ''}
                    </div>
                  `;
                }

                compCounter++;
                const comp = item.component;
                const compiled = this.compileComponentHtml(project, comp);
                const registryEntry = COMPONENT_REGISTRY.find(r => r.id === comp.type);
                const typeName = registryEntry?.name || comp.type;

                return `
                  <div class="course-preview-block ${this.state.showBoundaries ? 'outline-boundary' : ''}" 
                       id="preview-block-${comp.id}"
                       style="background: #ffffff; border: 1px solid #DCDFE3; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.04); position: relative;">
                    <div class="course-preview-block-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; background: #FAFAFA; border-bottom: 1px solid #EFEFEF;">
                      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                        <span class="preview-comp-order-badge preview-sequence-badge" style="font-size: 0.75rem; font-weight: 700; background: #E4E7EC; color: #333; padding: 2px 8px; border-radius: 12px; flex-shrink: 0;">${compCounter}</span>
                        <h3 style="font-size: 0.9375rem; font-weight: 600; color: #111; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(comp.name)}</h3>
                        <span class="component-type-badge" style="font-size: 0.75rem; background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F); padding: 2px 8px; border-radius: 4px; flex-shrink: 0;">${escapeHTML(typeName)}</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-preview-comp" data-comp-id="${comp.id}" aria-label="Edit component: ${escapeHTML(comp.name)}" style="padding: 6px 12px; font-size: 0.8125rem; display: inline-flex; align-items: center; gap: 6px;">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                          <span>Edit Component</span>
                        </button>
                      </div>
                    </div>

                  <div class="component-rendered-container" style="padding: 16px; min-height: 180px; position: relative; background: #ffffff;">
                    ${compiled.success ? `
                      <iframe 
                        id="iframe-comp-${comp.id}"
                        class="course-preview-component-frame"
                        srcdoc="${escapeHTML(compiled.html)}"
                        sandbox="allow-scripts allow-same-origin"
                        scrolling="no"
                        title="Preview of ${escapeHTML(comp.name)}"
                        style="width: 100%; border: none; min-height: 200px; display: block; overflow: hidden; transition: height 0.2s ease;">
                      </iframe>
                    ` : `
                      <div class="course-preview-error-card" style="padding: 20px; background: #FFF5F5; border: 1px solid #FEB2B2; border-radius: 8px; color: #C53030;">
                        <h4 style="margin: 0 0 8px 0; font-size: 0.9375rem; font-weight: 700;">Could not render ${escapeHTML(comp.name)}</h4>
                        <p style="margin: 0 0 12px 0; font-size: 0.875rem;">${escapeHTML(compiled.error)}</p>
                        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-preview-comp" data-comp-id="${comp.id}">
                          Open in Editor to Fix
                        </button>
                      </div>
                    `}
                  </div>
                </div>
              `;
            }).join('');
            })()}

            ${orderedItems.length === 0 ? `
              <div class="dashboard-empty-state" style="width: 100%; text-align: center; padding: 48px 24px; background: #ffffff; border-radius: 16px; border: 1px dashed #DCDFE3;">
                <h3 class="empty-state-title" style="margin: 0 0 8px 0; font-size: 1.25rem;">No components in this course project yet</h3>
                <p class="empty-state-subtitle" style="color: #666; margin: 0 0 20px 0;">Add sections and components in the Course Workspace to preview the complete interactive flow here.</p>
                <button type="button" class="btn btn-primary" id="preview-empty-back-btn">Return to Course Workspace</button>
              </div>
            ` : ''}
          </div>
        </main>
      </div>
    `;

    this.updateToolbarHeight();
    this.attachEventListeners();
  }

  updateToolbarHeight() {
    if (typeof window === 'undefined') return;
    const header = this.container?.querySelector('.workspace-header');
    if (header) {
      const height = header.offsetHeight || 64;
      document.documentElement.style.setProperty('--cp-toolbar-height', `${height}px`);
    }
  }

  attachEventListeners() {
    this.container.querySelector('#preview-back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelector('#wp-tab-build')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelector('#wp-qa-btn')?.addEventListener('click', () => {
      if (this.onOpenQa) this.onOpenQa(this.projectId);
    });

    this.container.querySelector('#wp-export-btn')?.addEventListener('click', () => {
      showPreExportReviewDialog({
        projectId: this.projectId,
        onProceed: async (id) => {
          try {
            await downloadCourseProjectZip(id);
            showToast('Course package exported successfully!', 'success');
          } catch (err) {
            console.error('Export failed:', err);
            showToast(`Export failed: ${err.message}`, 'error', 8000);
          }
        },
        onViewQa: this.onOpenQa
      });
    });

    this.container.querySelector('#preview-empty-back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelectorAll('[data-device]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.deviceMode = btn.dataset.device;
        this.state.fitToWidth = false;
        this.render();
      });
    });

    this.container.querySelector('#btn-toggle-boundaries')?.addEventListener('click', () => {
      this.state.showBoundaries = !this.state.showBoundaries;
      this.render();
    });

    this.container.querySelector('#btn-toggle-safe-area')?.addEventListener('click', () => {
      this.state.showSafeArea = !this.state.showSafeArea;
      this.render();
    });

    this.container.querySelector('#btn-reset-preview')?.addEventListener('click', () => {
      this.state.previewKey = Date.now();
      this.render();
    });

    this.container.querySelector('#btn-toggle-fullscreen')?.addEventListener('click', () => {
      this.state.isFullscreen = !this.state.isFullscreen;
      this.render();
    });

    this.container.querySelectorAll('[data-action="edit-preview-comp"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const project = getProject(this.projectId);
        const comp = project?.components?.[compId];
        if (comp && this.onEditComponent) {
          this.onEditComponent(project, comp);
        }
      });
    });
  }
}

export function compileCoursePreview(project) {
  if (!project) return '';
  const view = new CoursePreviewView({ projectId: project.id });
  const orderedItems = view.getOrderedComponents(project);
  let outputHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHTML(project.name || 'Course Preview')}</title></head><body>`;
  for (const item of orderedItems) {
    if (item.type === 'section-header') {
      outputHtml += `<h2>${escapeHTML(item.title)}</h2>`;
    } else if (item.type === 'component') {
      const res = view.compileComponentHtml(project, item.component);
      if (res.success) {
        outputHtml += `<div class="preview-item"><h3>${escapeHTML(item.component.name)}</h3>${res.html}</div>`;
      } else {
        outputHtml += `<div class="preview-error">Could not render ${escapeHTML(item.component.name)}: ${res.error}</div>`;
      }
    }
  }
  outputHtml += `</body></html>`;
  return outputHtml;
}

