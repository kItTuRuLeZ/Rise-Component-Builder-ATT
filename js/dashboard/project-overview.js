/**
 * Rise Component Builder AT&T — Project Overview & Multi-Component Workspace Controller
 * Manages course sections, component instances, editorial lifecycle, contextual inspector,
 * live component canvas, component drawer, and focus editor continuity.
 */

import {
  getProject, saveProject, loadFavorites, saveFavorites, loadRecentlyUsed
} from '../storage.js';
import {
  createComponentInstance, createSection
} from '../project-schema.js';
import {
  COMPONENT_REGISTRY, CATEGORIES, getDefaultConfig, getComponentById,
  searchComponents, COMPONENT_MODULES, normalizeComponentType
} from '../component-registry.js';
import { showPromptDialog, showConfirmDialog, isolateModal } from './att-modal.js';
import { getComponentThumbnailSvg } from './component-thumbnails.js';
import { auditCourseProject } from './project-qa.js';
import { generateIframeContent } from '../preview.js';
import { toRgba as colorToRgba, escapeHTML } from '../utilities.js';
import { showToast } from '../toast.js';
import { getBuiltInTheme, DEFAULT_THEME_ID } from '../themes.js';
import { defaultBlockHeader } from '../state.js';

export class ProjectOverviewView {
  constructor({
    container,
    projectId,
    onBackToDashboard,
    onEditComponent,
    onOpenPreview,
    onOpenMedia,
    onOpenQa,
    onExportProject
  }) {
    this.container = container;
    this.projectId = projectId;
    this.onBackToDashboard = onBackToDashboard;
    this.onEditComponent = onEditComponent;
    this.onOpenPreview = onOpenPreview;
    this.onOpenMedia = onOpenMedia;
    this.onOpenQa = onOpenQa;
    this.onExportProject = onExportProject;

    const initialFavorites = loadFavorites();
    const initialRecents = loadRecentlyUsed();

    this.state = {
      isPickerOpen: false,
      pickerTargetSectionId: null, // null means unsectioned
      lastActiveSectionId: null,
      pickerSearch: '',
      pickerCategory: 'all', // 'all' | 'recommended' | 'favorites' | 'recent' | categoryId
      previewDetailsComp: null,
      activeMenuId: null,
      courseStructureSearch: '',
      courseStructureFilter: 'all', // 'all' | 'draft' | 'in_review' | 'ready'
      selectedType: 'course', // 'course' | 'section' | 'component'
      selectedId: null,
      canvasDevice: 'desktop', // 'desktop' | 'tablet' | 'mobile'
      favorites: new Set(initialFavorites),
      recentlyUsed: initialRecents,
      outlineCollapsed: false
    };

    this.cleanupPickerIsolation = null;
    this.cleanupDetailsIsolation = null;
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
    this.boundResizeMessageListener = this.handleIframeResizeMessage.bind(this);
  }

  getModalHost() {
    return document.getElementById('modal-root') || this.container;
  }

  mount() {
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('click', this.handleMenuItemClick, true);
    window.addEventListener('message', this.boundResizeMessageListener);

    const project = this.getProject();
    if (project) {
      if (this.state.selectedType === 'component' && this.state.selectedId) {
        if (!project.components || !project.components[this.state.selectedId]) {
          const fallbackId = this.getFirstComponentId(project);
          if (fallbackId) {
            this.state.selectedType = 'component';
            this.state.selectedId = fallbackId;
          } else {
            this.state.selectedType = 'course';
            this.state.selectedId = null;
          }
        }
      } else if (this.state.selectedType === 'section' && this.state.selectedId) {
        if (this.state.selectedId !== 'unsectioned' && (!project.sections || !project.sections[this.state.selectedId])) {
          this.state.selectedType = 'course';
          this.state.selectedId = null;
        }
      } else if (!this.state.selectedId) {
        const firstCompId = this.getFirstComponentId(project);
        if (firstCompId) {
          this.state.selectedType = 'component';
          this.state.selectedId = firstCompId;
        } else {
          this.state.selectedType = 'course';
          this.state.selectedId = null;
        }
      }
    }

    this.render();

    if (this.state.selectedType === 'component' && this.state.selectedId) {
      this.focusAndScrollSelectedComponent(this.state.selectedId);
    }
  }

  focusAndScrollSelectedComponent(compId) {
    if (typeof window === 'undefined' || !this.container) return;
    setTimeout(() => {
      const targetRow = this.container.querySelector(`.component-row[data-comp-id="${compId}"]`);
      if (targetRow) {
        if (typeof targetRow.scrollIntoView === 'function') {
          try { targetRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* noop: scrolling the row into view is a best-effort affordance */ }
        }
        const targetBtn = targetRow.querySelector('.component-select-target');
        if (targetBtn && typeof targetBtn.focus === 'function') {
          try { targetBtn.focus(); } catch { /* noop: focusing the row is a best-effort affordance */ }
        }
      }
    }, 50);
  }

  selectNode(type, id = null) {
    this.state.selectedType = type;
    this.state.selectedId = id;
    this.render();
    if (type === 'component' && id) {
      this.focusAndScrollSelectedComponent(id);
    }
  }

