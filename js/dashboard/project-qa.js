/**
 * @file project-qa.js
 * Project QA Aggregator View Controller
 * Performs aggregated technical validation, accessibility checks, brand compliance,
 * and editorial readiness scoring across all course components.
 */

import { getProject } from '../storage.js';
import { showPreExportReviewDialog, buildCourseProjectZip, downloadCourseProjectZip } from './project-export.js';
import { showToast } from '../toast.js';
import { describeTechnicalStatus, getCourseReadiness } from './course-readiness.js';
import { getEditorSchema } from '../editor-schemas.js';
import { primaryField } from '../validation.js';

/**
 * Performs a deep audit of a course project.
 * @param {Object} project
 * @returns {Object} Full audit report with separate technical and editorial metrics
 */
export function auditCourseProject(project) {
  const components = Object.values(project?.components || {});
  const totalComponents = components.length;

  let blockerCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let recommendationCount = 0;
  let passedCount = 0;

  let draftCount = 0;
  let readyCount = 0;
  let inReviewCount = 0;

  const componentReports = [];

  for (const comp of components) {
    const cfg = comp.config || {};
    const compIssues = [];
    let compPassedChecks = 0;

    // 1. Status tracking
    if (comp.status === 'draft') {
      draftCount++;
      compIssues.push({
        severity: 'warning',
        category: 'Editorial',
        title: 'Component in Draft Status',
        message: 'This block is marked as Draft and should be reviewed and set to Ready before final export.',
        preventsExport: false
      });
      warningCount++;
    } else if (comp.status === 'in-review' || comp.status === 'in_review') {
      inReviewCount++;
      compIssues.push({
        severity: 'recommendation',
        category: 'Editorial',
        title: 'Component In Review',
        message: 'This block is currently undergoing review.',
        preventsExport: false
      });
      recommendationCount++;
    } else {
      readyCount++;
      compPassedChecks++;
      passedCount++;
    }

    // 2. Component Name Check
    if (!comp.name || comp.name.trim() === 'Untitled Component') {
      compIssues.push({
        severity: 'warning',
        category: 'Metadata',
        title: 'Default Untitled Name',
        message: 'Component uses the placeholder name "Untitled Component". Give it a descriptive name.',
        preventsExport: false
      });
      warningCount++;
    } else {
      compPassedChecks++;
      passedCount++;
    }

    // 3. Content Items Count Check
    const items = Array.isArray(cfg.items) ? cfg.items : [];
    if (items.length === 0) {
      compIssues.push({
        severity: 'blocker',
        category: 'Content',
        title: 'Zero Content Items',
        message: 'Component has no interactive items or steps configured. It will render empty.',
        preventsExport: true
      });
      blockerCount++;
    } else {
      compPassedChecks++;
      passedCount++;
    }

    // 4. Blank Item Titles Check
    // Schema-aware: a component identifies its items by whichever field its own editor schema
    // calls the primary one (validation.js#primaryField) — 'title'/'label' where one exists,
    // else the first required text-like field. Comparison Slider has neither 'title' nor
    // 'label' (its items use beforeLabel/afterLabel), so the old fixed-key guess treated every
    // one of its items as unnamed even when beforeLabel/afterLabel were both filled in.
    if (items.length > 0) {
      const schema = getEditorSchema(comp.type);
      const field = primaryField(schema);
      const emptyTitles = items.filter(item => {
        const titleVal = field ? item[field.id] : (item.title || item.label || item.text || item.prompt || item.heading || item.name);
        return !titleVal || !String(titleVal).trim();
      });
      if (emptyTitles.length > 0) {
        compIssues.push({
          severity: 'error',
          category: 'Content',
          title: 'Blank Item Titles',
          message: `${emptyTitles.length} item(s) have blank or missing titles.`,
          preventsExport: false
        });
        errorCount++;
      } else {
        compPassedChecks++;
        passedCount++;
      }
    }

    // 5. Block Header Check
    if (!cfg.blockTitle && !cfg.blockHeadline && !cfg.title && !cfg.headline) {
      compIssues.push({
        severity: 'recommendation',
        category: 'Structure',
        title: 'Missing Block Header',
        message: 'No block title or headline is set for this component.',
        preventsExport: false
      });
      recommendationCount++;
    } else {
      compPassedChecks++;
      passedCount++;
    }

    componentReports.push({
      component: comp,
      passedChecks: compPassedChecks,
      issues: compIssues
    });
  }

  // Calculate Technical Score (0 - 100%)
  const totalTechnicalChecks = (totalComponents * 4) || 1;
  const technicalPassed = passedCount - readyCount; // technical checks only
  const technicalScore = Math.max(0, Math.min(100, Math.round((technicalPassed / totalTechnicalChecks) * 100)));

  // Determine Overall Readiness Status
  let overallStatus = 'Ready to Export';
  let overallStatusClass = 'status-ready';
  let overallScore = 100;

  if (totalComponents === 0) {
    overallStatus = 'Empty Course';
    overallStatusClass = 'status-warning';
    overallScore = 0;
  } else if (blockerCount > 0) {
    overallStatus = 'Blocked';
    overallStatusClass = 'status-blocker';
    overallScore = Math.min(40, technicalScore);
  } else if (errorCount > 0 || (draftCount === totalComponents && totalComponents > 0)) {
    overallStatus = 'Not Ready';
    overallStatusClass = 'status-not-ready';
    overallScore = Math.round(technicalScore * 0.5 + (readyCount / totalComponents) * 50);
  } else if (draftCount > 0) {
    overallStatus = 'In Progress';
    overallStatusClass = 'status-in-progress';
    overallScore = Math.round(technicalScore * 0.7 + (readyCount / totalComponents) * 30);
  } else {
    overallStatus = 'Ready to Export';
    overallStatusClass = 'status-ready';
    overallScore = technicalScore;
  }

  return {
    totalComponents,
    technicalScore,
    overallScore,
    overallStatus,
    overallStatusClass,
    editorial: {
      draftCount,
      inReviewCount,
      readyCount
    },
    counts: {
      blockers: blockerCount,
      errors: errorCount,
      warnings: warningCount,
      recommendations: recommendationCount,
      passed: passedCount
    },
    componentReports
  };
}

