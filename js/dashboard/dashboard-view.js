/**
 * Projects Dashboard View Controller
 * Handles project listing, search, filtering, sorting, visual starter cards, export/import, and deletion.
 */

import {
  clearDraft, deleteProject, duplicateProject, exportProjectJson, getProject,
  compareDraftToSaved, importProjectJson, loadDraft, loadProjects, saveProject, toggleFavoriteProject,
  getUnclaimedLegacyProjects, importLegacyProjectById
} from '../storage.js';
import {
  buildProjectSchemaV3, createComponentInstance, createSection
} from '../project-schema.js';
import { showPromptDialog, showConfirmDialog, isolateModal } from './att-modal.js';
import { showToast } from '../toast.js';
import { attLogoSvg } from '../att-logos.js';
import { importProjectPackage, isProjectPackageFile } from '../project-package.js';
import { collectMediaReferences } from '../media.js';
import { getMediaRecord } from '../media-storage.js';

/**
 * Imports a project from either supported file: a `.json` (content only: media files are not in
 * it) or a `.rise-project.zip` (content plus media). Reports what was actually restored, and names
 * any referenced media that is not available, instead of calling a partial restore a success.
 * @param {File} file
 * @returns {Promise<{ project: any, message: string, level: 'success' | 'warning' }>}
 */
async function importProjectFromFile(file) {
  if (isProjectPackageFile(file)) {
    const { project, restoredMediaCount, missingMedia } = await importProjectPackage(file);
    if (missingMedia.length) {
      return {
        project, level: 'warning',
        message: `Imported “${project.name}” and restored ${restoredMediaCount} media file(s), but ${missingMedia.length} referenced file(s) were not in the package or this browser (${missingMedia.slice(0, 3).join(', ')}${missingMedia.length > 3 ? ', …' : ''}). Re-attach them in the Media Library.`
      };
    }
    return { project, level: 'success', message: `Imported “${project.name}”${restoredMediaCount ? ` and restored ${restoredMediaCount} media file(s)` : ''}.` };
  }
  const project = importProjectJson(await file.text());
  let missing = 0;
  for (const reference of collectMediaReferences(project.config || project)) {
    if (!(await getMediaRecord(reference.mediaId))?.blob) missing += 1;
  }
  if (missing) {
    return {
      project, level: 'warning',
      message: `Imported “${project.name}”, but ${missing} media file(s) it uses are not in this browser: a JSON file holds the content, not the media files. Re-attach them in the Media Library, or import a .rise-project.zip, which includes them.`
    };
  }
  return { project, level: 'success', message: `Project “${project.name}” imported successfully.` };
}

export class DashboardView {
  constructor({
    container = null,
    onOpenProject = null,
    onCreateNewComponent = null,
    onOpenCatalog = null,
    onOpenComponent = null,
    onOpenPostPublish = null,
    onOpenStoryboardImport = null,
    onRestoreDraft = null
  } = {}) {
    this.container = container;
    this.onOpenProject = onOpenProject;
    this.onCreateNewComponent = onCreateNewComponent;
    this.onOpenCatalog = onOpenCatalog;
    this.onOpenComponent = onOpenComponent;
    this.onOpenPostPublish = onOpenPostPublish;
    this.onOpenStoryboardImport = onOpenStoryboardImport;
    this.onRestoreDraft = onRestoreDraft;

    this.state = {
      searchQuery: '',
      filter: 'all', // 'all' | 'favorites' | 'recent'
      sortBy: 'updatedAt', // 'updatedAt' | 'name' | 'componentCount'
      activeMenuProjectId: null,
      isCreateModalOpen: false,
      selectedTemplate: 'standard' // 'standard' | 'blank' | 'single' | 'import'
    };

    this.handleDocumentClick = this.handleDocumentClick.bind(this);
  }

  mount() {
    document.addEventListener('click', this.handleDocumentClick);
    this.render();
  }

