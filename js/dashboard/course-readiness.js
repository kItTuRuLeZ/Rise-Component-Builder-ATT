/**
 * @file course-readiness.js
 * One result model for "is this course ready to export?", shared by Course QA and the
 * pre-export review (and consistent with the editor's Preflight panel, because it runs the
 * SAME engine: js/validation.js#runPreflight).
 *
 * Previously Course QA ran five ad-hoc checks per component and never called Preflight, so
 * it could say "100% technical checks passed" while the component panel showed warnings.
 * Here every course component is preflighted with the same rules, DOM measurement included,
 * and the findings are mapped onto the QA severities:
 *
 *   Preflight `blocking`       -> QA `blocker`        (prevents export)
 *   Preflight `warning`        -> QA `warning`
 *   Preflight `recommendation` -> QA `recommendation`
 *
 * Three things are reported separately and never collapsed into one percentage:
 *   - technical status: `blocked` | `warnings` | `passed` (from preflight + structure checks)
 *   - editorial status: Draft / In Review / Ready counts (a workflow label, not a defect)
 *   - export readiness: whether anything prevents the package from being built
 */

import { runPreflight, SEVERITY } from '../validation.js';
import { COMPONENT_REGISTRY } from '../component-registry.js';
import { generateIframeContent } from '../preview.js';
import { toRgba } from '../utilities.js';
import { measureRenderedDimensions } from '../dom-measurement.js';
import { ensureAllProjectMediaObjectURLs } from '../media-storage.js';

const registryById = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, entry]));
const componentModules = Object.fromEntries(
  COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, validate: entry.validate, version: entry.version }])
);

const QA_SEVERITY = {
  [SEVERITY.BLOCKING]: 'blocker',
  [SEVERITY.WARNING]: 'warning',
  [SEVERITY.RECOMMENDATION]: 'recommendation'
};

const FORMAT_WEB_PACKAGE = 'Web Package ZIP (Rise Embed block)';
const FORMAT_COURSE_ZIP = 'Course ZIP';
const FORMAT_ALL = 'All export formats';

/**
 * Which export format(s) a preflight finding affects, so the author can tell a real problem
 * from one that only matters for a format they aren't using.
 */
export function formatsAffected(ruleId) {
  if (ruleId === 'general-clipping-risk' || ruleId === 'general-clipping-risk-unmeasured') return [FORMAT_WEB_PACKAGE, FORMAT_COURSE_ZIP];
  if (ruleId === 'media-broken-reference') return [FORMAT_WEB_PACKAGE, FORMAT_COURSE_ZIP];
  if (/^(uploaded-media|.*uploaded-media-export-format)/.test(ruleId)) return [FORMAT_WEB_PACKAGE, FORMAT_COURSE_ZIP];
  return [FORMAT_ALL];
}

/**
 * Maps one Preflight issue onto the QA issue shape used by Course QA and the export review.
 * A missing uploaded file is always a blocker here: the course exporter refuses to build a
 * package that references media it cannot find, so QA must say so before the author clicks Export.
 */
export function toReadinessIssue(issue, component) {
  const missingMedia = issue.ruleId === 'media-broken-reference';
  const severity = missingMedia ? 'blocker' : (QA_SEVERITY[issue.severity] || 'recommendation');
  return {
    severity,
    category: 'Technical',
    source: 'preflight',
    ruleId: issue.ruleId,
    title: issue.title || issue.ruleId,
    message: missingMedia
      ? `${issue.explanation} Course export stops until this is fixed.`
      : issue.explanation,
    formats: formatsAffected(issue.ruleId),
    remediation: issue.fix?.label
      ? `${issue.fix.label} in “${component.name}”.`
      : (missingMedia ? 'Re-upload the file or remove it from the component.' : null),
    preventsExport: severity === 'blocker',
    target: issue.target || null
  };
}

async function measureComponent(project, component, entry) {
  try {
    const html = generateIframeContent({
      selectedComponent: entry,
      config: component.config,
      activeTheme: project.theme,
      componentOverrides: component.styleOverrides || project.componentOverrides,
      settings: project.settings,
      uiTheme: project.uiTheme
    }, componentModules, toRgba);
    return await measureRenderedDimensions(html);
  } catch {
    return null; // "attempted and failed": surfaces the manual-check recommendation
  }
}

/**
 * Runs Preflight for every component in the course with the same engine and inputs the
 * editor uses. Resolves preview media first so images/audio actually load while measuring.
 *
 * @param {object} project schema v3 project
 * @param {{ mediaStore?: any, measure?: boolean, measureFn?: (project: object, component: object, entry: object) => Promise<object|null> }} [options]
 * @returns {Promise<Map<string, object[]>>} component id -> QA-shaped preflight issues
 */