export class ProjectQaView {
  constructor({ container, projectId, onBack, onOpenQa = null, onOpenPreview = null, onEditComponent = null }) {
    this.container = container;
    this.projectId = projectId;
    this.onBack = onBack;
    this.onOpenQa = onOpenQa;
    this.onOpenPreview = onOpenPreview;
    this.onEditComponent = onEditComponent;

    this.state = {
      filterSeverity: 'all', // 'all' | 'blocker' | 'error' | 'warning' | 'recommendation' | 'passed'
      searchQuery: ''
    };
  }

  mount() {
    this.readiness = null;
    this.render();
    this.loadReadiness();
  }

  /**
   * Runs the same Preflight engine the editor uses over every component (measurement
   * included), then re-renders with the merged result. Until it resolves the view says
   * checks are running instead of claiming anything passed.
   */
  async loadReadiness(force = false) {
    const project = getProject(this.projectId);
    if (!project) return;
    const projectId = this.projectId;
    try {
      const merged = await getCourseReadiness(project, auditCourseProject, { force });
      if (this.projectId !== projectId || !this.container?.isConnected) return; // navigated away meanwhile
      this.readiness = merged;
      this.readinessError = null;
    } catch (error) {
      this.readinessError = error;
    }
    this.render();
  }

  unmount() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  auditProject(project) {
    const report = auditCourseProject(project);
    return report.componentReports.map(cr => ({
      component: cr.component,
      issues: cr.issues.map(iss => ({
        ...iss,
        level: iss.severity === 'blocker' || iss.severity === 'error' ? 'error' : iss.severity === 'warning' ? 'warn' : 'info'
      }))
    }));
  }