  unmount() {
    if (this.cleanupPickerIsolation) {
      this.cleanupPickerIsolation();
      this.cleanupPickerIsolation = null;
    }
    if (this.cleanupDetailsIsolation) {
      this.cleanupDetailsIsolation();
      this.cleanupDetailsIsolation = null;
    }
    const modalHost = this.getModalHost();
    modalHost?.querySelector('#picker-modal-overlay')?.remove();
    modalHost?.querySelector('#details-modal-overlay')?.remove();
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('click', this.handleMenuItemClick, true);
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

  // Choosing an item closes its three-dots menu. Items stop their click from bubbling, so the
  // document handler below never sees it; this capture-phase one does, and removes the menu after
  // the item's own handler has run (a cancelled dialog must not leave the menu hanging open).
  handleMenuItemClick(e) {
    const item = e.target instanceof Element ? e.target.closest('.project-menu-item') : null;
    if (!item) return;
    this.state.activeMenuId = null;
    setTimeout(() => item.closest('.project-action-menu')?.remove(), 0);
  }

  handleDocumentClick(e) {
    if (!e.target.closest('.project-menu-btn') && !e.target.closest('.project-action-menu')) {
      if (this.state.activeMenuId) {
        this.state.activeMenuId = null;
        this.render();
      }
    }
  }

  getProject() {
    return getProject(this.projectId);
  }

  // `render: false` lets a caller that is about to render anyway persist a change without
  // paying for a second full rebuild. That matters beyond performance: each render
  // replaces the modal markup wholesale, so a redundant one detaches the element the
  // previous render just focused and drops focus to <body>.
  updateProject(mutator, { render = true } = {}) {
    const project = this.getProject();
    if (!project) return;
    mutator(project);
    project.updatedAt = new Date().toISOString();
    saveProject(project);
    if (render) this.render();
  }

  getFirstComponentId(project) {
    if (!project) return null;
    for (const secId of project.sectionOrder || []) {
      const sec = project.sections?.[secId];
      if (sec && sec.componentOrder && sec.componentOrder.length > 0) {
        return sec.componentOrder[0];
      }
    }
    if (project.unsectionedComponentOrder && project.unsectionedComponentOrder.length > 0) {
      return project.unsectionedComponentOrder[0];
    }
    return null;
  }

  compileComponentHtml(project, comp) {
    try {
      const canonicalType = normalizeComponentType(comp.type);
      const fakeAppState = {
        selectedComponent: { id: canonicalType },
        config: comp.config || {},
        componentOverrides: comp.styleOverrides || {},
        currentProjectId: comp.id,
        activeTheme: project.theme || getBuiltInTheme(DEFAULT_THEME_ID),
        uiTheme: project.uiTheme || 'light'
      };

      const html = generateIframeContent(fakeAppState, COMPONENT_MODULES, colorToRgba);

      // The `</script>` terminator below is escaped on purpose: this template is
      // injected verbatim into an iframe document, and an unescaped </script> would
      // close the *outer* script block early. eslint sees only the JS string literal
      // and reports the escape as useless, so the rule is off for this template.
      /* eslint-disable no-useless-escape */
      const autoResizeScript = `
        <style>
          html, body {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 20px !important;
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
                var pTop = bodyStyle ? (parseFloat(bodyStyle.paddingTop) || 0) : 20;
                var pBottom = bodyStyle ? (parseFloat(bodyStyle.paddingBottom) || 0) : 20;
                var computedFullHeight = (wrapperHeight > 0) ? Math.ceil(wrapperHeight + pTop + pBottom + 24) : Math.max(body.scrollHeight + 16, 140);
                var finalHeight = Math.max(computedFullHeight, body.scrollHeight + 16, 140);

                if (Math.abs(finalHeight - lastReported) >= 4) {
                  lastReported = finalHeight;
                  window.parent.postMessage({
                    type: 'rcb-iframe-height',
                    frameId: 'canvas-comp-iframe-${comp.id}',
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
            setTimeout(reportHeight, 100);
            setTimeout(reportHeight, 600);
          })();
        <\/script>
      `;
      /* eslint-enable no-useless-escape */

      if (html.includes('</body>')) {
        return html.replace('</body>', `${autoResizeScript}</body>`);
      }
      return `${html}${autoResizeScript}`;
    } catch (err) {
      return `<!DOCTYPE html><html><body><div style="padding:20px;color:#c00;font-family:sans-serif;">Unable to render preview: ${escapeHTML(err.message)}</div></body></html>`;
    }
  }

  render() {
    const project = this.getProject();
    if (!project) {
      this.container.innerHTML = `
        <div class="project-workspace-view">
          <div class="workspace-container" style="padding: 40px; text-align: center;">
            <p style="font-size: 1.125rem; color: #666; margin-bottom: 16px;">Course project not found.</p>
            <button id="wp-back-btn" class="btn btn-primary">Back to Projects</button>
          </div>
        </div>
      `;
      this.container.querySelector('#wp-back-btn')?.addEventListener('click', () => {
        if (this.onBackToDashboard) this.onBackToDashboard();
      });
      return;
    }

    const totalComponents = Object.keys(project.components || {}).length;
    const totalSections = Object.keys(project.sections || {}).length;

    // Filter components according to course structure search & status filter
    const activeFilter = this.state.courseStructureFilter;
    const searchFilter = this.state.courseStructureSearch.toLowerCase().trim();

    this.container.innerHTML = `
      <div class="project-workspace-view">
        <!-- Top Workspace Bar -->
        <header class="workspace-header">
          <div class="workspace-breadcrumbs">
            <button id="wp-back-btn" class="breadcrumb-back-btn" title="Back to Projects Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>Course Projects</span>
            </button>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">${escapeHTML(project.name)}</span>
          </div>

          <!-- Workflow Segment Control (Build -> Preview -> QA -> Export) -->
          <div class="workflow-nav-segment" role="tablist" aria-label="Course workflow steps">
            <button class="workflow-tab-btn active" id="wp-tab-build" role="tab" aria-selected="true" title="Build & Edit Course">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Build</span>
            </button>
            <button class="workflow-tab-btn" id="wp-preview-btn" role="tab" aria-selected="false" title="Launch Full Course Preview">
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
            <button class="workflow-tab-btn" id="wp-export-btn" role="tab" aria-selected="false" title="Export Course Package ZIP">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export Package</span>
            </button>
          </div>

          <div class="workspace-header-actions">
            <button id="wp-media-btn" class="btn btn-secondary btn-sm" title="Project media library">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <span>Media</span>
            </button>
          </div>
        </header>

        <main class="workspace-container workspace-3zone-layout">
          <!-- Zone 1: Interactive Course Outline Panel -->
          <div class="workspace-outline-zone" role="region" aria-label="Course Outline">
            <!-- Course Header Card -->
            <div class="workspace-banner ${this.state.selectedType === 'course' ? 'is-selected' : ''}" id="wp-course-banner">
              <button type="button" class="workspace-banner-select-target" data-action="select-node" data-node-type="course" aria-label="Select Course Overview" aria-pressed="${this.state.selectedType === 'course'}">
                <div class="workspace-banner-info">
                  <div class="workspace-banner-tags">
                    <span class="project-client-badge">${escapeHTML(project.clientLabel || 'AT&T')}</span>
                  </div>
                  <h1 class="workspace-title">
                    <span>${escapeHTML(project.name)}</span>
                  </h1>
                  <p class="workspace-desc">${escapeHTML(project.description || 'Course Outline & Interactive Component Structure')}</p>
                </div>
              </button>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0;">
                <button id="wp-rename-title-btn" class="project-menu-btn" title="Rename course title" aria-label="Rename course title">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
                <div class="workspace-banner-metrics">
                  <span class="section-component-badge">${totalSections} ${totalSections === 1 ? 'section' : 'sections'}</span>
                  <span class="section-component-badge">${totalComponents} ${totalComponents === 1 ? 'component' : 'components'}</span>
                </div>
              </div>
            </div>

            <!-- Course Structure Filter & Controls -->
            <div class="workspace-toolbar">
              <div class="workspace-search-group">
                <input 
                  type="search" 
                  id="cs-search-input" 
                  class="form-input" 
                  placeholder="Search outline…" 
                  aria-label="Search components in course structure"
                  value="${escapeHTML(this.state.courseStructureSearch)}"
                />
                <!-- Quick Filter Chips -->
                <div class="filter-group">
                  <button class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-cs-filter="all">All</button>
                  <button class="filter-chip ${activeFilter === 'draft' ? 'active' : ''}" data-cs-filter="draft">Draft</button>
                  <button class="filter-chip ${activeFilter === 'in_review' ? 'active' : ''}" data-cs-filter="in_review">In Review</button>
                  <button class="filter-chip ${activeFilter === 'ready' ? 'active' : ''}" data-cs-filter="ready">Ready</button>
                </div>
              </div>

              <div class="workspace-toolbar-actions">
                <button id="wp-header-add-comp-btn" class="btn btn-secondary btn-sm" title="Add component to course">
                  + Component
                </button>
                <button id="wp-add-section-btn" class="btn btn-primary btn-sm">
                  + Section
                </button>
              </div>
            </div>

            <!-- Sections List -->
            <div class="sections-list">
              ${(project.sectionOrder || []).map((secId, idx) => this.renderSectionCard(project, secId, idx, activeFilter, searchFilter)).join('')}

              <!-- Unsectioned Components Section (if any) -->
              ${(project.unsectionedComponentOrder && project.unsectionedComponentOrder.length > 0) ? `
                <div class="section-card ${this.state.selectedType === 'section' && this.state.selectedId === 'unsectioned' ? 'is-selected' : ''}" data-section-id="unsectioned">
                  <div class="section-card-header">
                    <button type="button" class="section-select-target" data-action="select-node" data-node-type="section" data-node-id="unsectioned" aria-label="Select Unsectioned Area" aria-pressed="${this.state.selectedType === 'section' && this.state.selectedId === 'unsectioned'}">
                      <div class="section-header-left">
                        <h3 class="section-title">Unsectioned Area</h3>
                        <span class="section-component-badge">${project.unsectionedComponentOrder.length}</span>
                      </div>
                    </button>
                    <div>
                      <button class="btn btn-secondary btn-sm" data-action="add-comp-unsectioned">+ Add</button>
                    </div>
                  </div>
                  <div class="section-card-body">
                    ${project.unsectionedComponentOrder
                      .filter(cId => this.matchesFilter(project.components?.[cId], activeFilter, searchFilter))
                      .map((cId, idx) => this.renderComponentRow(project, cId, null, idx, project.unsectionedComponentOrder.length))
                      .join('')}
                  </div>
                </div>
              ` : ''}

              ${(project.sectionOrder || []).length === 0 && (!project.unsectionedComponentOrder || project.unsectionedComponentOrder.length === 0) ? `
                <div class="dashboard-empty-state">
                  <h3 class="empty-state-title">Course is empty</h3>
                  <p class="empty-state-subtitle">Add your first section or interactive component.</p>
                  <div class="empty-state-actions">
                    <button id="wp-empty-add-sec-btn" class="btn btn-primary btn-sm">Add Section</button>
                    <button id="wp-empty-add-comp-btn" class="btn btn-secondary btn-sm">Add Component</button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Zone 2: Central Authoring & Live Preview Canvas -->
          <div class="workspace-canvas-zone" role="region" aria-label="Interactive Canvas">
            ${this.renderCentralCanvas(project)}
          </div>

          <!-- Zone 3: Right Contextual Inspector Panel -->
          <div class="workspace-inspector-zone" role="region" aria-label="Properties Inspector">
            ${this.renderContextualInspector(project)}
          </div>
        </main>
      </div>
    `;

    // Render Modals into modal host
    const modalHost = this.getModalHost();
    if (this.state.isPickerOpen) {
      if (modalHost && modalHost !== this.container) {
        let overlay = modalHost.querySelector('#picker-modal-overlay');
        if (!overlay) {
          const temp = document.createElement('div');
          temp.innerHTML = this.renderComponentPicker(project);
          overlay = temp.firstElementChild;
          if (overlay) modalHost.appendChild(overlay);
        } else {
          overlay.outerHTML = this.renderComponentPicker(project);
        }
      } else {
        this.container.insertAdjacentHTML('beforeend', this.renderComponentPicker(project));
      }
    } else {
      modalHost?.querySelector('#picker-modal-overlay')?.remove();
    }

    if (this.state.previewDetailsComp) {
      if (modalHost && modalHost !== this.container) {
        let overlay = modalHost.querySelector('#details-modal-overlay');
        if (!overlay) {
          const temp = document.createElement('div');
          temp.innerHTML = this.renderDetailsModal(this.state.previewDetailsComp, project);
          overlay = temp.firstElementChild;
          if (overlay) modalHost.appendChild(overlay);
        } else {
          overlay.outerHTML = this.renderDetailsModal(this.state.previewDetailsComp, project);
        }
      } else {
        this.container.insertAdjacentHTML('beforeend', this.renderDetailsModal(this.state.previewDetailsComp, project));
      }
    } else {
      modalHost?.querySelector('#details-modal-overlay')?.remove();
    }

    this.attachEventListeners();
  }

  renderCentralCanvas(project) {
    const { selectedType, selectedId, canvasDevice } = this.state;
    const selectedComp = selectedType === 'component' && selectedId ? project.components?.[selectedId] : null;
    const selectedSec = selectedType === 'section' && selectedId ? (selectedId === 'unsectioned' ? { name: 'Unsectioned Area', description: 'Standalone components' } : project.sections?.[selectedId]) : null;

    let deviceWidthStyle = 'width: 100%; max-width: 100%;';
    if (canvasDevice === 'tablet') {
      deviceWidthStyle = 'width: 768px; max-width: 100%;';
    } else if (canvasDevice === 'mobile') {
      deviceWidthStyle = 'width: 375px; max-width: 100%;';
    }

    if (selectedComp) {
      const regEntry = getComponentById(COMPONENT_REGISTRY, selectedComp.type);
      const typeLabel = regEntry?.name || selectedComp.type;
      const iframeSrcDoc = this.compileComponentHtml(project, selectedComp);

      return `
        <div class="canvas-header">
          <div class="canvas-header-title">
            <span class="component-type-badge">${escapeHTML(typeLabel)}</span>
            <span class="canvas-active-title">${escapeHTML(selectedComp.name)}</span>
          </div>
          <div class="canvas-viewport-controls" role="group" aria-label="Device viewport preview">
            <button class="btn btn-secondary btn-sm ${canvasDevice === 'desktop' ? 'active' : ''}" data-canvas-device="desktop" title="Desktop View (100%)">Desktop</button>
            <button class="btn btn-secondary btn-sm ${canvasDevice === 'tablet' ? 'active' : ''}" data-canvas-device="tablet" title="Tablet View (768px)">Tablet</button>
            <button class="btn btn-secondary btn-sm ${canvasDevice === 'mobile' ? 'active' : ''}" data-canvas-device="mobile" title="Mobile View (375px)">Mobile</button>
          </div>
        </div>

        <div class="canvas-viewport-container" style="display: flex; justify-content: center; width: 100%; overflow-x: auto; background: var(--att-surface-sunken, #F8FAFC); border-radius: 12px; padding: 16px;">
          <div class="canvas-device-wrapper" style="${deviceWidthStyle} transition: width 0.2s ease; background: #FFFFFF; border: 1px solid var(--att-border, #E2E8F0); border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); overflow: hidden;">
            <div class="canvas-component-topbar" style="padding: 8px 14px; background: var(--att-surface-sunken, #FAFAFA); border-bottom: 1px solid var(--att-border, #EAEAEA); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; font-weight: 700; color: #555;">Live Preview</span>
              <button class="btn btn-primary btn-sm" data-action="open-focus-editor" data-comp-id="${selectedComp.id}" style="padding: 3px 10px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                <span>Open Focus Editor</span>
              </button>
            </div>
            <iframe
              id="canvas-comp-iframe-${selectedComp.id}"
              class="canvas-preview-iframe"
              srcdoc="${escapeHTML(iframeSrcDoc)}"
              title="Live preview for ${escapeHTML(selectedComp.name)}"
              style="width: 100%; border: none; min-height: 280px; display: block;"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            ></iframe>
          </div>
        </div>
      `;
    }

    if (selectedSec) {
      const compIds = selectedId === 'unsectioned' ? (project.unsectionedComponentOrder || []) : (selectedSec.componentOrder || []);
      return `
        <div class="canvas-header">
          <div class="canvas-header-title">
            <span class="component-type-badge">Section View</span>
            <span class="canvas-active-title">${escapeHTML(selectedSec.name)}</span>
          </div>
        </div>

        <div class="canvas-viewport-frame" style="padding: 24px;">
          <div style="max-width: 580px; display: flex; flex-direction: column; gap: 14px; text-align: left; width: 100%;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 1.125rem; font-weight: 700; color: var(--text-main, #111);">${escapeHTML(selectedSec.name)}</h3>
              <p style="margin: 0; font-size: 0.875rem; color: #64748B;">${escapeHTML(selectedSec.description || 'Section Module Overview')}</p>
            </div>
            <div style="font-size: 0.8125rem; font-weight: 600; color: #475569;">
              ${compIds.length} ${compIds.length === 1 ? 'Component' : 'Components'} in this section:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${compIds.map(cId => {
                const c = project.components?.[cId];
                if (!c) return '';
                const reg = getComponentById(COMPONENT_REGISTRY, c.type);
                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #FFF; border: 1px solid var(--att-border, #E2E8F0); border-radius: 8px;">
                    <div>
                      <span style="font-weight: 700; font-size: 0.875rem; color: #111;">${escapeHTML(c.name)}</span>
                      <span style="margin-left: 8px; font-size: 0.6875rem; background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F); padding: 1px 6px; border-radius: 4px;">${escapeHTML(reg?.name || c.type)}</span>
                    </div>
                    <button class="btn btn-secondary btn-sm" data-action="select-comp-preview" data-comp-id="${c.id}" style="padding: 4px 10px; font-size: 0.75rem;">
                      Preview Block
                    </button>
                  </div>
                `;
              }).join('')}
              ${compIds.length === 0 ? `
                <div style="padding: 24px; text-align: center; background: #FFF; border: 1px dashed var(--att-border, #CBD5E1); border-radius: 8px;">
                  <p style="font-size: 0.8125rem; color: #64748B; margin: 0 0 8px 0;">No components added to this section yet.</p>
                  <button class="btn btn-primary btn-sm" data-action="add-comp-to-sec" data-sec-id="${selectedId}">+ Add Component</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Default / Course Selection
    return `
      <div class="canvas-header">
        <div class="canvas-header-title">
          <span class="component-type-badge">Course Canvas</span>
          <span class="canvas-active-title">${escapeHTML(project.name)}</span>
        </div>
      </div>

      <div class="canvas-viewport-frame" style="min-height: 420px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 32px; text-align: center;">
        <div style="max-width: 500px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <div style="width: 64px; height: 64px; border-radius: 16px; background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F); display: flex; align-items: center; justify-content: center;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          </div>
          <h2 style="font-size: 1.125rem; font-weight: 700; margin: 0; color: var(--text-main, #111);">Course Authoring &amp; Flow Canvas</h2>
          <p style="font-size: 0.875rem; color: #64748B; margin: 0; line-height: 1.5;">Select any component from the Course Outline to preview, configure its properties, or enter the full Focus Editor.</p>
          <button class="btn btn-primary btn-sm" id="wp-preview-canvas-btn" style="margin-top: 6px; padding: 8px 18px; font-size: 0.8125rem;">
            Launch Full Course Preview
          </button>
        </div>
      </div>
    `;
  }

  renderContextualInspector(project) {
    const { selectedType, selectedId } = this.state;
    const totalComponents = Object.keys(project.components || {}).length;

    if (selectedType === 'component' && selectedId && project.components?.[selectedId]) {
      const comp = project.components[selectedId];
      const regEntry = getComponentById(COMPONENT_REGISTRY, comp.type);
      const typeLabel = regEntry?.name || comp.type;

      return `
        <div class="inspector-header">
          <h3 class="inspector-title">Component Inspector</h3>
          <span class="project-client-badge" style="background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F);">${escapeHTML(typeLabel)}</span>
        </div>

        <div class="inspector-body">
          <div class="inspector-prop-group">
            <label class="inspector-label" for="insp-comp-name">Component Title</label>
            <input id="insp-comp-name" class="form-input" type="text" value="${escapeHTML(comp.name)}" style="font-size: 0.8125rem;" />
          </div>

          <div class="inspector-prop-group">
            <label class="inspector-label" for="insp-comp-status">Editorial Status</label>
            <select id="insp-comp-status" class="form-select" style="font-size: 0.8125rem;">
              <option value="draft" ${comp.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="in_review" ${comp.status === 'in_review' || comp.status === 'in-review' ? 'selected' : ''}>In Review</option>
              <option value="ready" ${comp.status === 'ready' ? 'selected' : ''}>Ready</option>
            </select>
          </div>

          <div class="inspector-prop-group">
            <span class="inspector-label">Learning Purpose</span>
            <span style="font-size: 0.8125rem; color: #555;">${escapeHTML(regEntry?.description || 'Interactive Learning Block')}</span>
          </div>

          <div class="inspector-prop-group">
            <span class="inspector-label">Standards & Compatibility</span>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: #444;">
              <span>• Designed for Articulate Rise 360</span>
              <span>• Built to support WCAG 2.2 AA requirements</span>
              <span>• Responsive mobile/desktop layout</span>
            </div>
          </div>
        </div>

        <div class="inspector-footer">
          <button class="btn btn-primary" data-action="open-focus-editor" data-comp-id="${comp.id}" style="width: 100%; justify-content: center; font-size: 0.8125rem; font-weight: 700;">
            Open Focus Editor
          </button>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" data-action="duplicate-comp" data-comp-id="${comp.id}" style="flex: 1; font-size: 0.75rem;">Duplicate</button>
            <button class="btn btn-secondary btn-sm text-danger" data-action="delete-comp" data-comp-id="${comp.id}" style="flex: 1; font-size: 0.75rem;">Delete</button>
          </div>
        </div>
      `;
    }

    if (selectedType === 'section' && selectedId) {
      const isUnsec = selectedId === 'unsectioned';
      const sec = isUnsec ? { name: 'Unsectioned Area', description: 'Standalone components' } : project.sections?.[selectedId];
      const count = isUnsec ? (project.unsectionedComponentOrder?.length || 0) : (sec?.componentOrder?.length || 0);

      return `
        <div class="inspector-header">
          <h3 class="inspector-title">Section Inspector</h3>
          <span class="section-component-badge">${count} ${count === 1 ? 'block' : 'blocks'}</span>
        </div>

        <div class="inspector-body">
          <div class="inspector-prop-group">
            <label class="inspector-label">Section Name</label>
            <span style="font-weight: 700; font-size: 0.875rem; color: #111;">${escapeHTML(sec?.name || 'Section')}</span>
          </div>

          <div class="inspector-prop-group">
            <label class="inspector-label">Description</label>
            <span style="font-size: 0.8125rem; color: #555;">${escapeHTML(sec?.description || 'No section description.')}</span>
          </div>

          <div class="inspector-prop-group">
            <span class="inspector-label">Section Summary</span>
            <span style="font-size: 0.8125rem; color: #555;">Contains ${count} component instances.</span>
          </div>
        </div>

        <div class="inspector-footer">
          <button class="btn btn-primary" data-action="add-comp-to-sec" data-sec-id="${selectedId}" style="width: 100%; justify-content: center; font-size: 0.8125rem;">
            + Add Component
          </button>
          ${!isUnsec ? `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" data-action="rename-sec" data-sec-id="${selectedId}" style="flex: 1; font-size: 0.75rem;">Rename</button>
              <button class="btn btn-secondary btn-sm text-danger" data-action="delete-sec" data-sec-id="${selectedId}" style="flex: 1; font-size: 0.75rem;">Delete</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Default / Course Level Inspector
    const qa = auditCourseProject(project);
    const hasContent = totalComponents > 0;
    return `
      <div class="inspector-header">
        <h3 class="inspector-title">Course Inspector</h3>
        <span class="project-client-badge" style="background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F);">Accessibility Checks Included</span>
      </div>

      <div class="inspector-body">
        <div class="inspector-prop-group">
          <span class="inspector-label">Course Title</span>
          <span style="font-weight: 700; font-size: 0.875rem; color: #111;">${escapeHTML(project.name)}</span>
        </div>

        <div class="inspector-prop-group">
          <span class="inspector-label">Course Target</span>
          <span style="color: var(--att-cobalt, #00388F); font-weight: 600; font-size: 0.8125rem;">Designed for Articulate Rise 360</span>
        </div>

        <div class="inspector-prop-group">
          <span class="inspector-label">Editorial Scope</span>
          <span style="font-size: 0.8125rem; color: #555;">${totalComponents} interactive ${totalComponents === 1 ? 'component' : 'components'} across ${Object.keys(project.sections || {}).length} sections</span>
        </div>

        <div class="inspector-prop-group" style="border-top: 1px solid var(--att-border, #EFEFEF); padding-top: 10px;">
          <span class="inspector-label">Pre-Export QA Health</span>
          ${hasContent ? `
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8125rem; font-weight: 600; color: #1E293B;">Overall Readiness:</span>
                <!-- Status label only, no percentage: overallScore is an internal weighted
                     heuristic (js/dashboard/project-qa.js), not a compliance measurement, and
                     showing it as "(100%)" reads as a certified pass automated checks can't
                     make (audit 2026-09-27, section 2: "avoid broad claims such as 100%
                     Compliant from automated WCAG checks"). -->
                <span class="badge ${qa.overallStatusClass}" style="font-size: 0.75rem;">${escapeHTML(qa.overallStatus)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #64748B;">
                <span>Technical Checks:</span>
                <span style="font-weight: 600; color: #334155;">${qa.technicalScore}%</span>
              </div>
              <div style="display: flex; gap: 6px; font-size: 0.6875rem; color: #64748B; margin-top: 2px;">
                <span>${qa.editorial.readyCount} Ready</span> • 
                <span>${qa.editorial.inReviewCount} In Review</span> • 
                <span>${qa.editorial.draftCount} Draft</span>
              </div>
              ${(qa.counts.blockers > 0 || qa.counts.errors > 0 || qa.counts.warnings > 0) ? `
                <div style="font-size: 0.6875rem; color: ${qa.counts.blockers > 0 ? '#DC2626' : '#D97706'}; font-weight: 600;">
                  ${qa.counts.blockers > 0 ? `${qa.counts.blockers} blocker(s) ` : ''}${qa.counts.errors > 0 ? `${qa.counts.errors} error(s) ` : ''}${qa.counts.warnings > 0 ? `${qa.counts.warnings} warning(s)` : ''}
                </div>
              ` : ''}
            </div>
          ` : `
            <span style="font-size: 0.8125rem; color: #64748B; font-style: italic;">No content to evaluate</span>
          `}
        </div>
      </div>

      <div class="inspector-footer">
        <button class="btn btn-secondary btn-sm" id="wp-inspector-qa-btn" style="width: 100%; justify-content: center; font-size: 0.8125rem;" ${!hasContent ? 'disabled' : ''}>
          Run QA Preflight
        </button>
        <button class="btn btn-primary btn-sm" id="wp-inspector-export-btn" style="width: 100%; justify-content: center; font-size: 0.8125rem;" ${!hasContent ? 'disabled' : ''}>
          Export Course Package
        </button>
      </div>
    `;
  }

  addComponentToProject(type, targetSecId = null) {
    const regEntry = getComponentById(COMPONENT_REGISTRY, type);
    const defaultCfg = regEntry ? getDefaultConfig(regEntry) : {};
    const label = regEntry?.name || 'New Component';

    const newComp = createComponentInstance({
      name: label,
      type,
      status: 'draft',
      // Registry defaults carry no header text; without this the editor filled the gap with
      // the Accordion demo ("INTERACTIVE ACCORDION") for every component type.
      config: { ...defaultBlockHeader(label), ...defaultCfg }
    });

    const project = this.getProject();
    const resolvedSecId = this.resolveDestinationSectionId(project, targetSecId);
    const destName = (resolvedSecId && project?.sections?.[resolvedSecId]?.name)
      ? project.sections[resolvedSecId].name
      : 'Unsectioned Area';

    this.updateProject(p => {
      if (!p.components) p.components = {};
      p.components[newComp.id] = newComp;
      if (resolvedSecId && p.sections?.[resolvedSecId]) {
        if (!p.sections[resolvedSecId].componentOrder) p.sections[resolvedSecId].componentOrder = [];
        p.sections[resolvedSecId].componentOrder.push(newComp.id);
        p.lastActiveSectionId = resolvedSecId;
      } else {
        if (!p.unsectionedComponentOrder) p.unsectionedComponentOrder = [];
        p.unsectionedComponentOrder.push(newComp.id);
      }
    });

    if (this.cleanupPickerIsolation) {
      this.cleanupPickerIsolation();
      this.cleanupPickerIsolation = null;
    }
    this.state.isPickerOpen = false;
    this.state.previewDetailsComp = null;
    this.state.selectedType = 'component';
    this.state.selectedId = newComp.id;
    this.render();

    showToast(`${regEntry?.name || 'Component'} added to ${destName}.`, 'success');
    return newComp;
  }

  resolveDestinationSectionId(project, secId = undefined, isExplicitStandalone = false) {
    if (isExplicitStandalone) return null;
    if (secId && project?.sections?.[secId]) return secId;

    const remembered = project?.lastActiveSectionId || this.state.lastActiveSectionId;
    if (remembered && project?.sections?.[remembered]) {
      return remembered;
    }

    if (project?.sectionOrder && project.sectionOrder.length > 0) {
      for (const sId of project.sectionOrder) {
        if (project.sections?.[sId]) return sId;
      }
    }

    return null;
  }

  matchesFilter(comp, activeFilter, searchFilter) {
    if (!comp) return false;
    if (activeFilter !== 'all' && (comp.status || 'draft') !== activeFilter) {
      return false;
    }
    if (searchFilter) {
      const matchName = comp.name.toLowerCase().includes(searchFilter);
      const matchType = comp.type.toLowerCase().includes(searchFilter);
      if (!matchName && !matchType) return false;
    }
    return true;
  }

  renderSectionCard(project, sectionId, index, activeFilter, searchFilter) {
    const section = project.sections?.[sectionId];
    if (!section) return '';

    const allCompIds = section.componentOrder || [];
    const filteredCompIds = allCompIds.filter(cId => this.matchesFilter(project.components?.[cId], activeFilter, searchFilter));
    const isMenuOpen = this.state.activeMenuId === sectionId;
    const isSelected = this.state.selectedType === 'section' && this.state.selectedId === sectionId;

    return `
      <div class="section-card ${isSelected ? 'is-selected' : ''}" data-section-id="${sectionId}">
        <div class="section-card-header">
          <button type="button" class="section-collapse-toggle" data-toggle-sec="${sectionId}" aria-label="${section.collapsed ? 'Expand section' : 'Collapse section'}">
            <svg class="section-toggle-icon ${section.collapsed ? 'collapsed' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <button type="button" class="section-select-target" data-action="select-node" data-node-type="section" data-node-id="${sectionId}" aria-label="Select section ${escapeHTML(section.name)}" aria-pressed="${isSelected}">
            <div class="section-header-left">
              <h3 class="section-title">${escapeHTML(section.name)}</h3>
              <span class="section-component-badge">${allCompIds.length} ${allCompIds.length === 1 ? 'component' : 'components'}</span>
            </div>
          </button>

          <div class="section-header-right">
            <button class="btn btn-secondary btn-sm" data-action="add-comp-to-sec" data-sec-id="${sectionId}">
              + Component
            </button>
            <div class="project-menu-anchor">
              <button class="project-menu-btn" data-action="section-menu" data-sec-id="${sectionId}" aria-label="Section options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
          ${isMenuOpen ? `
            <div class="project-action-menu">
              <button class="project-menu-item" data-action="rename-sec" data-sec-id="${sectionId}">Rename Section</button>
              <button class="project-menu-item" data-action="duplicate-sec" data-sec-id="${sectionId}">Duplicate Section</button>
              ${index > 0 ? `<button class="project-menu-item" data-action="move-sec-up" data-sec-id="${sectionId}">Move Up</button>` : ''}
              ${index < (project.sectionOrder.length - 1) ? `<button class="project-menu-item" data-action="move-sec-down" data-sec-id="${sectionId}">Move Down</button>` : ''}
              <button class="project-menu-item text-danger" data-action="delete-sec" data-sec-id="${sectionId}">Delete Section</button>
            </div>
          ` : ''}
            </div>
          </div>
        </div>

        <div class="section-card-body ${section.collapsed ? 'collapsed' : ''}" style="display: ${section.collapsed ? 'none' : 'flex'};">
          ${filteredCompIds.length > 0 ? `
            ${filteredCompIds.map((cId, idx) => this.renderComponentRow(project, cId, sectionId, idx, filteredCompIds.length)).join('')}
          ` : allCompIds.length === 0 ? `
            <div class="section-quick-start-box">
              <p style="font-size: 0.875rem; font-weight: 600; color: #1E293B; margin: 0 0 4px 0;">Start building ${escapeHTML(section.name)}</p>
              <p style="font-size: 0.8125rem; color: #64748B; margin: 0 0 10px 0;">Add an interactive component to this section:</p>
              <div class="quick-add-chips-grid">
                <button type="button" class="btn btn-secondary btn-sm quick-add-chip" data-action="quick-add-comp" data-sec-id="${sectionId}" data-comp-type="accordion">
                  + Accordion
                </button>
                <button type="button" class="btn btn-secondary btn-sm quick-add-chip" data-action="quick-add-comp" data-sec-id="${sectionId}" data-comp-type="multiple-choice">
                  + Multiple Choice
                </button>
                <button type="button" class="btn btn-secondary btn-sm quick-add-chip" data-action="quick-add-comp" data-sec-id="${sectionId}" data-comp-type="card-carousel">
                  + Card Carousel
                </button>
                <button type="button" class="btn btn-secondary btn-sm quick-add-chip" data-action="quick-add-comp" data-sec-id="${sectionId}" data-comp-type="scenario">
                  + Scenario
                </button>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-action="add-comp-to-sec" data-sec-id="${sectionId}" style="margin-top: 8px;">
                Browse All 26 Components
              </button>
            </div>
          ` : `
            <div class="section-empty-hint">
              No components match the current filter.
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderComponentRow(project, compId, sectionId, index, totalInGroup) {
    const comp = project.components?.[compId];
    if (!comp) return '';

    const isMenuOpen = this.state.activeMenuId === compId;
    const isSelected = this.state.selectedType === 'component' && this.state.selectedId === compId;
    const registryEntry = COMPONENT_REGISTRY.find(r => r.id === comp.type);
    const typeLabel = registryEntry?.name || comp.type;
    const statusClass = comp.status === 'ready' ? 'status-ready' : (comp.status === 'in_review' || comp.status === 'in-review') ? 'status-review' : 'status-draft';

    return `
      <div class="component-row ${isSelected ? 'is-selected' : ''}" data-comp-id="${compId}">
        <button type="button" class="component-select-target" data-action="select-node" data-node-type="component" data-node-id="${compId}" aria-label="Select component ${escapeHTML(comp.name)}" aria-pressed="${isSelected}">
          <div class="component-row-left">
            <div class="component-row-title-line">
              <span class="component-drag-handle" title="Position in section">#${index + 1}</span>
              <h4 class="component-name" title="${escapeHTML(comp.name)}">${escapeHTML(comp.name)}</h4>
            </div>
            <div class="component-row-meta-line">
              <span class="component-type-badge">${escapeHTML(typeLabel)}</span>
            </div>
          </div>
        </button>

        <div class="component-row-right">
          <!-- Editorial Status Dropdown Badge -->
          <div class="editorial-status-dropdown-wrapper">
            <select class="component-status-select ${statusClass}" data-action="change-status" data-comp-id="${compId}" aria-label="Status for ${escapeHTML(comp.name)}">
              <option value="draft" ${comp.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="in_review" ${comp.status === 'in_review' || comp.status === 'in-review' ? 'selected' : ''}>In Review</option>
              <option value="ready" ${comp.status === 'ready' ? 'selected' : ''}>Ready</option>
            </select>
          </div>

          <button class="btn btn-secondary btn-sm" data-action="edit-comp" data-comp-id="${compId}" aria-label="Open Focus Editor for ${escapeHTML(comp.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            <span>Focus Edit</span>
          </button>
          
          <!-- Keyboard Move buttons -->
          ${index > 0 ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="move-comp-up" data-comp-id="${compId}" data-sec-id="${sectionId || ''}" title="Move Up" aria-label="Move ${escapeHTML(comp.name)} Up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg></button>` : ''}
          ${index < totalInGroup - 1 ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="move-comp-down" data-comp-id="${compId}" data-sec-id="${sectionId || ''}" title="Move Down" aria-label="Move ${escapeHTML(comp.name)} Down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></button>` : ''}

          <div class="project-menu-anchor">
            <button class="project-menu-btn" data-action="comp-menu" data-comp-id="${compId}" aria-label="Component options for ${escapeHTML(comp.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
          ${isMenuOpen ? `
            <div class="project-action-menu">
              <button class="project-menu-item" data-action="open-focus-editor" data-comp-id="${compId}">Open Focus Editor</button>
              <button class="project-menu-item" data-action="duplicate-comp" data-comp-id="${compId}">Duplicate</button>
              <button class="project-menu-item" data-action="rename-comp" data-comp-id="${compId}">Rename</button>
              <button class="project-menu-item text-danger" data-action="delete-comp" data-comp-id="${compId}" data-sec-id="${sectionId || ''}">Delete</button>
            </div>
          ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Shared by the full picker render and by refreshPickerResults()'s in-place update, so
  // the two paths can never disagree about which components match the current filters.
  getFilteredPickerList() {
    let list = COMPONENT_REGISTRY || [];

    // Category or Quick Views Filter
    if (this.state.pickerCategory === 'recommended') {
      list = list.filter(c => c.tier === 'flagship' || c.complexity === 'Standard');
    } else if (this.state.pickerCategory === 'favorites') {
      list = list.filter(c => this.state.favorites.has(c.id));
    } else if (this.state.pickerCategory === 'recent') {
      list = list.filter(c => (this.state.recentlyUsed || []).includes(c.id));
    } else if (this.state.pickerCategory && this.state.pickerCategory !== 'all') {
      list = list.filter(c => c.categoryId === this.state.pickerCategory || c.category === this.state.pickerCategory);
    }

    // Search Query
    if (this.state.pickerSearch.trim()) {
      list = searchComponents(list, this.state.pickerSearch);
    }
    return list;
  }

  isPickerFiltered() {
    return Boolean(this.state.pickerSearch.trim() || (this.state.pickerCategory && this.state.pickerCategory !== 'all'));
  }

  renderComponentPicker(project) {
    const list = this.getFilteredPickerList();

    const sections = project.sections || {};
    const sectionOrder = project.sectionOrder || [];

    return `
      <div class="modal-overlay is-active drawer-overlay" id="picker-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="picker-modal-title">
        <div class="modal-card component-library-drawer">
          <div class="modal-header">
            <div>
              <h2 id="picker-modal-title" class="modal-title">Component Library</h2>
              <p class="modal-subtitle">Pick from 26 AT&amp;T brand-aligned interactive blocks.</p>
            </div>
            <button id="picker-close-btn" class="project-menu-btn" aria-label="Close component library" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Target Section Chooser & Search Bar (Sticky Header Area) -->
            <div class="picker-sticky-controls">
              <div class="picker-search-bar">
                <input
                  id="picker-search-input"
                  class="form-input"
                  type="search"
                  placeholder="Search components by name, feature, or keyword…"
                  aria-label="Search components in picker"
                  value="${escapeHTML(this.state.pickerSearch)}"
                  autofocus
                />
              </div>

              <div class="picker-destination-bar">
                <label for="picker-section-select">Add into:</label>
                <select id="picker-section-select" class="form-select" aria-label="Destination section">
                  ${sectionOrder.map(sId => `
                    <option value="${sId}" ${this.state.pickerTargetSectionId === sId ? 'selected' : ''}>${escapeHTML(sections[sId]?.name || 'Section')}</option>
                  `).join('')}
                  <option value="" ${!this.state.pickerTargetSectionId ? 'selected' : ''}>Unsectioned Area (Standalone)</option>
                </select>
              </div>

              <!-- Quick View & Category Filter Chips -->
              <div class="picker-category-tabs">
                <button class="filter-chip ${this.state.pickerCategory === 'all' ? 'active' : ''}" data-picker-cat="all">All (${COMPONENT_REGISTRY.length})</button>
                <button class="filter-chip ${this.state.pickerCategory === 'recommended' ? 'active' : ''}" data-picker-cat="recommended">★ Recommended</button>
                <button class="filter-chip ${this.state.pickerCategory === 'favorites' ? 'active' : ''}" data-picker-cat="favorites">Favorites (${this.state.favorites.size})</button>
                <button class="filter-chip ${this.state.pickerCategory === 'recent' ? 'active' : ''}" data-picker-cat="recent">Recent</button>
                ${CATEGORIES.map(cat => {
                  const count = COMPONENT_REGISTRY.filter(c => c.categoryId === cat.id || c.category === cat.id).length;
                  return `
                    <button class="filter-chip ${this.state.pickerCategory === cat.id ? 'active' : ''}" data-picker-cat="${cat.id}">
                      ${escapeHTML(cat.name)} (${count})
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Search Result Meta Bar -->
            ${this.renderPickerResultMeta(list)}

            <!-- Responsive 2-Column Components Grid -->
            ${this.renderPickerGrid(list)}
          </div>

          <div class="modal-footer">
            <button id="picker-cancel-btn" class="btn btn-secondary btn-sm" type="button">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  // Re-renders only the two elements that depend on the current query — the result count
  // bar and the component grid — replacing each in place. The sticky controls above them
  // (search input, destination select, category chips) keep their live DOM nodes, so the
  // caret, focus and scroll position survive a keystroke. Handlers inside the replaced
  // markup are rebound because the elements themselves are new.
  refreshPickerResults() {
    const modalHost = this.getModalHost() || this.container;
    const meta = modalHost.querySelector('.picker-result-meta');
    const grid = modalHost.querySelector('.picker-grid');
    if (!meta || !grid) {
      // The picker markup isn't on the page as expected — fall back to a full render
      // rather than silently leaving stale results on screen.
      this.render();
      return;
    }

    const list = this.getFilteredPickerList();
    meta.outerHTML = this.renderPickerResultMeta(list);
    grid.outerHTML = this.renderPickerGrid(list);
    this.bindPickerResultHandlers();
  }

  // Binds every handler that lives inside the re-renderable results area. Called after a
  // full render and again after each in-place refresh; the elements are freshly created
  // each time, so this never double-binds.
  bindPickerResultHandlers() {
    const modalHost = this.getModalHost() || this.container;

    const resetFilters = () => {
      this.state.pickerSearch = '';
      this.state.pickerCategory = 'all';
      this.render();
    };

    modalHost.querySelector('#picker-clear-filters-btn')?.addEventListener('click', resetFilters);
    modalHost.querySelector('#picker-no-results-reset-btn')?.addEventListener('click', resetFilters);

    // Favorite toggle in component card
    modalHost.querySelectorAll('[data-action="toggle-fav-comp"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compType;
        if (this.state.favorites.has(compId)) {
          this.state.favorites.delete(compId);
        } else {
          this.state.favorites.add(compId);
        }
        saveFavorites(this.state.favorites);
        // Favourite state shows on the chip counter outside the results area too, and no
        // text field is focused mid-click, so a full render is safe here.
        this.render();
      });
    });

    modalHost.querySelectorAll('[data-action="preview-picker-item"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.lastDetailsTrigger = btn;
        const compType = btn.dataset.compType;
        this.state.previewDetailsComp = getComponentById(COMPONENT_REGISTRY, compType);
        this.render();
      });
    });

    modalHost.querySelectorAll('[data-action="select-picker-item"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addComponentToProject(btn.dataset.compType, this.state.pickerTargetSectionId);
      });
    });
  }

  renderPickerResultMeta(list) {
    return `
            <div class="picker-result-meta" aria-live="polite">
              <span>Showing <strong>${list.length}</strong> of ${COMPONENT_REGISTRY.length} components</span>
              ${this.isPickerFiltered() ? `
                <button type="button" class="btn btn-secondary btn-sm" id="picker-clear-filters-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  <span>Clear filters</span>
                </button>
              ` : ''}
            </div>
    `;
  }

  renderPickerGrid(list) {
    return `
            <div class="picker-grid">
              ${list.map(c => {
                const isFav = this.state.favorites.has(c.id);
                return `
                  <div class="picker-item-card" data-comp-type="${c.id}">
                    <!-- Wireframe Thumbnail -->
                    <div class="picker-item-wireframe-banner">
                      ${c.thumbnail || getComponentThumbnailSvg(c.id, { width: 120, height: 64 })}
                    </div>

                    <div class="picker-card-header">
                      <div>
                        <h3 class="picker-item-title">${escapeHTML(c.name)}</h3>
                        <span class="component-type-badge">${escapeHTML(c.categoryName || c.categoryId || 'Interactive')}</span>
                      </div>
                      <button type="button" class="favorite-toggle-btn ${isFav ? 'active' : ''}" data-action="toggle-fav-comp" data-comp-type="${c.id}" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                        ${isFav ? '★' : '☆'}
                      </button>
                    </div>
                    
                    <p class="picker-item-desc" title="${escapeHTML(c.description || '')}">
                      ${escapeHTML(c.description || '')}
                    </p>

                    ${c.bestWhen ? `
                      <div class="picker-card-bestfor">
                        <strong>Best for:</strong> ${escapeHTML(c.bestWhen.length > 70 ? `${c.bestWhen.substring(0, 67)}…` : c.bestWhen)}
                      </div>
                    ` : ''}

                    <div class="picker-card-actions">
                      <button class="btn btn-secondary btn-sm" data-action="preview-picker-item" data-comp-type="${c.id}">
                        Details
                      </button>
                      <button class="btn btn-primary btn-sm" data-action="select-picker-item" data-comp-type="${c.id}">
                        + Add
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}

              ${list.length === 0 ? `
                <div class="picker-empty-state">
                  <p class="picker-empty-title">No components found</p>
                  <p class="picker-empty-desc">Try adjusting your search query or switching filter tabs.</p>
                  <button type="button" class="btn btn-secondary btn-sm" id="picker-no-results-reset-btn">Reset filters</button>
                </div>
              ` : ''}
            </div>
    `;
  }

  renderDetailsModal(comp, _project) {
    return `
      <div class="modal-overlay is-active" id="details-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="details-modal-title">
        <div class="modal-card" style="max-width: 680px;">
          <div class="modal-header">
            <div>
              <h3 id="details-modal-title" style="margin: 0; font-size: 1.125rem; font-weight: 700;">${escapeHTML(comp.name)}</h3>
              <span class="component-type-badge" style="margin-top: 4px;">${escapeHTML(comp.categoryName || comp.categoryId || 'Interactive')}</span>
            </div>
            <button id="details-close-btn" class="project-menu-btn" aria-label="Close details">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="background: var(--att-surface-sunken, #F4F6F9); padding: 14px; border-radius: 10px; display: flex; justify-content: center; align-items: center; border: 1px solid var(--att-border, #EAEAEA);">
              ${comp.thumbnail || getComponentThumbnailSvg(comp.id, { width: 220, height: 110 })}
            </div>

            <div>
              <h4 style="margin: 0 0 4px 0; font-size: 0.875rem; font-weight: 700; color: var(--text-main, #111);">Description &amp; Purpose</h4>
              <p style="margin: 0; font-size: 0.8125rem; color: #555; line-height: 1.5;">${escapeHTML(comp.description)}</p>
            </div>

            ${comp.bestWhen ? `
              <div>
                <h4 style="margin: 0 0 4px 0; font-size: 0.875rem; font-weight: 700; color: var(--text-main, #111);">Recommended Use Cases</h4>
                <p style="margin: 0; font-size: 0.8125rem; color: #555; line-height: 1.5;">${escapeHTML(comp.bestWhen)}</p>
              </div>
            ` : ''}

            ${comp.differentiator ? `
              <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 10px 14px; border-radius: 8px;">
                <h4 style="margin: 0 0 2px 0; font-size: 0.8125rem; font-weight: 700; color: #15803D;">Why Choose This Component:</h4>
                <p style="margin: 0; font-size: 0.75rem; color: #166534; line-height: 1.4;">${escapeHTML(comp.differentiator)}</p>
              </div>
            ` : ''}

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.8125rem; background: var(--att-surface-sunken, #FAFAFA); padding: 12px; border-radius: 8px;">
              <div>
                <strong>Rise Compatibility:</strong>
                <p style="margin: 2px 0 0 0; color: #555;">${escapeHTML(comp.riseEquivalent || 'Designed for seamless Rise integration')}</p>
              </div>
              <div>
                <strong>Accessibility Support:</strong>
                <p style="margin: 2px 0 0 0; color: #555;">Built to support WCAG 2.2 AA requirements with full keyboard navigation.</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="details-cancel-btn" class="btn btn-secondary btn-sm">Close</button>
            <button id="details-add-btn" class="btn btn-primary btn-sm" data-comp-type="${comp.id}">+ Add Component</button>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Back to dashboard
    this.container.querySelector('#wp-back-btn')?.addEventListener('click', () => {
      if (this.onBackToDashboard) this.onBackToDashboard();
    });

    // Course Overview Selection Banner
    this.container.querySelector('#wp-course-banner')?.addEventListener('click', (e) => {
      if (e.target.closest('#wp-rename-title-btn')) return;
      this.state.selectedType = 'course';
      this.state.selectedId = null;
      this.render();
    });

    // Device Viewport Toggles in Canvas
    this.container.querySelectorAll('[data-canvas-device]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.canvasDevice = btn.dataset.canvasDevice;
        this.render();
      });
    });

    // Top workspace action buttons
    this.container.querySelector('#wp-preview-btn')?.addEventListener('click', () => {
      if (this.onOpenPreview) this.onOpenPreview(this.projectId);
    });
    this.container.querySelector('#wp-preview-canvas-btn')?.addEventListener('click', () => {
      if (this.onOpenPreview) this.onOpenPreview(this.projectId);
    });
    this.container.querySelector('#wp-media-btn')?.addEventListener('click', () => {
      if (this.onOpenMedia) this.onOpenMedia(this.projectId);
    });
    this.container.querySelector('#wp-qa-btn')?.addEventListener('click', () => {
      if (this.onOpenQa) this.onOpenQa(this.projectId);
    });
    this.container.querySelector('#wp-inspector-qa-btn')?.addEventListener('click', () => {
      if (this.onOpenQa) this.onOpenQa(this.projectId);
    });
    this.container.querySelector('#wp-export-btn')?.addEventListener('click', () => {
      if (this.onExportProject) this.onExportProject(this.projectId);
    });
    this.container.querySelector('#wp-inspector-export-btn')?.addEventListener('click', () => {
      if (this.onExportProject) this.onExportProject(this.projectId);
    });

    // Rename project title
    this.container.querySelector('#wp-rename-title-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const project = this.getProject();
      const newName = await showPromptDialog({
        title: 'Edit Course Title',
        label: 'Course Title',
        defaultValue: project.name,
        confirmText: 'Save',
        required: true
      });
      if (newName && newName.trim()) {
        this.updateProject(p => { p.name = newName.trim(); });
      }
    });

    // Course structure search & filter
    const csSearchInput = this.container.querySelector('#cs-search-input');
    if (csSearchInput) {
      csSearchInput.addEventListener('input', (e) => {
        const caret = e.target.selectionStart;
        this.state.courseStructureSearch = e.target.value;
        this.render();
        // render() rebuilds the whole view, including this input; put the author back where they were typing.
        const fresh = this.container.querySelector('#cs-search-input');
        if (fresh) {
          fresh.focus();
          const at = caret ?? fresh.value.length;
          fresh.setSelectionRange(at, at);
        }
      });
    }

    this.container.querySelectorAll('[data-cs-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.courseStructureFilter = btn.dataset.csFilter;
        this.render();
      });
    });

    // Add Section button
    const addSectionHandler = async () => {
      const name = await showPromptDialog({
        title: 'Add New Section',
        label: 'Section Name',
        placeholder: 'e.g. Module 1: Introduction',
        confirmText: 'Add Section',
        required: true
      });
      if (name && name.trim()) {
        const newSec = createSection({ name: name.trim() });
        this.updateProject(p => {
          if (!p.sectionOrder) p.sectionOrder = [];
          if (!p.sections) p.sections = {};
          p.sectionOrder.push(newSec.id);
          p.sections[newSec.id] = newSec;
        });
        this.state.selectedType = 'section';
        this.state.selectedId = newSec.id;
        this.render();
      }
    };
    this.container.querySelector('#wp-add-section-btn')?.addEventListener('click', addSectionHandler);
    this.container.querySelector('#wp-empty-add-sec-btn')?.addEventListener('click', addSectionHandler);

    // Add component picker trigger
    const openPickerHandler = (secId = undefined, isExplicitStandalone = false, triggerBtn = null) => {
      const project = this.getProject();
      this.lastPickerTrigger = triggerBtn || document.activeElement;
      this.state.isPickerOpen = true;
      // The search query persists in state between openings, so a reopened picker can
      // come back with text already in the field. A freshly rendered input puts the
      // caret at index 0, which would drop the next thing typed in front of the old
      // query; attachHandlers reads this flag to focus and move the caret to the end.
      this.pickerNeedsSearchFocus = true;
      this.state.pickerTargetSectionId = this.resolveDestinationSectionId(project, secId, isExplicitStandalone);
      if (secId && project?.sections?.[secId]) {
        this.state.lastActiveSectionId = secId;
        // Skip updateProject's own render — the one below covers it. Rendering twice here
        // built the picker markup twice, and the second build detached the freshly
        // focused search input, leaving focus on <body>.
        this.updateProject(p => { p.lastActiveSectionId = secId; }, { render: false });
      }
      this.render();
    };

    const globalAddBtn = this.container.querySelector('#wp-header-add-comp-btn') || this.container.querySelector('#wp-add-unsectioned-comp-btn');
    if (globalAddBtn) {
      globalAddBtn.addEventListener('click', (e) => openPickerHandler(undefined, false, e.currentTarget));
    }
    this.container.querySelector('#wp-empty-add-comp-btn')?.addEventListener('click', (e) => openPickerHandler(undefined, false, e.currentTarget));
    this.container.querySelector('[data-action="add-comp-unsectioned"]')?.addEventListener('click', (e) => openPickerHandler(undefined, true, e.currentTarget));

    this.container.querySelectorAll('[data-action="add-comp-to-sec"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPickerHandler(btn.dataset.secId, false, btn);
      });
    });

    this.container.querySelectorAll('[data-action="quick-add-comp"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compType = btn.dataset.compType;
        const secId = btn.dataset.secId;
        this.addComponentToProject(compType, secId);
      });
    });

    // Toggle section collapse & section selection
    this.container.querySelectorAll('[data-toggle-sec]').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const secId = header.dataset.toggleSec;
        this.state.selectedType = 'section';
        this.state.selectedId = secId;
        this.updateProject(p => {
          if (p.sections?.[secId]) {
            p.sections[secId].collapsed = !p.sections[secId].collapsed;
          }
        });
      });
    });

    // Component row selection
    this.container.querySelectorAll('.component-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]') || e.target.closest('select') || e.target.closest('button')) return;
        const compId = row.dataset.compId;
        this.state.selectedType = 'component';
        this.state.selectedId = compId;
        this.render();
      });
    });

    this.container.querySelectorAll('[data-action="select-comp-preview"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.selectedType = 'component';
        this.state.selectedId = btn.dataset.compId;
        this.render();
      });
    });

    // Open Focus Editor button
    this.container.querySelectorAll('[data-action="open-focus-editor"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const project = this.getProject();
        const comp = project.components?.[compId];
        if (comp && this.onEditComponent) {
          this.onEditComponent(project, comp);
        }
      });
    });

    // Focus Edit button on component row
    this.container.querySelectorAll('[data-action="edit-comp"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const project = this.getProject();
        const comp = project.components?.[compId];
        if (comp && this.onEditComponent) {
          this.onEditComponent(project, comp);
        }
      });
    });

    // Section Action Menus
    this.container.querySelectorAll('[data-action="section-menu"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        this.state.activeMenuId = this.state.activeMenuId === secId ? null : secId;
        this.render();
      });
    });

    this.container.querySelectorAll('[data-action="rename-sec"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        const project = this.getProject();
        const currentSec = project.sections?.[secId];
        const newName = await showPromptDialog({
          title: 'Rename Section',
          label: 'Section Name',
          defaultValue: currentSec?.name,
          confirmText: 'Save',
          required: true
        });
        if (newName && newName.trim()) {
          this.updateProject(p => { p.sections[secId].name = newName.trim(); });
        }
      });
    });

    this.container.querySelectorAll('[data-action="duplicate-sec"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        const project = this.getProject();
        const sec = project.sections?.[secId];
        if (!sec) return;

        const newSec = createSection({
          name: `${sec.name} (Copy)`,
          description: sec.description
        });

        const newCompIds = [];
        const newComps = {};
        for (const cId of sec.componentOrder || []) {
          const comp = project.components?.[cId];
          if (comp) {
            const dup = createComponentInstance({ ...comp, id: null, name: `${comp.name} Copy` });
            newComps[dup.id] = dup;
            newCompIds.push(dup.id);
          }
        }
        newSec.componentOrder = newCompIds;

        this.updateProject(p => {
          p.sections[newSec.id] = newSec;
          Object.assign(p.components, newComps);
          const idx = p.sectionOrder.indexOf(secId);
          p.sectionOrder.splice(idx + 1, 0, newSec.id);
        });
      });
    });

    this.container.querySelectorAll('[data-action="delete-sec"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        const project = this.getProject();
        const sec = project.sections?.[secId];
        const ok = await showConfirmDialog({
          title: 'Delete Section',
          message: `Are you sure you want to delete section "${sec?.name}"? Its components will be kept as unsectioned.`,
          confirmText: 'Delete Section',
          isDanger: true
        });
        if (ok) {
          this.updateProject(p => {
            p.sectionOrder = p.sectionOrder.filter(id => id !== secId);
            if (sec.componentOrder && sec.componentOrder.length > 0) {
              if (!p.unsectionedComponentOrder) p.unsectionedComponentOrder = [];
              p.unsectionedComponentOrder.push(...sec.componentOrder);
            }
            delete p.sections[secId];
          });
          this.state.selectedType = 'course';
          this.state.selectedId = null;
          this.render();
        }
      });
    });

    this.container.querySelectorAll('[data-action="move-sec-up"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        this.updateProject(p => {
          const idx = p.sectionOrder.indexOf(secId);
          if (idx > 0) {
            const temp = p.sectionOrder[idx - 1];
            p.sectionOrder[idx - 1] = secId;
            p.sectionOrder[idx] = temp;
          }
        });
      });
    });

    this.container.querySelectorAll('[data-action="move-sec-down"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const secId = btn.dataset.secId;
        this.updateProject(p => {
          const idx = p.sectionOrder.indexOf(secId);
          if (idx < p.sectionOrder.length - 1) {
            const temp = p.sectionOrder[idx + 1];
            p.sectionOrder[idx + 1] = secId;
            p.sectionOrder[idx] = temp;
          }
        });
      });
    });

    // Inspector component name editing
    const inspNameInput = this.container.querySelector('#insp-comp-name');
    if (inspNameInput) {
      inspNameInput.addEventListener('change', (e) => {
        const newName = e.target.value.trim();
        const compId = this.state.selectedId;
        if (newName && compId) {
          this.updateProject(p => {
            if (p.components?.[compId]) p.components[compId].name = newName;
          });
        }
      });
    }

    // Inspector component status editing
    const inspStatusSelect = this.container.querySelector('#insp-comp-status');
    if (inspStatusSelect) {
      inspStatusSelect.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        const compId = this.state.selectedId;
        if (compId) {
          this.updateProject(p => {
            if (p.components?.[compId]) p.components[compId].status = newStatus;
          });
        }
      });
    }

    // Component Status Change select in row
    this.container.querySelectorAll('[data-action="change-status"]').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const compId = select.dataset.compId;
        const newStatus = select.value;
        this.updateProject(p => {
          if (p.components?.[compId]) {
            p.components[compId].status = newStatus;
          }
        });
      });
    });

    // Component Move Up / Move Down
    this.container.querySelectorAll('[data-action="move-comp-up"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const secId = btn.dataset.secId;
        this.updateProject(p => {
          const order = secId && p.sections?.[secId] ? p.sections[secId].componentOrder : p.unsectionedComponentOrder;
          const idx = order.indexOf(compId);
          if (idx > 0) {
            const temp = order[idx - 1];
            order[idx - 1] = compId;
            order[idx] = temp;
          }
        });
      });
    });

    this.container.querySelectorAll('[data-action="move-comp-down"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const secId = btn.dataset.secId;
        this.updateProject(p => {
          const order = secId && p.sections?.[secId] ? p.sections[secId].componentOrder : p.unsectionedComponentOrder;
          const idx = order.indexOf(compId);
          if (idx < order.length - 1) {
            const temp = order[idx + 1];
            order[idx + 1] = compId;
            order[idx] = temp;
          }
        });
      });
    });

    // Component Action Menus
    this.container.querySelectorAll('[data-action="comp-menu"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        this.state.activeMenuId = this.state.activeMenuId === compId ? null : compId;
        this.render();
      });
    });

    this.container.querySelectorAll('[data-action="rename-comp"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const project = this.getProject();
        const comp = project.components?.[compId];
        const newName = await showPromptDialog({
          title: 'Rename Component',
          label: 'Component Name',
          defaultValue: comp?.name,
          confirmText: 'Save',
          required: true
        });
        if (newName && newName.trim()) {
          this.updateProject(p => { p.components[compId].name = newName.trim(); });
        }
      });
    });

    this.container.querySelectorAll('[data-action="duplicate-comp"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const project = this.getProject();
        const comp = project.components?.[compId];
        if (!comp) return;

        const dup = createComponentInstance({
          ...comp,
          id: null,
          name: `${comp.name} Copy`
        });

        this.updateProject(p => {
          p.components[dup.id] = dup;
          let placed = false;
          for (const sec of Object.values(p.sections || {})) {
            if (sec.componentOrder && sec.componentOrder.includes(compId)) {
              sec.componentOrder.push(dup.id);
              placed = true;
              break;
            }
          }
          if (!placed) {
            if (!p.unsectionedComponentOrder) p.unsectionedComponentOrder = [];
            p.unsectionedComponentOrder.push(dup.id);
          }
        });
      });
    });

    this.container.querySelectorAll('[data-action="delete-comp"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const compId = btn.dataset.compId;
        const secId = btn.dataset.secId;
        const project = this.getProject();
        const comp = project.components?.[compId];
        const ok = await showConfirmDialog({
          title: 'Delete Component',
          message: `Are you sure you want to delete "${comp?.name || 'this component'}"?`,
          confirmText: 'Delete',
          isDanger: true
        });
        if (ok) {
          this.updateProject(p => {
            if (secId && p.sections?.[secId]) {
              p.sections[secId].componentOrder = (p.sections[secId].componentOrder || []).filter(id => id !== compId);
            } else if (p.unsectionedComponentOrder) {
              p.unsectionedComponentOrder = p.unsectionedComponentOrder.filter(id => id !== compId);
            }
            delete p.components[compId];
          });
          if (this.state.selectedId === compId) {
            this.state.selectedType = 'course';
            this.state.selectedId = null;
            this.render();
          }
        }
      });
    });

    // Outline node selection (Course, Section, Component)
    this.container.querySelectorAll('[data-action="select-node"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeType = btn.dataset.nodeType;
        const nodeId = btn.dataset.nodeId || null;
        this.selectNode(nodeType, nodeId);
      });
    });

    // Toggle section collapse
    this.container.querySelectorAll('[data-toggle-sec]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const secId = btn.dataset.toggleSec;
        this.updateProject(p => {
          if (p.sections?.[secId]) {
            p.sections[secId].collapsed = !p.sections[secId].collapsed;
          }
        });
      });
    });

    // Modal Picker handlers
    const modalHost = this.getModalHost() || this.container;
    if (this.state.isPickerOpen) {
      const modalOverlay = modalHost.querySelector('#picker-modal-overlay');
      const closeBtn = modalHost.querySelector('#picker-close-btn');
      const cancelBtn = modalHost.querySelector('#picker-cancel-btn');
      const searchInput = modalHost.querySelector('#picker-search-input');
      const sectionSelect = modalHost.querySelector('#picker-section-select');

      if (this.cleanupPickerIsolation) {
        this.cleanupPickerIsolation();
        this.cleanupPickerIsolation = null;
      }

      const closePicker = () => {
        if (this.cleanupPickerIsolation) {
          this.cleanupPickerIsolation();
          this.cleanupPickerIsolation = null;
        }
        this.state.isPickerOpen = false;
        this.render();
      };

      if (modalOverlay) {
        this.cleanupPickerIsolation = isolateModal(modalOverlay, {
          triggerElement: this.lastPickerTrigger,
          fallbackSelector: '#wp-header-add-comp-btn',
          onDismiss: closePicker
        });
      }

      if (closeBtn) closeBtn.addEventListener('click', closePicker);
      if (cancelBtn) cancelBtn.addEventListener('click', closePicker);
      if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
          if (e.target === modalOverlay) closePicker();
        });
      }

      if (searchInput && this.pickerNeedsSearchFocus) {
        this.pickerNeedsSearchFocus = false;
        searchInput.focus();
        const end = searchInput.value.length;
        searchInput.setSelectionRange(end, end);
      }

      if (searchInput) {
        // Deliberately NOT this.render(): a full render replaces the whole workspace
        // (including this input), so the element being typed into is destroyed on every
        // keystroke. The replacement carries the right `value` but no focus and a caret
        // at index 0, so each subsequent character is inserted at the *start* — the text
        // appears to type backwards — and the rebuilt modal visibly jumps. Only the two
        // result elements actually depend on the query, so swap just those in place and
        // leave the input node untouched.
        searchInput.addEventListener('input', (e) => {
          this.state.pickerSearch = e.target.value;
          this.refreshPickerResults();
        });
      }

      this.bindPickerResultHandlers();

      if (sectionSelect) {
        sectionSelect.addEventListener('change', (e) => {
          this.state.pickerTargetSectionId = e.target.value || null;
        });
      }

      modalHost.querySelectorAll('[data-picker-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.state.pickerCategory = btn.dataset.pickerCat;
          // A full render here is fine: the chips' own active state lives outside the
          // results area, and no text field has focus to lose.
          this.render();
        });
      });
    }

    // Component details modal handlers
    if (this.state.previewDetailsComp) {
      const detailsOverlay = modalHost.querySelector('#details-modal-overlay');
      const detailsCloseBtn = modalHost.querySelector('#details-close-btn');
      const detailsCancelBtn = modalHost.querySelector('#details-cancel-btn');
      const detailsAddBtn = modalHost.querySelector('#details-add-btn');

      if (this.cleanupDetailsIsolation) {
        this.cleanupDetailsIsolation();
        this.cleanupDetailsIsolation = null;
      }

      const closeDetails = () => {
        if (this.cleanupDetailsIsolation) {
          this.cleanupDetailsIsolation();
          this.cleanupDetailsIsolation = null;
        }
        this.state.previewDetailsComp = null;
        this.render();
      };

      if (detailsOverlay) {
        this.cleanupDetailsIsolation = isolateModal(detailsOverlay, {
          triggerElement: this.lastDetailsTrigger,
          fallbackSelector: '#picker-modal-overlay',
          onDismiss: closeDetails
        });
      }

      if (detailsCloseBtn) detailsCloseBtn.addEventListener('click', closeDetails);
      if (detailsCancelBtn) detailsCancelBtn.addEventListener('click', closeDetails);
      if (detailsOverlay) {
        detailsOverlay.addEventListener('click', (e) => {
          if (e.target === detailsOverlay) closeDetails();
        });
      }

      if (detailsAddBtn) {
        detailsAddBtn.addEventListener('click', () => {
          const compType = detailsAddBtn.dataset.compType;
          closeDetails();
          this.addComponentToProject(compType, this.state.pickerTargetSectionId);
        });
      }
    }
  }
}