  unmount() {
    document.removeEventListener('click', this.handleDocumentClick);
    if (this.cleanupCreateModalIsolation) {
      this.cleanupCreateModalIsolation();
      this.cleanupCreateModalIsolation = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  handleDocumentClick(e) {
    if (!e.target.closest('.project-menu-btn') && !e.target.closest('.project-action-menu')) {
      if (this.state.activeMenuProjectId) {
        this.state.activeMenuProjectId = null;
        this.render();
      }
    }
  }

  getFilteredAndSortedProjects() {
    let list = loadProjects();

    // Text search
    if (this.state.searchQuery.trim()) {
      const q = this.state.searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.clientLabel && p.clientLabel.toLowerCase().includes(q))
      );
    }

    // Filter tabs
    if (this.state.filter === 'favorites') {
      list = list.filter(p => Boolean(p.favorite));
    } else if (this.state.filter === 'recent') {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      list = list.filter(p => Date.parse(p.updatedAt) >= thirtyDaysAgo);
    }

    // Sort
    list.sort((a, b) => {
      if (this.state.sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (this.state.sortBy === 'componentCount') {
        const countA = this.getComponentCount(a);
        const countB = this.getComponentCount(b);
        return countB - countA;
      }
      // default: updatedAt descending
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

    return list;
  }

  getComponentCount(project) {
    if (project.schemaVersion === 3 && project.components) {
      return Object.keys(project.components).length;
    }
    return 1; // legacy single-component
  }

  getSectionCount(project) {
    if (project.schemaVersion === 3 && project.sections) {
      return Object.keys(project.sections).length;
    }
    return 0;
  }

  formatRelativeDate(isoString) {
    if (!isoString) return 'Unknown';
    const timestamp = Date.parse(isoString);
    if (Number.isNaN(timestamp)) return 'Unknown';

    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getModalHost() {
    return document.getElementById('modal-root') || this.container;
  }

  render() {
    if (!this.container) return;
    const projects = this.getFilteredAndSortedProjects();
    const allProjects = loadProjects();
    // Only offer a recovery draft when it holds something the saved project does not.
    const draftRecord = loadDraft();
    const draftStatus = compareDraftToSaved(draftRecord, allProjects);
    const activeDraft = draftStatus.recoverable ? draftRecord : null;
    const draftSavedAt = activeDraft?.updatedAt ? new Date(activeDraft.updatedAt) : null;
    const draftWhen = draftSavedAt && !Number.isNaN(draftSavedAt.getTime()) ? draftSavedAt.toLocaleString() : 'earlier';
    const draftRelation = draftStatus.reason === 'differs'
      ? `It has changes that are not in the saved project “${this.escapeHtml(draftStatus.savedName)}”.`
      : 'It has never been saved as a project.';
    // Projects saved before AT&T and PMI had separate local storage, that this edition
    // can't confidently attribute to itself (audit 2026-09-27, section 3). Never auto-
    // claimed — listed here so the author can import one explicitly, or leave it for the
    // other edition; nothing is touched until they choose.
    const unclaimedLegacy = getUnclaimedLegacyProjects();

    // Clear any previous modal rendered in modal host if modal is closed
    const modalHost = this.getModalHost();
    const existingModal = modalHost?.querySelector('#create-modal-overlay');
    if (existingModal && !this.state.isCreateModalOpen) {
      existingModal.remove();
    }

    this.container.innerHTML = `
      <div class="project-dashboard-view">
        <main class="dashboard-container">

          <!-- Hero Landing Header -->
          <header class="dashboard-hero-section">
            <!-- AT&T Globe: faint watermark in the hero's corner, decorative. -->
            <img class="hero-att-globe-pattern" src="./favicon.svg" alt="" aria-hidden="true">
            <div class="dashboard-hero-content">
              <!-- AT&T logo: white on the dark hero, 40px tall (min 32px). -->
              <div class="hero-att-logo">${attLogoSvg({ tone: 'white', height: 40 })}</div>
              <div class="dashboard-hero-eyebrow">
                <span class="hero-brand-pill">Aptara Learning Interaction Studio · AT&amp;T edition</span>
                <span class="hero-compliance-pill">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Design target: WCAG 2.2 AA · automated brand checks
                </span>
              </div>

              <h1 class="dashboard-hero-title">Course Projects Dashboard <span class="hero-title-accent">· Rise Component Builder</span></h1>
              <p class="dashboard-hero-description">
                Design, preview, audit, and package brand-compliant interactive modules and post-publish course enhancements for Articulate Rise 360 without writing code.
              </p>

              <div class="dashboard-hero-stats">
                <div class="hero-stat-item">
                  <span class="hero-stat-num">${allProjects.length}</span>
                  <span class="hero-stat-label">Saved Courses</span>
                </div>
                <div class="hero-stat-divider"></div>
                <div class="hero-stat-item">
                  <span class="hero-stat-num">26</span>
                  <span class="hero-stat-label">Interactive Blocks</span>
                </div>
                <div class="hero-stat-divider"></div>
                <div class="hero-stat-item">
                  <span class="hero-stat-num">3</span>
                  <span class="hero-stat-label">Post-Publish Tools</span>
                </div>
                <div class="hero-stat-divider"></div>
                <div class="hero-stat-item">
                  <span class="hero-stat-num">Rise 360</span>
                  <span class="hero-stat-label">Embed &amp; HTML export</span>
                </div>
              </div>
            </div>
          </header>

          <!-- Active Draft Recovery Banner (if draft exists in local storage) -->
          ${activeDraft ? `
            <section class="dashboard-draft-banner" aria-label="Resume working draft">
              <div class="draft-banner-left">
                <div class="draft-banner-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </div>
                <div class="draft-banner-text">
                  <div class="draft-banner-tags">
                    <span class="draft-badge-pill">Recovered autosave</span>
                    <span class="draft-badge-type">${this.escapeHtml(activeDraft.type || 'Custom Block')}</span>
                  </div>
                  <h3 class="draft-banner-title">Resume editing “${this.escapeHtml(activeDraft.name || 'Untitled Component')}”</h3>
                  <p class="draft-banner-sub">Autosaved ${this.escapeHtml(draftWhen)} on this device. ${draftRelation} Resume it, or dismiss it to discard the autosave.</p>
                </div>
              </div>
              <div class="draft-banner-actions">
                <button type="button" class="btn btn-att-primary" id="btn-resume-draft">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  <span>Resume Draft</span>
                </button>
                <button type="button" class="btn btn-att-secondary" id="btn-dismiss-draft">Dismiss</button>
              </div>
            </section>
          ` : ''}

          <!-- Unclaimed legacy projects: saved before AT&T/PMI had separate storage, and not
               confidently this edition's own (see getUnclaimedLegacyProjects). Explicit
               per-project import only — nothing here is touched automatically. -->
          ${unclaimedLegacy.length ? `
            <section class="dashboard-legacy-banner" aria-label="Legacy projects from before this edition kept its own storage">
              <div class="draft-banner-left">
                <div class="draft-banner-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>
                </div>
                <div class="draft-banner-text">
                  <div class="draft-banner-tags"><span class="draft-badge-pill">Legacy data found</span></div>
                  <h3 class="draft-banner-title">${unclaimedLegacy.length} project${unclaimedLegacy.length === 1 ? '' : 's'} saved before this edition kept its own storage</h3>
                  <p class="draft-banner-sub">Not shown below until you import ${unclaimedLegacy.length === 1 ? 'it' : 'each one'} — nothing is changed automatically.</p>
                </div>
              </div>
              <div class="legacy-project-list">
                ${unclaimedLegacy.map(p => `
                  <div class="legacy-project-row" data-legacy-id="${this.escapeHtml(p.id)}">
                    <div class="legacy-project-row-text">
                      <span class="legacy-project-name">${this.escapeHtml(p.name)}</span>
                      <span class="legacy-project-meta">${p.clientLabel ? `Labelled “${this.escapeHtml(p.clientLabel)}”` : 'No client label'}</span>
                    </div>
                    <button type="button" class="btn btn-att-secondary btn-sm" data-action="import-legacy-project" data-legacy-id="${this.escapeHtml(p.id)}">Import into this edition</button>
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}

          <!-- Quick Action Starter Grid -->
          <section class="dashboard-starters-section" aria-label="Quick start options">
            <div class="section-header-wrap">
              <h2 class="dashboard-section-heading">Create &amp; Build</h2>
              <span class="dashboard-section-sub">Choose a workflow to start authoring or enhancing learning experiences</span>
            </div>

            <div class="dashboard-starters-grid">
              <!-- Starter 1: 3-Module Course -->
              <div class="starter-card is-primary" id="starter-action-course" role="button" tabindex="0">
                <div class="starter-card-badge">Recommended</div>
                <div class="starter-card-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </div>
                <h3 class="starter-card-title">3-Module Sample Course</h3>
                <p class="starter-card-desc">Generate a multi-module sample course with Fiber Deployment, 5G Architecture, and Safety &amp; Compliance blocks.</p>
                <div class="starter-card-footer">
                  <span class="starter-card-cta">Launch Course Builder →</span>
                </div>
              </div>

              <!-- Starter 2: Post-Publish Tools -->
              <div class="starter-card" id="starter-action-postpublish" role="button" tabindex="0">
                <div class="starter-card-badge is-accent">Rise Enhancer</div>
                <div class="starter-card-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <h3 class="starter-card-title">Rise Post-Publish Toolkit</h3>
                <p class="starter-card-desc">Add a persistent Course Tools launcher with a Glossary, a Resource Center and Help &amp; Support to a Rise Web or SCORM export you upload.</p>
                <div class="starter-card-footer">
                  <span class="starter-card-cta">Open Package Tools →</span>
                </div>
              </div>

              <!-- Starter 3: Import Package -->
              <div class="starter-card" id="starter-action-import" role="button" tabindex="0">
                <div class="starter-card-badge is-neutral">JSON / ZIP</div>
                <div class="starter-card-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </div>
                <h3 class="starter-card-title">Import Project Package</h3>
                <p class="starter-card-desc">Restore an existing course project file or packaged interactive component from your device.</p>
                <div class="starter-card-footer">
                  <span class="starter-card-cta">Upload Project File →</span>
                </div>
              </div>

              <!-- Starter 4: Storyboard Import -->
              <div class="starter-card" id="starter-action-storyboard" role="button" tabindex="0">
                <div class="starter-card-badge is-neutral">.docx</div>
                <div class="starter-card-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line></svg>
                </div>
                <h3 class="starter-card-title">Import Storyboard (.docx)</h3>
                <p class="starter-card-desc">Build a new course project from an instructional designer's filled-in storyboard document.</p>
                <div class="starter-card-footer">
                  <span class="starter-card-cta">Upload Storyboard →</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Course Projects Workspace Section -->
          <section class="dashboard-projects-section" aria-label="Course projects workspace">
            <div class="projects-section-header">
              <div>
                <h2 class="dashboard-section-heading">Course Projects Workspace</h2>
                <span class="dashboard-section-sub">Manage and edit your saved Articulate Rise courses</span>
              </div>
              <button type="button" class="btn btn-att-primary" id="dash-create-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>New Course Project</span>
              </button>
            </div>

            <!-- Controls Bar (Search, Filters, Sort) -->
            <div class="dashboard-controls">
              <div class="dashboard-search-wrapper">
                <svg class="dashboard-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  id="dash-search-input"
                  class="dashboard-search-input"
                  type="search"
                  placeholder="Search courses by name or client..."
                  value="${this.escapeHtml(this.state.searchQuery)}"
                  aria-label="Search projects"
                />
              </div>

              <div class="dashboard-filters-group">
                <button class="filter-chip ${this.state.filter === 'all' ? 'active' : ''}" data-filter="all">All Projects (${allProjects.length})</button>
                <button class="filter-chip ${this.state.filter === 'favorites' ? 'active' : ''}" data-filter="favorites">Favorites</button>
                <button class="filter-chip ${this.state.filter === 'recent' ? 'active' : ''}" data-filter="recent">Recent</button>
              </div>

              <div class="dashboard-sort-wrapper">
                <label for="dash-sort-select" class="dashboard-sort-label">Sort:</label>
                <select id="dash-sort-select" class="dashboard-sort-select" aria-label="Sort projects list">
                  <option value="updatedAt" ${this.state.sortBy === 'updatedAt' ? 'selected' : ''}>Last Modified</option>
                  <option value="name" ${this.state.sortBy === 'name' ? 'selected' : ''}>Alphabetical</option>
                  <option value="componentCount" ${this.state.sortBy === 'componentCount' ? 'selected' : ''}>Components Count</option>
                </select>
              </div>
            </div>

            <!-- Grid or Empty State -->
            ${projects.length > 0 ? `
              <div class="dashboard-projects-grid">
                ${projects.map(p => this.renderProjectCard(p)).join('')}
              </div>
            ` : `
              <div class="dashboard-empty-state">
                <div class="empty-state-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <h3 class="empty-state-title">${this.state.searchQuery ? 'No matching projects found' : 'No course projects yet'}</h3>
                <p class="empty-state-subtitle">${this.state.searchQuery ? 'Try modifying your search or clearing the active filter.' : 'Get started by creating a new course project or loading a starter template.'}</p>
                <button id="dash-empty-create-btn" class="btn btn-att-primary">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>Create Project</span>
                </button>
              </div>
            `}
          </section>

        </main>
      </div>
    `;

    // Render Modal into modal host
    if (this.state.isCreateModalOpen) {
      if (modalHost && modalHost !== this.container) {
        let overlay = modalHost.querySelector('#create-modal-overlay');
        if (!overlay) {
          const temp = document.createElement('div');
          temp.innerHTML = this.renderCreateModal();
          overlay = temp.firstElementChild;
          if (overlay) modalHost.appendChild(overlay);
        } else {
          overlay.outerHTML = this.renderCreateModal();
        }
      } else {
        this.container.insertAdjacentHTML('beforeend', this.renderCreateModal());
      }
    } else {
      modalHost?.querySelector('#create-modal-overlay')?.remove();
    }

    this.attachEventListeners();
  }

  renderProjectCard(project) {
    const compCount = this.getComponentCount(project);
    const secCount = this.getSectionCount(project);
    const isMenuOpen = this.state.activeMenuProjectId === project.id;

    return `
      <div class="project-card" data-project-id="${project.id}">
        <div class="project-card-header">
          <div class="project-card-tags">
            <span class="project-client-badge">${this.escapeHtml(project.clientLabel || 'AT&T')}</span>
            ${project.schemaVersion === 3 ? `<span class="project-version-badge">Course Project</span>` : ''}
          </div>
          <div class="project-card-actions">
            <button
              class="project-favorite-btn ${project.favorite ? 'active' : ''}"
              data-action="favorite"
              data-id="${project.id}"
              title="${project.favorite ? 'Remove from favorites' : 'Add to favorites'}"
              aria-label="${project.favorite ? 'Remove from favorites' : 'Add to favorites'}"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${project.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            <button
              class="project-menu-btn"
              data-action="menu"
              data-id="${project.id}"
              title="Project actions"
              aria-label="Project actions"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
          </div>
        </div>

        <div class="project-card-body" data-action="open" data-id="${project.id}">
          <h3 class="project-card-title">${this.escapeHtml(project.name)}</h3>
          <p class="project-card-desc">${this.escapeHtml(project.description || 'No description provided.')}</p>
        </div>

        <div class="project-card-stats">
          <div class="project-stat-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>${compCount} ${compCount === 1 ? 'component' : 'components'}</span>
          </div>
          ${secCount > 0 ? `
            <div class="project-stat-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
              <span>${secCount} ${secCount === 1 ? 'section' : 'sections'}</span>
            </div>
          ` : ''}
        </div>

        <div class="project-card-footer">
          <span>Edited ${this.formatRelativeDate(project.updatedAt)}</span>
        </div>

        ${isMenuOpen ? `
          <div class="project-action-menu">
            <button class="project-menu-item" data-action="open" data-id="${project.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              Open Workspace
            </button>
            <button class="project-menu-item" data-action="rename" data-id="${project.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              Rename
            </button>
            <button class="project-menu-item" data-action="duplicate" data-id="${project.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Duplicate
            </button>
            <button class="project-menu-item" data-action="export-json" data-id="${project.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export JSON
            </button>
            <button class="project-menu-item text-danger" data-action="delete" data-id="${project.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderCreateModal() {
    const selectedTemplate = this.state.selectedTemplate || 'standard';

    return `
      <div class="modal-overlay is-active" id="create-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-project-modal-title">
        <div class="modal-card" style="max-width: 680px; width: 100%;">
          <div class="modal-header">
            <div>
              <h2 id="create-project-modal-title" class="modal-title">Create Course Project</h2>
              <p style="margin: 2px 0 0 0; font-size: 0.8125rem; color: #666;">Choose a starting structure and configure project details.</p>
            </div>
            <button id="modal-close-btn" class="project-menu-btn" aria-label="Close dialog" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <form id="new-project-form">
            <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
              <!-- 4 Starting-Point Cards -->
              <div>
                <label class="form-label" style="font-weight: 700; margin-bottom: 8px; display: block;">Select Starting Point</label>
                <div class="starter-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                  <!-- Card 1: 3-Module Starter -->
                  <div class="starter-point-card ${selectedTemplate === 'standard' ? 'active' : ''}" data-starter-tpl="standard" tabindex="0" role="radio" aria-checked="${selectedTemplate === 'standard'}" style="border: 2px solid ${selectedTemplate === 'standard' ? 'var(--att-cobalt, #00388F)' : 'var(--att-border, #DCDFE3)'}; background: ${selectedTemplate === 'standard' ? '#F0F7FF' : 'var(--att-surface, #FFF)'}; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-weight: 700; font-size: 0.875rem; color: var(--att-cobalt, #00388F);">3-Module Sample Course</span>
                      <span style="font-size: 0.75rem; color: ${selectedTemplate === 'standard' ? 'var(--att-cobalt, #00388F)' : '#999'};">★</span>
                    </div>
                    <p style="margin: 0; font-size: 0.75rem; color: #555; line-height: 1.3;">Fiber Deployment, 5G Architecture &amp; Compliance.</p>
                    <span style="font-size: 0.6875rem; background: rgba(0, 56, 143, 0.08); color: var(--att-cobalt, #00388F); padding: 1px 6px; border-radius: 4px; align-self: flex-start; margin-top: auto;">Recommended</span>
                  </div>

                  <!-- Card 2: Blank Course -->
                  <div class="starter-point-card ${selectedTemplate === 'blank' ? 'active' : ''}" data-starter-tpl="blank" tabindex="0" role="radio" aria-checked="${selectedTemplate === 'blank'}" style="border: 2px solid ${selectedTemplate === 'blank' ? 'var(--att-cobalt, #00388F)' : 'var(--att-border, #DCDFE3)'}; background: ${selectedTemplate === 'blank' ? '#F0F7FF' : 'var(--att-surface, #FFF)'}; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-weight: 700; font-size: 0.875rem; color: #111;">Blank Course</span>
                    <p style="margin: 0; font-size: 0.75rem; color: #555; line-height: 1.3;">Empty workspace for custom outlines.</p>
                    <span style="font-size: 0.6875rem; background: #EFEFEF; color: #555; padding: 1px 6px; border-radius: 4px; align-self: flex-start; margin-top: auto;">Custom</span>
                  </div>

                  <!-- Card 3: Single Component -->
                  <div class="starter-point-card ${selectedTemplate === 'single' ? 'active' : ''}" data-starter-tpl="single" tabindex="0" role="radio" aria-checked="${selectedTemplate === 'single'}" style="border: 2px solid ${selectedTemplate === 'single' ? 'var(--att-cobalt, #00388F)' : 'var(--att-border, #DCDFE3)'}; background: ${selectedTemplate === 'single' ? '#F0F7FF' : 'var(--att-surface, #FFF)'}; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-weight: 700; font-size: 0.875rem; color: #111;">Single Block</span>
                    <p style="margin: 0; font-size: 0.75rem; color: #555; line-height: 1.3;">Accordion starter block.</p>
                    <span style="font-size: 0.6875rem; background: #EFEFEF; color: #555; padding: 1px 6px; border-radius: 4px; align-self: flex-start; margin-top: auto;">Quick Edit</span>
                  </div>

                  <!-- Card 4: Import Existing Project -->
                  <div class="starter-point-card ${selectedTemplate === 'import' ? 'active' : ''}" data-starter-tpl="import" tabindex="0" role="radio" aria-checked="${selectedTemplate === 'import'}" style="border: 2px solid ${selectedTemplate === 'import' ? 'var(--att-cobalt, #00388F)' : 'var(--att-border, #DCDFE3)'}; background: ${selectedTemplate === 'import' ? '#F0F7FF' : 'var(--att-surface, #FFF)'}; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-weight: 700; font-size: 0.875rem; color: #111;">Import Project</span>
                    <p style="margin: 0; font-size: 0.75rem; color: #555; line-height: 1.3;">Upload saved JSON package.</p>
                    <span style="font-size: 0.6875rem; background: #EFEFEF; color: #555; padding: 1px 6px; border-radius: 4px; align-self: flex-start; margin-top: auto;">File upload</span>
                  </div>
                </div>
                <input type="hidden" id="np-template" value="${selectedTemplate}" />
              </div>

              ${selectedTemplate === 'import' ? `
                <div class="form-group" style="background: var(--att-surface-sunken, #FAFAFA); padding: 16px; border-radius: 8px; border: 1.5px dashed var(--att-border, #CBD5E1); text-align: center;">
                  <label for="np-import-file" style="display: block; font-weight: 600; font-size: 0.875rem; margin-bottom: 8px;">Select a project file (.json, or .rise-project.zip with media)</label>
                  <input type="file" id="np-import-file" accept=".json,.zip,application/json,application/zip" style="font-size: 0.8125rem;" required />
                </div>
              ` : `
                <div class="form-group">
                  <label for="np-name" class="form-label">Project Name *</label>
                  <input id="np-name" class="form-input" type="text" placeholder="e.g., 5G Network Fundamentals" required autofocus value="${selectedTemplate === 'standard' ? 'AT&T 3-Module Starter Course' : ''}" />
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
                  <div class="form-group">
                    <label for="np-client" class="form-label">Client / Brand Tag</label>
                    <input id="np-client" class="form-input" type="text" value="AT&T" />
                  </div>
                  <div class="form-group">
                    <label for="np-desc" class="form-label">Description (optional)</label>
                    <input id="np-desc" class="form-input" type="text" placeholder="Course overview and objectives..." value="${selectedTemplate === 'standard' ? 'Interactive 3-module course structure with Fiber Deployment, 5G Architecture, and Safety & Compliance Check.' : ''}" />
                  </div>
                </div>
              `}
            </div>
            <div class="modal-footer">
              <button type="button" id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary">${selectedTemplate === 'import' ? 'Import & Open' : 'Create Project'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Resume draft button
    const resumeDraftBtn = this.container.querySelector('#btn-resume-draft');
    if (resumeDraftBtn) {
      resumeDraftBtn.addEventListener('click', () => {
        const draft = loadDraft();
        if (draft && this.onRestoreDraft) {
          this.onRestoreDraft(draft);
        } else if (this.onOpenCatalog) {
          this.onOpenCatalog();
        }
      });
    }

    // Dismiss draft button
    const dismissDraftBtn = this.container.querySelector('#btn-dismiss-draft');
    if (dismissDraftBtn) {
      dismissDraftBtn.addEventListener('click', () => {
        clearDraft();
        showToast('Draft dismissed.', 'info');
        this.render();
      });
    }

    // Import a legacy (pre-edition-split) project explicitly, one at a time.
    this.container.querySelectorAll('[data-action="import-legacy-project"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.legacyId;
        try {
          const imported = importLegacyProjectById(id);
          showToast(`Imported “${imported.name}”.`, 'success');
          this.render();
        } catch (error) {
          showToast(`Import failed: ${error.message}`, 'error', 6000);
        }
      });
    });

    // Quick Action Starters
    const starterCourse = this.container.querySelector('#starter-action-course');
    if (starterCourse) {
      starterCourse.addEventListener('click', () => {
        const newProject = this.createNewProjectFromTemplate({
          name: 'AT&T 3-Module Starter Course',
          client: 'AT&T',
          desc: 'Interactive 3-module course structure with Introduction, Deep Dive, and Knowledge Check.',
          template: 'standard'
        });
        saveProject(newProject);
        showToast(`Created “${newProject.name}”.`, 'success');
        if (this.onOpenProject) this.onOpenProject(newProject.id);
      });
      starterCourse.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          starterCourse.click();
        }
      });
    }

    const starterPostPublish = this.container.querySelector('#starter-action-postpublish');
    if (starterPostPublish) {
      starterPostPublish.addEventListener('click', () => {
        if (this.onOpenPostPublish) this.onOpenPostPublish();
      });
      starterPostPublish.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          starterPostPublish.click();
        }
      });
    }

    const starterImport = this.container.querySelector('#starter-action-import');
    if (starterImport) {
      starterImport.addEventListener('click', (e) => {
        this.lastCreateTrigger = e?.currentTarget;
        this.state.selectedTemplate = 'import';
        this.state.isCreateModalOpen = true;
        this.render();
      });
      starterImport.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          starterImport.click();
        }
      });
    }

    const starterStoryboard = this.container.querySelector('#starter-action-storyboard');
    if (starterStoryboard) {
      starterStoryboard.addEventListener('click', () => {
        if (this.onOpenStoryboardImport) this.onOpenStoryboardImport();
      });
      starterStoryboard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          starterStoryboard.click();
        }
      });
    }

    // Search input
    const searchInput = this.container.querySelector('#dash-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const caret = e.target.selectionStart;
        this.state.searchQuery = e.target.value;
        this.render();
        // render() rebuilds the whole view, including this input; put the author back where they were typing.
        const fresh = this.container.querySelector('#dash-search-input');
        if (fresh) {
          fresh.focus();
          const at = caret ?? fresh.value.length;
          fresh.setSelectionRange(at, at);
        }
      });
    }

    // Filter chips
    this.container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.filter = btn.dataset.filter;
        this.render();
      });
    });

    // Sort select
    const sortSelect = this.container.querySelector('#dash-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.state.sortBy = e.target.value;
        this.render();
      });
    }

    // New Project & Import buttons
    const openModal = (e, tpl = 'standard') => {
      this.lastCreateTrigger = e?.currentTarget;
      this.state.selectedTemplate = tpl;
      this.state.isCreateModalOpen = true;
      this.render();
    };
    document.querySelectorAll('#dash-create-btn, .dash-btn-create, #dash-empty-create-btn').forEach(btn => {
      /** @type {HTMLElement} */ (btn).onclick = (e) => openModal(e, 'standard');
    });

    const headerImportBtn = document.getElementById('dash-import-btn');
    const headerImportInput = /** @type {HTMLInputElement|null} */ (document.getElementById('dash-import-file-input'));
    if (headerImportBtn && headerImportInput) {
      headerImportBtn.onclick = () => headerImportInput.click();
      headerImportInput.onchange = async () => {
        const file = headerImportInput.files?.[0];
        if (!file) return;
        try {
          const { project: imported, message, level } = await importProjectFromFile(file);
          showToast(message, level, level === 'success' ? undefined : 8000);
          this.render();
          if (this.onOpenProject) this.onOpenProject(imported.id);
        } catch (err) {
          showToast(`Import failed: ${err.message}`, 'error', 8000);
        } finally {
          headerImportInput.value = '';
        }
      };
    }

    // Project card clicks and action menu items
    this.container.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        const action = actionBtn ? actionBtn.dataset.action : 'open';
        const id = (actionBtn && actionBtn.dataset.id) || card.dataset.projectId;
        if (!id) return;
        e.stopPropagation();

        if (action === 'favorite') {
          toggleFavoriteProject(id);
          this.render();
        } else if (action === 'menu') {
          this.state.activeMenuProjectId = this.state.activeMenuProjectId === id ? null : id;
          this.render();
        } else if (action === 'open') {
          this.state.activeMenuProjectId = null;
          if (this.onOpenProject) this.onOpenProject(id);
        } else if (action === 'rename') {
          this.state.activeMenuProjectId = null;
          const current = getProject(id);
          const newName = await showPromptDialog({
            title: 'Rename Project',
            label: 'Project Name',
            defaultValue: current?.name,
            confirmText: 'Save',
            required: true
          });
          if (newName && newName.trim()) {
            saveProject({ ...current, name: newName.trim(), updatedAt: new Date().toISOString() });
            this.render();
          }
        } else if (action === 'duplicate') {
          this.state.activeMenuProjectId = null;
          duplicateProject(id);
          this.render();
        } else if (action === 'export-json') {
          this.state.activeMenuProjectId = null;
          this.triggerDownloadJson(id);
        } else if (action === 'delete') {
          this.state.activeMenuProjectId = null;
          const current = getProject(id);
          const ok = await showConfirmDialog({
            title: 'Delete Project',
            message: `Are you sure you want to delete "${current?.name}"? This action cannot be undone.`,
            confirmText: 'Delete Project',
            isDanger: true
          });
          if (ok) {
            deleteProject(id);
            this.render();
          }
        }
      });
    });

    // Create Modal handlers
    if (this.state.isCreateModalOpen) {
      const modalHost = this.getModalHost();
      const modalOverlay = modalHost.querySelector('#create-modal-overlay') || this.container.querySelector('#create-modal-overlay');
      const closeBtn = modalOverlay?.querySelector('#modal-close-btn');
      const cancelBtn = modalOverlay?.querySelector('#modal-cancel-btn');
      const form = modalOverlay?.querySelector('#new-project-form');

      if (this.cleanupCreateModalIsolation) {
        this.cleanupCreateModalIsolation();
        this.cleanupCreateModalIsolation = null;
      }

      const closeModal = () => {
        if (this.cleanupCreateModalIsolation) {
          this.cleanupCreateModalIsolation();
          this.cleanupCreateModalIsolation = null;
        }
        this.state.isCreateModalOpen = false;
        this.render();
      };

      if (modalOverlay) {
        this.cleanupCreateModalIsolation = isolateModal(modalOverlay, {
          triggerElement: this.lastCreateTrigger,
          fallbackSelector: '#dash-create-btn',
          onDismiss: closeModal
        });
      }

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
          if (e.target === modalOverlay) closeModal();
        });
      }

      // Starter card clicks & keyboard Enter/Space activation
      (modalOverlay || this.container).querySelectorAll('[data-starter-tpl]').forEach(card => {
        const selectCard = () => {
          this.state.selectedTemplate = card.dataset.starterTpl;
          this.render();
        };
        card.addEventListener('click', selectCard);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard();
          }
        });
      });

      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const template = this.state.selectedTemplate || 'standard';

          if (template === 'import') {
            const fileInput = form.querySelector('#np-import-file');
            const file = fileInput?.files?.[0];
            if (!file) {
              showToast('Please select a project file (.json or .rise-project.zip) to import.', 'error');
              return;
            }
            try {
              const { project: imported, message, level } = await importProjectFromFile(file);
              showToast(message, level, level === 'success' ? undefined : 8000);
              closeModal();
              if (this.onOpenProject) this.onOpenProject(imported.id);
            } catch (err) {
              showToast(`Import failed: ${err.message}`, 'error', 8000);
            }
            return;
          }

          const name = form.querySelector('#np-name')?.value || 'New Project';
          const client = form.querySelector('#np-client')?.value || 'AT&T';
          const desc = form.querySelector('#np-desc')?.value || '';

          const createdProject = this.createNewProjectFromTemplate({ name, client, desc, template });
          saveProject(createdProject);
          closeModal();

          if (this.onOpenProject) {
            this.onOpenProject(createdProject.id);
          }
        });
      }
    }
  }

  createNewProjectFromTemplate({ name, client, desc, template }) {
    if (template === 'standard') {
      const sec1 = createSection({ name: 'Module 1: Fiber Deployment', description: 'Foundational concepts and physical infrastructure rollout' });
      const sec2 = createSection({ name: 'Module 2: 5G Architecture', description: 'Core technical pillars, RAN, and mobile edge topology' });
      const sec3 = createSection({ name: 'Module 3: Compliance & Safety', description: 'Interactive knowledge check and optical safety standards' });

      const comp1 = createComponentInstance({
        name: 'Fiber Deployment Process',
        type: 'accordion',
        status: 'draft',
        config: {
          blockTitle: 'Fiber Network Deployment',
          blockHeadline: 'Enterprise Fiber Rollout',
          blockSubtext: 'Explore the key technical phases and engineering standards for enterprise fiber optic deployment.',
          title: 'Fiber Network Deployment',
          description: 'Explore the key technical phases and engineering standards for enterprise fiber optic deployment.',
          accordionMulti: true,
          accordionAnimation: true,
          iconStyle: 'chevron',
          items: [
            { title: 'Permitting & Right-of-Way', content: 'Secure municipal permits, utility pole attachment agreements, and environmental clearances prior to construction.' },
            { title: 'Trenching & Conduit Placement', content: 'Execute directional boring and trenching to place heavy-duty HDPE micro-duct conduits following strict depth standards.' },
            { title: 'Fiber Splicing & Optical Testing', content: 'Perform precision fusion splicing, OTDR trace analysis, and power meter testing to certify optical signal loss under 0.2 dB/km.' }
          ]
        }
      });

      const comp2 = createComponentInstance({
        name: '5G Architecture & Core Pillars',
        type: 'tab-blocks',
        status: 'draft',
        config: {
          blockTitle: 'Next-Gen 5G Architecture',
          blockHeadline: 'Network Core & Edge Topology',
          blockSubtext: 'Examine the multi-tier architectural components delivering ultra-reliable low-latency connectivity.',
          title: 'Next-Gen 5G Architecture',
          description: 'Examine the multi-tier architectural components delivering ultra-reliable low-latency connectivity.',
          tabsOrientation: 'horizontal',
          items: [
            { title: 'Radio Access Network (RAN)', content: 'Massive MIMO active antenna units and baseband units dynamically allocate cellular spectrum across mmWave and sub-6GHz bands.' },
            { title: '5G Standalone Core', content: 'Cloud-native service-based architecture (SBA) featuring User Plane Function (UPF) routing and granular network slicing.' },
            { title: 'Multi-Access Edge Computing (MEC)', content: 'Distributed compute nodes co-located near cell towers reduce round-trip application latency to single-digit milliseconds.' }
          ]
        }
      });

      const comp3 = createComponentInstance({
        name: 'Fiber Safety & Compliance Check',
        type: 'multiple-choice',
        status: 'draft',
        config: {
          blockTitle: 'Optical Safety & Compliance',
          blockHeadline: 'Knowledge Check: Field Protocols',
          blockSubtext: 'Test your understanding of laser safety standards and optical field splicing protocols.',
          title: 'Optical Safety & Compliance',
          description: 'Test your understanding of laser safety standards and optical field splicing protocols.',
          mcQuestionPrompt: 'Which optical test must be completed and certified before connecting customer terminal equipment to a newly spliced fiber run?',
          mcSubmitButtonText: 'Submit Answer',
          mcMaxAttempts: 1,
          mcConfidenceMode: false,
          items: [
            { title: 'Visual Fault Locator (VFL) Red Light Check Only', label: 'Visual Fault Locator (VFL) Red Light Check Only', content: 'VFL is a quick continuity indicator, not an insertion-loss certification tool.', correct: false },
            { title: 'OTDR Trace & Power Meter Loss Certification', label: 'OTDR Trace &amp; Power Meter Loss Certification (Required)', content: 'Optical Time-Domain Reflectometry (OTDR) and calibrated optical power loss measurements certify that insertion loss meets enterprise dB specifications.', correct: true },
            { title: 'Standard Ethernet Loopback Ping', label: 'Standard Ethernet Loopback Ping', content: 'Ethernet loopback checks Layer 2 data links after active electronics are powered, not physical fiber cable integrity.', correct: false }
          ]
        }
      });

      sec1.componentOrder = [comp1.id];
      sec2.componentOrder = [comp2.id];
      sec3.componentOrder = [comp3.id];

      return buildProjectSchemaV3({
        name,
        clientLabel: client,
        description: desc,
        sectionOrder: [sec1.id, sec2.id, sec3.id],
        sections: { [sec1.id]: sec1, [sec2.id]: sec2, [sec3.id]: sec3 },
        components: { [comp1.id]: comp1, [comp2.id]: comp2, [comp3.id]: comp3 }
      });
    }

    if (template === 'single') {
      const comp = createComponentInstance({
        name: `${name} Overview`,
        type: 'accordion',
        status: 'draft',
        config: {
          blockTitle: `${name} Overview`,
          blockHeadline: 'Interactive Module',
          blockSubtext: 'Review essential guidance and interactive reference topics.',
          title: `${name} Overview`,
          description: 'Review essential guidance and interactive reference topics.',
          accordionMulti: true,
          accordionAnimation: true,
          iconStyle: 'chevron',
          items: [
            { title: 'Project Overview & Objectives', content: 'Explore core learning objectives, system architecture, and operational expectations.' },
            { title: 'Technical Specifications & Guidelines', content: 'Review standard operating procedures, API contracts, and engineering constraints.' },
            { title: 'Summary & Best Practices', content: 'Reinforce essential takeaways and compliance checkpoints before proceeding.' }
          ]
        }
      });

      return buildProjectSchemaV3({
        name,
        clientLabel: client,
        description: desc,
        unsectionedComponentOrder: [comp.id],
        components: { [comp.id]: comp }
      });
    }

    // Blank project
    return buildProjectSchemaV3({
      name,
      clientLabel: client,
      description: desc,
      sectionOrder: [],
      sections: {},
      unsectionedComponentOrder: [],
      components: {}
    });
  }

  triggerDownloadJson(projectId) {
    try {
      const jsonStr = exportProjectJson(projectId);
      const project = getProject(projectId);
      const filename = `${(project?.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v3.json`;
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Could not export JSON: ${err.message}`);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export function createNewProjectFromTemplate(options = 'standard') {
  const opts = typeof options === 'string' ? { template: options } : options;
  const view = new DashboardView({});
  return view.createNewProjectFromTemplate({
    name: opts.name || 'Demo Course',
    client: opts.client || 'AT&T',
    desc: opts.desc || 'Interactive demonstration course',
    template: opts.template || 'standard'
  });
}