  render() {
    if (!this.container) return;
    const project = getProject(this.projectId);
    const audit = this.readiness || auditCourseProject(project || {});
    const pending = !this.readiness && !this.readinessError;

    // Filter reports based on active severity and search query
    let filteredReports = audit.componentReports;

    if (this.state.searchQuery.trim()) {
      const q = this.state.searchQuery.toLowerCase();
      filteredReports = filteredReports.filter(cr => {
        const nameMatch = cr.component.name?.toLowerCase().includes(q);
        const typeMatch = cr.component.type?.toLowerCase().includes(q);
        const issueMatch = cr.issues.some(iss => iss.title.toLowerCase().includes(q) || iss.message.toLowerCase().includes(q));
        return nameMatch || typeMatch || issueMatch;
      });
    }

    if (this.state.filterSeverity === 'blocker') {
      filteredReports = filteredReports.filter(cr => cr.issues.some(i => i.severity === 'blocker'));
    } else if (this.state.filterSeverity === 'error') {
      filteredReports = filteredReports.filter(cr => cr.issues.some(i => i.severity === 'error'));
    } else if (this.state.filterSeverity === 'warning') {
      filteredReports = filteredReports.filter(cr => cr.issues.some(i => i.severity === 'warning'));
    } else if (this.state.filterSeverity === 'recommendation') {
      filteredReports = filteredReports.filter(cr => cr.issues.some(i => i.severity === 'recommendation'));
    } else if (this.state.filterSeverity === 'passed') {
      filteredReports = filteredReports.filter(cr => cr.issues.length === 0 || cr.issues.every(i => i.severity === 'recommendation'));
    }

    this.container.innerHTML = `
      <div class="project-workspace-view">
        <header class="workspace-header">
          <div class="workspace-breadcrumbs">
            <button id="qa-back-btn" class="breadcrumb-back-btn" title="Back to Projects Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>${this.escapeHtml(project?.name || 'Project')}</span>
            </button>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">Course Quality & Compliance QA</span>
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
            <button class="workflow-tab-btn" id="wp-preview-btn" role="tab" aria-selected="false" title="Launch Full Course Preview">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Course Preview</span>
            </button>
            <button class="workflow-tab-btn active" id="wp-qa-btn" role="tab" aria-selected="true" title="Course Quality & Compliance QA">
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
            <button id="qa-return-structure-btn" class="btn btn-secondary btn-sm">
              Back to Course
            </button>
          </div>
        </header>

        <main class="workspace-container">
          <div class="workspace-banner" style="margin-bottom: 24px;">
            <div class="workspace-banner-info">
              <h1 class="workspace-title">Course Quality & Compliance Audit</h1>
              <p class="workspace-desc">
                ${pending
                  ? 'Technical checks: running the same Preflight checks the editor uses on every component…'
                  : this.readinessError
                    ? `Technical checks: could not be completed (${this.escapeHtml(this.readinessError.message || 'unknown error')}). Only basic structure checks are shown.`
                    : this.escapeHtml(describeTechnicalStatus(audit))} ·
                Editorial status: <strong>${audit.editorial.readyCount} Ready</strong>, <strong>${audit.editorial.inReviewCount} In Review</strong>, <strong>${audit.editorial.draftCount} Draft</strong> ·
                Export: <strong>${pending ? 'checking…' : audit.exportReadiness ? (audit.exportReadiness.canExport ? 'can be built' : 'blocked') : this.escapeHtml(audit.overallStatus)}</strong>
              </p>
              <div style="margin-top: 10px; font-size: 0.875rem; color: #555555; display: flex; gap: 14px; flex-wrap: wrap;">
                <span>🛑 <strong>${audit.counts.blockers}</strong> blockers</span>
                <span>⚠️ <strong>${audit.counts.errors}</strong> errors</span>
                <span>📋 <strong>${audit.counts.warnings}</strong> warnings</span>
                <span>💡 <strong>${audit.counts.recommendations}</strong> suggestions</span>
                <span>✅ <strong>${audit.counts.passed}</strong> passed</span>
              </div>

              <details class="qa-score-explainer" style="margin-top: 14px; background: #FFFFFF; border: 1px solid var(--att-border, #DCDFE3); border-radius: 8px; padding: 10px 14px; font-size: 0.875rem;">
                <summary style="font-weight: 600; cursor: pointer; color: var(--att-cobalt, #00388F);">
                  What do these statuses mean?
                </summary>
                <div style="margin-top: 8px; color: var(--att-text, #333); line-height: 1.5;">
                  <p style="margin: 0 0 6px 0;">Three things are reported separately, and none is a percentage:</p>
                  <ul style="margin: 0 0 8px 18px; padding: 0;">
                    <li><strong>Technical checks:</strong> the same automated Preflight rules the editor runs (required fields, accessibility, media, contrast, layout measurements), applied to all ${audit.totalComponents} components. “Passed” means none of those automated rules found a warning or blocker; it is not a WCAG conformance certificate or a guarantee of Rise compatibility.</li>
                    <li><strong>Editorial status:</strong> the Draft / In Review / Ready label authors set on each component. Draft is a workflow note, not a defect.</li>
                    <li><strong>Export:</strong> whether anything stops the package being built (for example a missing uploaded file).</li>
                  </ul>
                  <p style="margin: 0; font-size: 0.875rem; color: #666;">
                    <em>Layout measurements are heuristics taken in this Builder's own preview with collapsed sections opened. Confirm in Rise's own preview before publishing.</em>
                  </p>
                </div>
              </details>
            </div>
            <div class="workspace-banner-metrics">
              <div class="metric-card">
                <p class="metric-value" style="font-size: 1.125rem; color: ${pending ? '#6B7280' : audit.overallStatus === 'Ready to Export' ? '#10B981' : (audit.overallStatus === 'In Progress' || audit.overallStatus === 'Ready with warnings') ? '#B45309' : '#EF4444'};">
                  ${pending ? 'Checking…' : this.escapeHtml(audit.overallStatus)}
                </p>
                <p class="metric-label">Overall status</p>
              </div>
            </div>
          </div>

          <!-- Controls: Severity Filter Chips + Search Filter -->
          <div class="dashboard-controls" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div class="dashboard-filters-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="filter-chip ${this.state.filterSeverity === 'all' ? 'active' : ''}" data-sev="all">
                All Components (${audit.componentReports.length})
              </button>
              <button class="filter-chip ${this.state.filterSeverity === 'blocker' ? 'active' : ''}" data-sev="blocker" style="${audit.counts.blockers > 0 ? 'color: #D32F2F; font-weight: 700;' : ''}">
                🛑 Blockers (${audit.counts.blockers})
              </button>
              <button class="filter-chip ${this.state.filterSeverity === 'error' ? 'active' : ''}" data-sev="error">
                ⚠️ Errors (${audit.counts.errors})
              </button>
              <button class="filter-chip ${this.state.filterSeverity === 'warning' ? 'active' : ''}" data-sev="warning">
                📋 Warnings (${audit.counts.warnings})
              </button>
              <button class="filter-chip ${this.state.filterSeverity === 'recommendation' ? 'active' : ''}" data-sev="recommendation">
                💡 Suggestions (${audit.counts.recommendations})
              </button>
              <button class="filter-chip ${this.state.filterSeverity === 'passed' ? 'active' : ''}" data-sev="passed">
                ✅ Passed Checks
              </button>
            </div>

            <div class="dashboard-search-wrap" style="width: 260px;">
              <input type="text" id="qa-search-input" class="dashboard-search-input" placeholder="Search audited checks..." value="${this.escapeHtml(this.state.searchQuery)}" style="width: 100%;" />
            </div>
          </div>

          <div class="sections-list">
            ${filteredReports.length > 0 ? filteredReports.map(item => `
              <div class="section-card" style="margin-bottom: 16px;">
                <div class="section-card-header" style="background: var(--att-grey-1, #F8F9FA); padding: 14px 20px; border-bottom: 1px solid var(--att-border, #E5E7EB); display: flex; justify-content: space-between; align-items: center;">
                  <div class="section-header-left" style="display: flex; align-items: center; gap: 12px;">
                    <span class="component-type-badge">${this.escapeHtml(item.component.type)}</span>
                    <h3 class="section-title" style="margin: 0; font-size: 1.05rem;">${this.escapeHtml(item.component.name)}</h3>
                    <span class="component-status-pill ${item.component.status === 'ready' ? 'status-ready' : item.component.status === 'in-review' ? 'status-in-progress' : 'status-draft'}">
                      ${this.escapeHtml(item.component.status || 'draft')}
                    </span>
                  </div>
                  <button class="btn-att-secondary" data-action="edit-audited" data-comp-id="${item.component.id}" title="Edit ${this.escapeHtml(item.component.name)} in Single Component Builder" style="font-size: 0.875rem; padding: 6px 14px;">
                    Open ${this.escapeHtml(item.component.name)}
                  </button>
                </div>
                <div class="section-card-body" style="padding: 16px 20px;">
                  ${item.issues.length > 0 ? item.issues.map(iss => `
                    <div style="display: flex; align-items: flex-start; gap: 12px; font-size: 0.9375rem; margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; ${this.getSeverityRowStyle(iss.severity)}">
                      <span style="font-weight: 700; text-transform: uppercase; font-size: 13px; padding: 2px 8px; border-radius: 4px; white-space: nowrap; ${this.getSeverityBadgeStyle(iss.severity)}">
                        ${iss.severity}
                      </span>
                      <div style="flex: 1;">
                        <strong style="color: var(--att-heading-contrast, #111);">${this.escapeHtml(iss.title)}:</strong>
                        <span style="color: var(--att-text, #333); margin-left: 4px;">${this.escapeHtml(iss.message)}</span>
                        ${iss.formats?.length ? `<span style="display: block; font-size: 0.875rem; color: #555; margin-top: 2px;">Affects: ${this.escapeHtml(iss.formats.join(', '))}</span>` : ''}
                        ${iss.remediation ? `<span style="display: block; font-size: 0.875rem; color: #555; margin-top: 2px;">Fix: ${this.escapeHtml(iss.remediation)}</span>` : ''}
                        ${iss.preventsExport ? `<span style="display: block; font-size: 0.875rem; color: #D32F2F; font-weight: 600; margin-top: 2px;">🛑 Prevents package export</span>` : ''}
                      </div>
                    </div>
                  `).join('') : `
                    <p style="margin: 0; font-size: 0.9375rem; color: #10B981; display: flex; align-items: center; gap: 8px; font-weight: 500;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      ${pending ? 'Running technical checks…' : 'No findings from the automated technical, content and metadata checks.'}
                    </p>
                  `}
                </div>
              </div>
            `).join('') : `
              <div class="dashboard-empty-state">
                <h3 class="empty-state-title" style="color: #2E7D32;">No components match the selected QA filter!</h3>
                <p class="empty-state-subtitle">Adjust your filter chips or search query above to review other findings.</p>
              </div>
            `}
          </div>
        </main>
      </div>
    `;

    this.attachEventListeners();
  }