export async function collectPreflightIssues(project, options = {}) {
  const { mediaStore, measure = typeof document !== 'undefined', measureFn = measureComponent } = options;
  // RISE-kind components (storyboard import) have no entry in this Builder's component
  // registry by design — without this filter every one would be reported as a blocking
  // "Unknown component type" issue instead of being silently out of scope for Preflight.
  const components = Object.values(project?.components || {}).filter(component => component.kind !== 'rise');
  const result = new Map();

  if (measure) {
    try { await ensureAllProjectMediaObjectURLs(project, mediaStore); } catch { /* measured without media is still measured */ }
  }

  for (const component of components) {
    const entry = registryById[component.type];
    if (!entry) {
      result.set(component.id, [{
        severity: 'blocker', category: 'Technical', source: 'preflight', ruleId: 'component-type-unknown',
        title: 'Unknown component type',
        message: `“${component.name}” uses a component type (“${component.type}”) that is not in this Builder.`,
        formats: [FORMAT_ALL], remediation: 'Remove or replace this component.', preventsExport: true, target: null
      }]);
      continue;
    }
    const context = {
      componentId: entry.id,
      schema: entry.editorSchema,
      config: component.config || {},
      theme: project.theme,
      componentOverrides: component.styleOverrides || project.componentOverrides || {},
      settings: project.settings || {},
      mediaStore
    };
    if (measure) context.domMeasurement = await measureFn(project, component, entry);
    const issues = await runPreflight(context);
    result.set(component.id, issues.map(issue => toReadinessIssue(issue, component)));
  }
  return result;
}

/**
 * Folds preflight findings into a base audit (js/dashboard/project-qa.js#auditCourseProject)
 * and recomputes counts and the technical / editorial / export-readiness split.
 * Pure: returns a new report, never mutates the input.
 */
export function mergeReadiness(baseAudit, preflightByComponent) {
  const componentReports = baseAudit.componentReports.map(report => ({
    ...report,
    issues: [...report.issues, ...(preflightByComponent.get(report.component.id) || [])]
  }));

  const counts = { blockers: 0, errors: 0, warnings: 0, recommendations: 0, passed: baseAudit.counts.passed };
  const technicalCounts = { blockers: 0, errors: 0, warnings: 0, recommendations: 0 };
  for (const report of componentReports) {
    for (const issue of report.issues) {
      const bucket = { blocker: 'blockers', error: 'errors', warning: 'warnings', recommendation: 'recommendations' }[issue.severity];
      if (!bucket) continue;
      counts[bucket]++;
      if (issue.category !== 'Editorial') technicalCounts[bucket]++;
    }
  }

  const blockingTotal = technicalCounts.blockers;
  const warningTotal = technicalCounts.errors + technicalCounts.warnings;
  const technical = {
    status: blockingTotal > 0 ? 'blocked' : warningTotal > 0 ? 'warnings' : 'passed',
    blocking: blockingTotal,
    warnings: warningTotal,
    recommendations: technicalCounts.recommendations,
    componentsChecked: componentReports.length,
    componentsWithFindings: componentReports.filter(r => r.issues.some(i => i.category !== 'Editorial' && i.severity !== 'recommendation')).length
  };

  const exportBlocked = counts.blockers > 0;
  return {
    ...baseAudit,
    componentReports,
    counts,
    technical,
    exportReadiness: {
      canExport: !exportBlocked && baseAudit.totalComponents > 0,
      blockers: counts.blockers
    },
    // Defer to the base audit's editorial-aware status; preflight only changes it when it
    // finds a blocker, or when the base says "Ready" but technical warnings remain.
    overallStatus: exportBlocked ? 'Blocked'
      : (baseAudit.overallStatus === 'Ready to Export' && technical.status === 'warnings') ? 'Ready with warnings'
      : baseAudit.overallStatus,
    overallStatusClass: exportBlocked ? 'status-blocker'
      : (baseAudit.overallStatus === 'Ready to Export' && technical.status === 'warnings') ? 'status-in-progress'
      : baseAudit.overallStatusClass,
    preflightIncluded: true
  };
}

/** One human sentence for the technical dimension; never a percentage. */
export function describeTechnicalStatus(audit) {
  if (!audit.technical) return 'Technical checks: running…';
  const t = audit.technical;
  if (t.status === 'blocked') return `Technical checks: ${t.blocking} blocking issue${t.blocking === 1 ? '' : 's'}${t.warnings ? `, ${t.warnings} warning${t.warnings === 1 ? '' : 's'}` : ''}`;
  if (t.status === 'warnings') return `Technical checks: ${t.warnings} warning${t.warnings === 1 ? '' : 's'} remain`;
  return `Technical checks: passed (${t.componentsChecked} component${t.componentsChecked === 1 ? '' : 's'} checked${t.recommendations ? `, ${t.recommendations} suggestion${t.recommendations === 1 ? '' : 's'}` : ''})`;
}

// Short-lived: media can go missing without the project record changing.
const CACHE_TTL_MS = 30000;
const cache = new Map();

/**
 * Preflight + merge with a short-lived cache keyed by project id and last-update stamp, so
 * Course QA and the pre-export review that follows it show identical numbers without
 * re-measuring every component.
 *
 * @param {object} project
 * @param {(project: object) => object} auditFn base audit function (injected to avoid an import cycle)
 * @param {{ mediaStore?: any, measure?: boolean, measureFn?: (project: object, component: object, entry: object) => Promise<object|null>, force?: boolean }} [options]
 */
export async function getCourseReadiness(project, auditFn, options = {}) {
  const key = `${project?.id}:${project?.updatedAt || ''}:${options.measure === false ? 'n' : 'm'}`;
  const hit = cache.get(key);
  if (!options.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = collectPreflightIssues(project, options).then(map => mergeReadiness(auditFn(project), map));
  cache.set(key, { at: Date.now(), promise });
  try {
    return await promise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export function clearCourseReadinessCache() {
  cache.clear();
}