  getSeverityRowStyle(severity) {
    switch (severity) {
      case 'blocker':
        return 'background: rgba(224, 88, 77, 0.05); border-left: 3px solid #D32F2F;';
      case 'error':
        return 'background: rgba(216, 67, 21, 0.05); border-left: 3px solid #D84315;';
      case 'warning':
        return 'background: rgba(245, 127, 23, 0.05); border-left: 3px solid #F57F17;';
      case 'recommendation':
        return 'background: rgba(2, 119, 189, 0.05); border-left: 3px solid #0277BD;';
      default:
        return 'background: rgba(46, 125, 50, 0.05); border-left: 3px solid #2E7D32;';
    }
  }

  getSeverityBadgeStyle(severity) {
    switch (severity) {
      case 'blocker':
        return 'background: #FEECEB; color: #D32F2F; border: 1px solid #FFCDD2;';
      case 'error':
        return 'background: #FFF3E0; color: #D84315; border: 1px solid #FFE0B2;';
      case 'warning':
        return 'background: #FFFDE7; color: #F57F17; border: 1px solid #FFF59D;';
      case 'recommendation':
        return 'background: #E1F5FE; color: #0277BD; border: 1px solid #B3E5FC;';
      default:
        return 'background: #E8F5E9; color: #2E7D32; border: 1px solid #C8E6C9;';
    }
  }

  attachEventListeners() {
    this.container.querySelector('#qa-back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelector('#wp-tab-build')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelector('#wp-preview-btn')?.addEventListener('click', () => {
      if (this.onOpenPreview) this.onOpenPreview(this.projectId);
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

    this.container.querySelector('#qa-return-structure-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.filterSeverity = btn.dataset.sev || 'all';
        this.render();
      });
    });

    const searchInput = this.container.querySelector('#qa-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value;
        this.render();
        // Restore focus to search input
        const newSearch = this.container.querySelector('#qa-search-input');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
        }
      });
    }

    this.container.querySelectorAll('[data-action="edit-audited"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const compId = btn.dataset.compId;
        const project = getProject(this.projectId);
        const comp = project?.components?.[compId];
        if (comp && this.onEditComponent) {
          this.onEditComponent(project, comp);
        }
      });
    });
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
