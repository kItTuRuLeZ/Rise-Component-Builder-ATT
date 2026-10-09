/* Rise Component Builder — Application Shell Logic */
// @ts-nocheck -- extensive untyped document.getElementById() DOM wiring; see docs/TESTING-STRATEGY.md "Type checking".
// Opt back in incrementally as sections of this file are typed or migrated into the component registry (docs/ARCHITECTURE.md §1).

import { appState, defaultBlockHeader, repairLeakedAccordionHeader, resetConfig } from './js/state.js';
import { APP_VERSION, parseVersionBuildDate } from './js/version.js';
import {
  buildProject, clearDraft, deleteProject, duplicateProject, getProject, importProjectJson,
  loadCustomThemes, loadDefaultThemeId, loadDraft, loadFavorites, loadPreviewDevice,
  loadProjects, loadRecentlyUsed, loadSettings, loadUiTheme, renameProject, saveDraft,
  saveFavorites, savePreviewDevice, saveProject, saveRecentlyUsed, saveSettings, saveUiTheme,
  withRecentlyUsedEntry
} from './js/storage.js';
import { componentCatalog, filterCatalog, createCatalogCard, sortCatalog, renderFilterChips, showComponentDetailsModal, closeComponentDetailsModal } from './js/catalog.js';
import { COMPONENT_REGISTRY, getCategoriesWithCounts, getComponentById, getDefaultConfig, normalizeComponentType } from './js/component-registry.js';
import { createSchemaItemEditor, switchEditorTab as activateEditorTab, addEditorItem, validateActiveComponent, validateSchemaField, setupEditorTabKeyboardNavigation, jumpToEditorField, getFieldTabLocation } from './js/editor.js';
import { writePreview, openPreview, generateIframeContent as compilePreview, COMPONENT_MAX_WIDTH } from './js/preview.js';
import { getDeviceWidthLabel } from './js/device-preview.js';
import { measureRenderedDimensions } from './js/dom-measurement.js';
import {
  buildCoursePackZip, buildExportPayload, buildLargePasteWarning,
  buildRiseProjectZip, downloadCoursePackZip,
  downloadProjectJson, downloadZipFile, formatExportedFileSize,
  getExportedFileSize, prepareMediaExport
} from './js/export.js';
import { copyTextToClipboard, describeStorageUsage, escapeHTML, formatItemLabel, formatReadableDate, normalizeHeadingLevel, toRgba as colorToRgba, toSentenceCase } from './js/utilities.js';
import { COMPLETION_MODE_WORDING, getAvailableCompletionModes, getCompletionKind, resolveCompletionMode } from './js/completion-modes.js';
import { showToast } from './js/toast.js';
import {
  checkCompletionExportFormatIssue, collectSyncIssues, runPreflight, summarizePreflight, summarizePreflightForAnnouncement
} from './js/validation.js';
import { resolveMediaLimits, validateMediaAccessibility } from './js/media.js';
import { downloadProjectPackage, exportProjectPackage, importProjectPackage, isProjectPackageFile } from './js/project-package.js';
import { pruneMediaObjectURLs, releaseAllMediaObjectURLs, resolveMediaReference, restoreMediaReferences } from './js/media-storage.js';
import { applyThemeToConfig, BUILT_IN_THEMES, DEFAULT_THEME_ID, getBuiltInTheme, normalizeComponentOverrides } from './js/themes.js';
import { createHistoryManager } from './js/history.js';
import { getPresetsForComponent } from './js/presets.js';
import { upgradeTextareaToRichText } from './js/rich-text-editor.js';
import { createPostPublishWorkflow } from './js/post-publish/workflow-shell.js';
import { LandingView } from './js/dashboard/landing-view.js';
import { DashboardView } from './js/dashboard/dashboard-view.js';
import { ProjectOverviewView } from './js/dashboard/project-overview.js';
import { ProjectMediaView } from './js/dashboard/project-media.js';
import { CoursePreviewView } from './js/dashboard/course-preview.js';
import { ProjectQaView } from './js/dashboard/project-qa.js';
import { StoryboardImportView } from './js/dashboard/storyboard-import-view.js';
import { downloadCourseProjectZip, showPreExportReviewDialog } from './js/dashboard/project-export.js';
import { isolateModal, clearAllModalIsolations } from './js/dashboard/att-modal.js';
// app.js is the composition root and is explicitly allowed to depend on any module,
// including one specific component's own file (docs/ARCHITECTURE.md "Important
// dependencies") — reused here only for its MM:SS/H:MM:SS formatter, so the builder's own
// authoring-timeline widget (Interactive Video Phase 2, below) can't silently drift from
// what the exported component itself displays to learners.
import { formatTimestamp as formatIvTimestamp } from './components/interactive-video.js';
// Every catalog component is a real, isolated module (js/component-registry.js). The
// preview/export compiler needs its renderer (generateHTML/CSS/JS) and version (embedded
// in the completion adapter's message envelope, js/completion.js); the editor's save-time
// validation gate needs its validate() — combine all three under one id map.
const componentRegistry = Object.fromEntries(COMPONENT_REGISTRY.map(entry => [entry.id, { ...entry.renderer, validate: entry.validate, version: entry.version }]));
const generateIframeContent = () => compilePreview(appState, componentRegistry, colorToRgba);

// Every error thrown deliberately by this app's own code (project/theme/import validation,
// storage quota, export failures, etc.) is already caught at its call site and shown as a
// specific, reviewed, user-facing toast — see the individual try/catch blocks below. This
// handler exists only for the residual case: a genuinely unanticipated bug (an uncaught
// exception or unhandled promise rejection) that would otherwise fail silently or surface a
// raw browser error overlay. Full detail goes to the console (a safe place for it — visible
// only to whoever already has this browser's devtools open, i.e. the same person who hit the
// bug); the toast itself stays generic on purpose, since a bug's raw message/stack can name
// internal variables or file paths that mean nothing to an instructional designer.
let lastUnexpectedErrorToastAt = 0;
function reportUnexpectedError(error) {
  console.error('Unexpected application error:', error);
  const now = Date.now();
  if (now - lastUnexpectedErrorToastAt < 4000) return;
  lastUnexpectedErrorToastAt = now;
  showToast('Something unexpected went wrong. Your work autosaves regularly — check the browser console for technical details.', 'error', 6000);
}
window.addEventListener('error', event => reportUnexpectedError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportUnexpectedError(event.reason));

document.addEventListener('DOMContentLoaded', async () => {
  
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  appState.uiTheme = loadUiTheme();
  appState.settings = loadSettings();
  appState.favorites = new Set(loadFavorites());
  appState.recentlyUsed = loadRecentlyUsed();
  let customThemes = loadCustomThemes();
  let defaultThemeId = loadDefaultThemeId();
  const initialComponentTheme = [...BUILT_IN_THEMES, ...customThemes].find(theme => theme.id === defaultThemeId)
    || BUILT_IN_THEMES.find(theme => theme.id === DEFAULT_THEME_ID);
  appState.activeThemeId = initialComponentTheme.id;
  appState.activeTheme = structuredClone(initialComponentTheme);
  appState.componentOverrides = {};
  appState.config = applyThemeToConfig(appState.config, appState.activeTheme, appState.componentOverrides);

  // ==========================================
  // DATABASE OF COMPONENT ARCHETYPES
  // ==========================================
  // ==========================================
  // DOM ELEMENT REFERENCES
  // ==========================================
  const htmlRoot = document.documentElement;
  const btnTheme = document.getElementById('btn-theme');
  const themeIconLight = btnTheme.querySelector('.theme-icon-light');
  const themeIconDark = btnTheme.querySelector('.theme-icon-dark');
  
  const searchInput = document.getElementById('search-components');
  const navItems = document.querySelectorAll('.nav-item');
  const componentsGrid = document.getElementById('components-grid');
  const classificationFilterButtons = document.querySelectorAll('.classification-filter-btn');
  const purposeChips = document.querySelectorAll('.purpose-chip');
  
  const catalogState = document.getElementById('catalog-state');
  const editorState = document.getElementById('editor-state');
  const postPublishWorkspace = document.getElementById('post-publish-workspace');
  let postPublishWorkflowInstance = null;

  const landingWorkspace = document.getElementById('landing-workspace');
  let landingViewInstance = null;

  const dashboardWorkspace = document.getElementById('dashboard-workspace');
  const projectOverviewWorkspace = document.getElementById('project-overview-workspace');
  const projectMediaWorkspace = document.getElementById('project-media-workspace');
  const coursePreviewWorkspace = document.getElementById('course-preview-workspace');
  const projectQaWorkspace = document.getElementById('project-qa-workspace');
  const storyboardImportWorkspace = document.getElementById('storyboard-import-workspace');
  const btnProjectsDashboard = document.getElementById('btn-projects-dashboard');

  let activeProjectId = null;
  let dashboardViewInstance = null;
  let projectOverviewInstance = null;
  let projectMediaInstance = null;
  let coursePreviewInstance = null;
  let projectQaInstance = null;
  let storyboardImportInstance = null;
  
  const btnBackToCatalog = document.getElementById('btn-back-to-catalog');
  const activeComponentTitle = document.getElementById('active-component-title');
  const activeComponentCategory = document.getElementById('active-component-category');
  const btnFavoriteToggle = document.getElementById('btn-favorite-toggle');
  const favoritesCountBadge = document.getElementById('favorites-count-badge');
  const recentCountBadge = document.getElementById('recent-count-badge');
  const preflightBadge = document.getElementById('preflight-badge');
  
  // Editor Tabs
  const editorTabs = document.querySelectorAll('.editor-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Form Inputs — upgrade text & textarea inputs to rich text editors with full formatting tools
  const inputBlockTitle = upgradeTextareaToRichText(document.getElementById('input-block-title'), { fieldId: 'blockTitle', isSingleLine: true })?.validationControl || document.getElementById('input-block-title');
  const inputBlockHeadline = upgradeTextareaToRichText(document.getElementById('input-block-headline'), { fieldId: 'blockHeadline', isSingleLine: true })?.validationControl || document.getElementById('input-block-headline');
  const inputBlockDesc = upgradeTextareaToRichText(document.getElementById('input-block-desc'), { fieldId: 'blockDesc', isSingleLine: false })?.validationControl || document.getElementById('input-block-desc');
  const selectHeadingLevel = document.getElementById('select-heading-level');
  const selectHeaderStyle = document.getElementById('select-header-style');
  const inputHeaderCyanRule = document.getElementById('input-header-cyan-rule');
  const headerCyanRuleWrapper = document.getElementById('header-cyan-rule-wrapper');
  const selectSpacingDensity = document.getElementById('select-spacing-density');
  const inputContextBandEnabled = document.getElementById('input-context-band-enabled');
  const contextBandFields = document.getElementById('context-band-fields');
  let inputContextBandText = null;
  let selectContextBandAlignment = null;

  const inputBehaviorAccordionMulti = document.getElementById('input-behavior-accordion-multi');
  const inputBehaviorAccordionAnimation = document.getElementById('input-behavior-accordion-animation');
  const selectIconStyle = document.getElementById('select-icon-style');
  const accordionBehaviorGroup = document.getElementById('accordion-behavior-group');
  const inputAccordionSequential = document.getElementById('input-accordion-sequential');
  const inputAccordionShowProgress = document.getElementById('input-accordion-show-progress');
  const inputAccordionShowVisitedBadge = document.getElementById('input-accordion-show-visited-badge');
  const inputAccordionExpandCollapseAll = document.getElementById('input-accordion-expand-collapse-all');
  const inputAccordionSearch = document.getElementById('input-accordion-search');
  const inputAccordionAllowReset = document.getElementById('input-accordion-allow-reset');

  const flipCardsBehaviorGroup = document.getElementById('flip-cards-behavior-group');
  const selectFlipCardsMode = document.getElementById('select-flip-cards-mode');
  const inputFlipCardsShuffle = document.getElementById('input-flip-cards-shuffle');
  const inputFlipCardsCategories = document.getElementById('input-flip-cards-categories');
  const inputFlipCardsSummary = document.getElementById('input-flip-cards-summary');
  const inputFlipCardsReset = document.getElementById('input-flip-cards-reset');
  const inputFlipCardsFrontLabel = document.getElementById('input-flip-cards-front-label');
  const inputFlipCardsBackLabel = document.getElementById('input-flip-cards-back-label');

  const tabsBehaviorGroup = document.getElementById('tabs-behavior-group');
  const selectTabsOrientation = document.getElementById('select-tabs-orientation');
  const inputTabsNumbered = document.getElementById('input-tabs-numbered');
  const inputTabsSequential = document.getElementById('input-tabs-sequential');
  const inputTabsShowProgress = document.getElementById('input-tabs-show-progress');
  const inputTabsShowVisitedBadge = document.getElementById('input-tabs-show-visited-badge');
  const inputTabsCompareMode = document.getElementById('input-tabs-compare-mode');
  const inputTabsAllowReset = document.getElementById('input-tabs-allow-reset');

  const timelineBehaviorGroup = document.getElementById('timeline-behavior-group');
  const inputTimelineCategories = document.getElementById('input-timeline-categories');
  const inputTimelineCompareMode = document.getElementById('input-timeline-compare-mode');
  const inputTimelineCollapsible = document.getElementById('input-timeline-collapsible');
  const inputTimelineChronological = document.getElementById('input-timeline-chronological');
  const inputTimelineShowProgress = document.getElementById('input-timeline-show-progress');
  const inputTimelineAllowReset = document.getElementById('input-timeline-allow-reset');

  const ivTimelineAuthoringGroup = document.getElementById('iv-timeline-authoring-group');
  const ivAuthoringVideo = document.getElementById('iv-authoring-video');
  const btnIvAddMarkerAtTime = document.getElementById('btn-iv-add-marker-at-time');
  const ivAuthoringTimeReadout = document.getElementById('iv-authoring-time-readout');
  const ivAuthoringTimelineTrack = document.getElementById('iv-authoring-timeline-track');
  const ivAuthoringTimelineEmptyHint = document.getElementById('iv-authoring-timeline-empty-hint');

  const ivBehaviorGroup = document.getElementById('iv-behavior-group');
  const selectIvResumeBehaviour = document.getElementById('select-iv-resume-behaviour');
  const selectIvCompletionRule = document.getElementById('select-iv-completion-rule');
  const inputIvShowMarkerNav = document.getElementById('input-iv-show-marker-nav');
  const inputIvShowProgress = document.getElementById('input-iv-show-progress');
  const inputIvAllowRestart = document.getElementById('input-iv-allow-restart');

  const mcBehaviorGroup = document.getElementById('mc-behavior-group');
  let inputMcConfidenceMode = null;
  let inputMcRequireConfidence = null;
  let inputMcConfidenceLowLabel = null;
  let inputMcConfidenceMidLabel = null;
  let inputMcConfidenceHighLabel = null;
  let inputMcShowResultSummary = null;
  let inputMcMaxAttempts = null;
  let inputMcHintText = null;
  let inputMcShowCorrectAfterFinal = null;
  let inputMcFinalExplanation = null;
  let inputMcAllowReset = null;

  const inputTrackCompletion = document.getElementById('input-track-completion');
  const inputCompletionMsg = upgradeTextareaToRichText(document.getElementById('input-completion-msg'), { fieldId: 'completionMsg', isSingleLine: true })?.validationControl || document.getElementById('input-completion-msg');
  
  // Dynamic Content Items
  const dynamicItemsContainer = document.getElementById('dynamic-items-container');
  const btnAddItem = document.getElementById('btn-add-item');
  const btnExpandAllItems = document.getElementById('btn-expand-all-items');
  const btnCollapseAllItems = document.getElementById('btn-collapse-all-items');
  
  // Preview
  const deviceButtons = document.querySelectorAll('.device-btn');
  const previewViewport = document.getElementById('preview-viewport');
  const btnPreviewRefresh = document.getElementById('btn-preview-refresh');
  const btnPreviewPopout = document.getElementById('btn-preview-popout');
  const livePreviewIframe = document.getElementById('live-preview-iframe');
  const savedComponentsList = document.getElementById('saved-components-list');
  const saveModalTitle = document.getElementById('save-modal-title');
  const saveNameInput = document.getElementById('save-component-name');
  const btnConfirmSaveAs = document.getElementById('btn-confirm-save-as');
  const importProjectFile = document.getElementById('import-project-file');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  const history = createHistoryManager({
    maxDepth: 50,
    onStateChange: ({ canUndo, canRedo }) => {
      if (btnUndo) {
        btnUndo.disabled = !canUndo;
        btnUndo.title = canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo';
      }
      if (btnRedo) {
        btnRedo.disabled = !canRedo;
        btnRedo.title = canRedo ? 'Redo (Ctrl+Shift+Z / Ctrl+Y)' : 'Nothing to redo';
      }
    }
  });

  // ==========================================
  // DYNAMIC ITEM EDITING
  // ==========================================
  const schemaItemEditor = createSchemaItemEditor({
    container: dynamicItemsContainer,
    onChange: () => {
      history.pushDebouncedState(appState.config);
      updateLivePreview();
    },
    focusFallback: btnAddItem
  });

  function computeIssuesByItem(issues) {
    const map = new Map();
    issues.forEach(item => {
      if (!Number.isInteger(item.itemIndex)) return;
      const entry = map.get(item.itemIndex) || { blocking: 0, warning: 0 };
      if (item.severity === 'blocking') entry.blocking += 1; else entry.warning += 1;
      map.set(item.itemIndex, entry);
    });
    return map;
  }

  function renderDynamicItems() {
    const schema = appState.selectedComponent?.editorSchema || componentCatalog[0].editorSchema;
    schemaItemEditor.render({ schema, items: appState.config.items, config: appState.config, limits: resolveMediaLimits(appState.settings.mediaLimitsMb) });
    refreshItemIssueBadges();
    updateAddItemButtonState(schema);
  }

  function updateAddItemButtonState(schema) {
    const itemsCountBadge = document.getElementById('items-count-badge');
    if (itemsCountBadge) {
      const count = appState.config.items?.length || 0;
      const label = schema.itemLabel ? schema.itemLabel.toLowerCase() : 'item';
      let rangeText = '';
      if (schema.minItems && schema.maxItems) {
        rangeText = ` (min ${schema.minItems}, max ${schema.maxItems})`;
      } else if (schema.minItems) {
        rangeText = ` (min ${schema.minItems})`;
      } else if (schema.maxItems) {
        rangeText = ` (max ${schema.maxItems})`;
      }
      itemsCountBadge.textContent = `${count} ${label}${count === 1 ? '' : 's'}${rangeText}`;
    }

    const atMaxItems = Number.isInteger(schema.maxItems) && appState.config.items.length >= schema.maxItems;
    if (btnAddItem) {
      btnAddItem.disabled = atMaxItems;
      const title = atMaxItems
        ? `This component only supports ${schema.maxItems} ${schema.itemLabel.toLowerCase()}${schema.maxItems === 1 ? '' : 's'}.`
        : '';
      btnAddItem.title = title;
      if (title) btnAddItem.setAttribute('aria-label', `Add Item — ${title}`); else btnAddItem.removeAttribute('aria-label');
    }
  }

  function refreshItemIssueBadges() {
    const context = buildPreflightContext();
    schemaItemEditor.refreshIssueBadges(context ? computeIssuesByItem(collectSyncIssues(context)) : new Map());
  }

  if (btnAddItem) {
    btnAddItem.addEventListener('click', () => {
      history.pushState(appState.config);
      const schema = appState.selectedComponent?.editorSchema || componentCatalog[0].editorSchema;
      addEditorItem(appState, schema);
      renderDynamicItems();
      updateLivePreview();
    });
  }

  if (btnExpandAllItems) {
    btnExpandAllItems.addEventListener('click', () => schemaItemEditor.expandAll());
  }
  if (btnCollapseAllItems) {
    btnCollapseAllItems.addEventListener('click', () => schemaItemEditor.collapseAll());
  }

  function performUndo() {
    if (!history.canUndo()) return;
    const previousConfig = history.undo(appState.config);
    if (previousConfig) {
      appState.config = structuredClone(previousConfig);
      syncEditorControls();
      updateLivePreview();
      showToast('Undone.', 'info', 2000);
    }
  }

  function performRedo() {
    if (!history.canRedo()) return;
    const nextConfig = history.redo(appState.config);
    if (nextConfig) {
      appState.config = structuredClone(nextConfig);
      syncEditorControls();
      updateLivePreview();
      showToast('Redone.', 'info', 2000);
    }
  }

  if (btnUndo) btnUndo.addEventListener('click', performUndo);
  if (btnRedo) btnRedo.addEventListener('click', performRedo);

  // Modals elements
  const modalTriggers = {
    'btn-export': 'modal-export',
    'btn-settings': 'modal-settings',
    'btn-preflight': 'modal-preflight',
    'btn-open-presets': 'modal-presets'
  };
  const modalOverlays = document.querySelectorAll('.modal-overlay');
  modalOverlays.forEach(overlay => overlay.setAttribute('aria-hidden', 'true'));

  // ==========================================
  // INITIALIZATION
  // ==========================================
  async function init() {
    // P09: sourced from js/version.js — the one place this value is maintained — rather
    // than a hand-typed string in index.html, which had drifted out of sync with
    // package.json's own version before this. A build-metadata date/time suffix on the
    // version string itself (js/version.js) was reinstated at explicit user request; the
    // badge shows that suffix as a readable date (parseVersionBuildDate + formatReadableDate)
    // rather than the raw "YYYYMMDD.HHmm" digits, while APP_VERSION itself is untouched —
    // the full semver string is still available via the badge's title attribute.
    const versionTag = document.getElementById('app-version-tag');
    if (versionTag) {
      const baseVersion = APP_VERSION.split('+')[0];
      const buildDate = parseVersionBuildDate(APP_VERSION);
      versionTag.textContent = buildDate ? `v${baseVersion} · ${formatReadableDate(buildDate)}` : `v${APP_VERSION}`;
      versionTag.title = `Full version: ${APP_VERSION}`;
      versionTag.hidden = false;
    }

    // 1. Load theme state
    setUiTheme(appState.uiTheme);
    document.documentElement.style.setProperty('--component-max-width', `${COMPONENT_MAX_WIDTH}px`);
    applyDeviceMode(loadPreviewDevice());

    // 2. Render initial category catalog
    renderCatalog();
    updateCategoryBadges();

    // 3. Update Favorites/Recently Used counts
    updateFavoritesBadge();
    updateRecentBadge();
    updateStorageMeter();

    // 4. Hook up live sync for values in Form Inputs
    setupFormListeners();

    // 5. Setup persistent Tubelight Navbar event listeners
    const tubelightNav = document.getElementById('tubelight-navbar');
    if (tubelightNav) {
      tubelightNav.querySelectorAll('.tubelight-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const navTarget = btn.dataset.nav;
          if (navTarget === 'landing') {
            showState('landing');
          } else if (navTarget === 'dashboard') {
            showState('dashboard');
          } else if (navTarget === 'catalog') {
            showState('catalog');
          } else if (navTarget === 'project-media') {
            showState('project-media', { projectId: activeProjectId });
          } else if (navTarget === 'post-publish') {
            showState('post-publish');
          }
        });
      });
    }

    const brandLogoBtn = document.getElementById('brand-logo-btn');
    if (brandLogoBtn) {
      brandLogoBtn.addEventListener('click', () => showState('landing'));
      brandLogoBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showState('landing');
        }
      });
    }
    
    // 6. Default into Landing Page on startup
    syncSettingsControls();
    if (window.location.search.includes('dashboard')) {
      showState('dashboard');
    } else if (window.location.search.includes('catalog')) {
      // Deep link straight to the component catalog, the same screen the persistent
      // navbar's "catalog" item reaches. Without this the only way in is landing →
      // dashboard → catalog, which makes the catalog the one primary screen with no
      // addressable entry point.
      showState('catalog');
      renderCatalog();
    } else if (window.location.search.includes('editor')) {
      const initialComp = componentCatalog.find(c => c.id === 'tab-blocks') || componentCatalog.find(c => c.id === 'accordion') || componentCatalog[0];
      if (initialComp) {
        loadComponentToEditor(initialComp);
      } else {
        showState('dashboard');
      }
    } else if (window.location.search.includes('post-publish')) {
      showState('post-publish');
    } else {
      showState('landing');
    }

    window.setInterval(saveCurrentDraft, 60000);
    window.setInterval(updateStorageMeter, 30000);
  }

  // ==========================================
  // THEME MANAGEMENT
  // ==========================================
  function setUiTheme(theme) {
    appState.uiTheme = theme;
    htmlRoot.setAttribute('data-theme', theme);
    try { saveUiTheme(theme); }
    catch (error) { showToast(error.message, 'error'); }
    
    if (theme === 'dark') {
      themeIconLight.style.display = 'none';
      themeIconDark.style.display = 'block';
    } else {
      themeIconLight.style.display = 'block';
      themeIconDark.style.display = 'none';
    }
    
    // Notify preview frame if running
    updateLivePreview();
  }

  btnTheme.addEventListener('click', () => {
    setUiTheme(appState.uiTheme === 'light' ? 'dark' : 'light');
  });

  function getAvailableThemes() {
    return [...BUILT_IN_THEMES, ...customThemes];
  }

  function syncResolvedThemeConfig() {
    appState.componentOverrides = normalizeComponentOverrides(appState.componentOverrides);
    appState.config = applyThemeToConfig(appState.config, appState.activeTheme, appState.componentOverrides);
  }

  // ==========================================
  // ROUTING & NAVIGATION
  // ==========================================
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const category = item.getAttribute('data-category');
      if (category === 'post-publish') {
        const guard = await guardUnsavedChanges(() => {
          navItems.forEach(n => n.classList.remove('active'));
          item.classList.add('active');
          appState.activeCategory = category;
          appState.selectedComponent = null;
          showState('post-publish');
        });
        if (guard === true) {
          navItems.forEach(n => n.classList.remove('active'));
          item.classList.add('active');
          appState.activeCategory = category;
          appState.selectedComponent = null;
          showState('post-publish');
        }
        return;
      }

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      const categoryName = item.getAttribute('data-category');
      appState.activeCategory = categoryName;
      
      // Clear search
      searchInput.value = '';
      appState.searchQuery = '';
      
      // Go back to catalog view
      showState('catalog');
      renderCatalog();
    });
  });

  const btnClearSearch = document.getElementById('btn-clear-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.searchQuery = e.target.value;
      if (btnClearSearch) btnClearSearch.style.display = searchInput.value.trim() ? 'block' : 'none';

      // Ensure we are on the catalog view when searching
      showState('catalog');
      renderCatalog();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      appState.searchQuery = '';
      btnClearSearch.style.display = 'none';
      renderCatalog();
    });
  }

  // Sidebar toggle
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  const appWorkspace = document.querySelector('.app-workspace');

  function toggleSidebar(collapsed) {
    if (!sidebar) return;
    const isCollapsed = collapsed !== undefined ? collapsed : !sidebar.classList.contains('sidebar-collapsed');
    sidebar.classList.toggle('sidebar-collapsed', isCollapsed);
    appState.sidebarCollapsed = isCollapsed;
    if (btnToggleSidebar) {
      const label = isCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation';
      btnToggleSidebar.title = label;
      btnToggleSidebar.setAttribute('aria-label', label);
    }
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => toggleSidebar());
  }

  // Catalog Sort & View Density controls
  const selectCatalogSort = document.getElementById('select-catalog-sort');
  const btnDensityComfortable = document.getElementById('btn-density-comfortable');
  const btnDensityCompact = document.getElementById('btn-density-compact');
  const filterChipsContainer = document.getElementById('filter-chips-container');

  if (selectCatalogSort) {
    selectCatalogSort.addEventListener('change', (e) => {
      appState.catalogSortMode = e.target.value;
      renderCatalog();
    });
  }

  if (btnDensityComfortable) {
    btnDensityComfortable.addEventListener('click', () => {
      appState.catalogViewDensity = 'comfortable';
      try { localStorage.setItem('rise_builder_view_density', 'comfortable'); } catch { /* ignore */ }
      renderCatalog();
    });
  }

  if (btnDensityCompact) {
    btnDensityCompact.addEventListener('click', () => {
      appState.catalogViewDensity = 'compact';
      try { localStorage.setItem('rise_builder_view_density', 'compact'); } catch { /* ignore */ }
      renderCatalog();
    });
  }

  // Resizer Divider & Panel proportions
  const workspaceResizer = document.getElementById('workspace-resizer');
  const configPanel = document.querySelector('.config-panel');
  const previewPanel = document.getElementById('preview-panel');
  let isResizing = false;

  function setWorkspaceSplitRatio(ratio) {
    const clamped = Math.min(0.8, Math.max(0.2, ratio));
    appState.editorSplitRatio = clamped;
    if (configPanel && previewPanel) {
      configPanel.style.flex = `0 0 ${clamped * 100}%`;
      configPanel.style.maxWidth = `${clamped * 100}%`;
      previewPanel.style.flex = `1 1 ${(1 - clamped) * 100}%`;
    }
    if (workspaceResizer) {
      workspaceResizer.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
    }
    try {
      localStorage.setItem('rise_builder_layout_split', String(clamped));
    } catch { /* ignore */ }
  }

  function resetWorkspaceSplitRatio() {
    const isAuthoring = Boolean(appState.selectedComponent);
    const defaultRatio = isAuthoring ? 0.52 : 0.68;
    setWorkspaceSplitRatio(defaultRatio);
  }

  if (workspaceResizer) {
    workspaceResizer.addEventListener('pointerdown', (e) => {
      isResizing = true;
      workspaceResizer.classList.add('is-dragging');
      workspaceResizer.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    workspaceResizer.addEventListener('pointermove', (e) => {
      if (!isResizing || !appWorkspace) return;
      const rect = appWorkspace.getBoundingClientRect();
      const sidebarWidth = sidebar?.offsetWidth || 0;
      const availableWidth = rect.width - sidebarWidth;
      if (availableWidth <= 0) return;
      const pointerOffset = e.clientX - rect.left - sidebarWidth;
      const ratio = pointerOffset / availableWidth;
      setWorkspaceSplitRatio(ratio);
    });

    const stopResizing = (e) => {
      if (!isResizing) return;
      isResizing = false;
      workspaceResizer.classList.remove('is-dragging');
      try { workspaceResizer.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    workspaceResizer.addEventListener('pointerup', stopResizing);
    workspaceResizer.addEventListener('pointercancel', stopResizing);

    workspaceResizer.addEventListener('dblclick', () => {
      resetWorkspaceSplitRatio();
      showToast('Restored default workspace layout.', 'info', 1500);
    });

    workspaceResizer.addEventListener('keydown', (e) => {
      const current = appState.editorSplitRatio || 0.52;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWorkspaceSplitRatio(current - 0.02);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWorkspaceSplitRatio(current + 0.02);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setWorkspaceSplitRatio(0.25);
      } else if (e.key === 'End') {
        e.preventDefault();
        setWorkspaceSplitRatio(0.75);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        resetWorkspaceSplitRatio();
      }
    });
  }

  // Preview safe area, fullscreen, hide/show, and toast indicators
  const btnPreviewSafeArea = document.getElementById('btn-preview-safe-area');
  const previewSafeAreaOverlay = document.getElementById('preview-safe-area-overlay');
  const btnPreviewFullscreen = document.getElementById('btn-preview-fullscreen');
  const btnTogglePreview = document.getElementById('btn-toggle-preview');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const previewSyncToast = document.getElementById('preview-sync-toast');
  let previewToastTimer = null;

  function showPreviewSyncToast(msg = 'Preview updated') {
    if (!previewSyncToast) return;
    const span = previewSyncToast.querySelector('span');
    if (span) span.textContent = msg;
    previewSyncToast.classList.add('is-visible');
    window.clearTimeout(previewToastTimer);
    previewToastTimer = window.setTimeout(() => {
      previewSyncToast?.classList.remove('is-visible');
    }, 1200);
  }

  if (btnPreviewSafeArea) {
    btnPreviewSafeArea.addEventListener('click', () => {
      appState.safeAreaOverlay = !appState.safeAreaOverlay;
      if (previewSafeAreaOverlay) previewSafeAreaOverlay.hidden = !appState.safeAreaOverlay;
      btnPreviewSafeArea.classList.toggle('active', appState.safeAreaOverlay);
      btnPreviewSafeArea.setAttribute('aria-pressed', String(appState.safeAreaOverlay));
      showToast(appState.safeAreaOverlay ? 'Rise Safe Area: Shown' : 'Rise Safe Area: Hidden', 'info', 1500);
    });
  }

  if (btnPreviewFullscreen) {
    btnPreviewFullscreen.addEventListener('click', () => {
      appState.previewFullscreen = !appState.previewFullscreen;
      document.body.classList.toggle('preview-fullscreen', appState.previewFullscreen);
      btnPreviewFullscreen.classList.toggle('active', appState.previewFullscreen);
      btnPreviewFullscreen.setAttribute('aria-pressed', String(appState.previewFullscreen));
      if (appState.previewFullscreen) {
        showToast('Fullscreen Preview (Press Esc or click again to exit)', 'info', 2500);
      }
    });
  }

  const btnShowPreviewHeader = document.getElementById('btn-show-preview-header');
  const btnDockedShowPreview = document.getElementById('btn-docked-show-preview');

  function setPreviewVisibility(visible) {
    appState.previewVisible = Boolean(visible);
    document.body.classList.toggle('preview-hidden', !appState.previewVisible);
    if (btnTogglePreview) {
      btnTogglePreview.classList.toggle('active', !appState.previewVisible);
      btnTogglePreview.setAttribute('aria-pressed', String(!appState.previewVisible));
      const label = appState.previewVisible ? 'Hide Preview Panel' : 'Show Preview Panel';
      btnTogglePreview.title = label;
      btnTogglePreview.setAttribute('aria-label', label);
    }
    showToast(appState.previewVisible ? 'Preview panel restored' : 'Preview panel hidden (Click "Show Preview" to restore)', 'info', 2000);
  }

  if (btnTogglePreview) {
    btnTogglePreview.addEventListener('click', () => {
      setPreviewVisibility(!appState.previewVisible);
    });
  }

  if (btnShowPreviewHeader) {
    btnShowPreviewHeader.addEventListener('click', () => {
      setPreviewVisibility(true);
    });
  }

  if (btnDockedShowPreview) {
    btnDockedShowPreview.addEventListener('click', () => {
      setPreviewVisibility(true);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      // Avoid intercepting if focus is in an input or textarea
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.preventDefault();
      setPreviewVisibility(!appState.previewVisible);
    }
  });

  if (btnZoomFit) {
    btnZoomFit.addEventListener('click', () => {
      const container = document.querySelector('.preview-container');
      const viewport = document.getElementById('preview-viewport');
      if (!container || !viewport) return;
      const availW = container.clientWidth - 48;
      const availH = container.clientHeight - 48;
      const targetW = viewport.offsetWidth || 1024;
      const targetH = viewport.offsetHeight || 600;
      if (targetW <= 0 || targetH <= 0) return;
      const scale = Math.min(1.0, Math.min(availW / targetW, availH / targetH));
      applyPreviewZoom(scale);
      showToast(`Fit to space: ${Math.round(scale * 100)}%`, 'info', 1500);
    });
  }

  // Independent of the category sidebar — does not reset activeCategory/searchQuery, and
  // applies inside Favorites/Recent the same way search already does (js/catalog.js
  // #filterCatalog).
  classificationFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      classificationFilterButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      appState.activeClassification = btn.getAttribute('data-classification');
      renderCatalog();
    });
  });

  purposeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      purposeChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      appState.activePurpose = chip.getAttribute('data-purpose');
      renderCatalog();
    });
  });

  // Header identity, inline rename, and save-status display
  const headerProjectName = document.getElementById('header-project-name');
  const btnEditProjectName = document.getElementById('btn-edit-project-name');
  const inputHeaderProjectName = document.getElementById('input-header-project-name');
  const projectTitleEditor = document.getElementById('project-title-editor');

  function updateProjectStatusDisplay(stateOverride = null) {
    const status = document.getElementById('project-status');
    const hasComponent = Boolean(appState.selectedComponent);

    if (projectTitleEditor) {
      projectTitleEditor.style.display = hasComponent ? 'flex' : 'none';
    }

    if (!hasComponent) {
      if (status) status.hidden = true;
      return;
    }

    const name = appState.currentProjectName || appState.selectedComponent.title || 'Untitled Component';
    if (headerProjectName && headerProjectName.textContent !== name) {
      headerProjectName.textContent = name;
      headerProjectName.title = `Component: ${name} (Click or press F2 to rename)`;
    }

    if (status) {
      status.hidden = false;
      const statusText = document.getElementById('project-status-text');
      status.classList.remove('is-saved', 'is-unsaved', 'is-saving', 'is-failed');

      if (stateOverride === 'saving') {
        if (statusText) statusText.textContent = 'Saving…';
        status.classList.add('is-saving');
      } else if (stateOverride === 'failed') {
        if (statusText) statusText.textContent = 'Save failed';
        status.classList.add('is-failed');
      } else {
        const isSaved = (Boolean(appState.currentProjectId) || Boolean(appState.activeProject)) && !appState.isDirty;
        if (statusText) {
          statusText.textContent = isSaved ? 'Saved just now' : 'Unsaved changes';
        }
        status.classList.toggle('is-saved', isSaved);
        status.classList.toggle('is-unsaved', !isSaved);
      }
    }
  }

  function startHeaderProjectRename() {
    if (!appState.selectedComponent || !headerProjectName || !inputHeaderProjectName) return;
    inputHeaderProjectName.value = appState.currentProjectName || headerProjectName.textContent || '';
    headerProjectName.style.display = 'none';
    if (btnEditProjectName) btnEditProjectName.style.display = 'none';
    inputHeaderProjectName.style.display = 'inline-block';
    inputHeaderProjectName.focus();
    inputHeaderProjectName.select();
  }

  function commitHeaderProjectRename() {
    if (!inputHeaderProjectName || inputHeaderProjectName.style.display === 'none') return;
    const newName = inputHeaderProjectName.value.trim();
    if (newName && newName !== appState.currentProjectName) {
      appState.currentProjectName = newName;
      appState.isDirty = true;
      if (appState.currentProjectId) {
        try {
          renameProject(appState.currentProjectId, newName);
          showToast(`Renamed project to “${newName}”.`, 'success', 2500);
        } catch (e) {
          console.warn('Could not persist rename directly to storage:', e);
        }
      }
    }
    inputHeaderProjectName.style.display = 'none';
    if (headerProjectName) headerProjectName.style.display = 'inline-block';
    if (btnEditProjectName) btnEditProjectName.style.display = 'inline-flex';
    updateProjectStatusDisplay();
  }

  function cancelHeaderProjectRename() {
    if (!inputHeaderProjectName || inputHeaderProjectName.style.display === 'none') return;
    inputHeaderProjectName.style.display = 'none';
    if (headerProjectName) headerProjectName.style.display = 'inline-block';
    if (btnEditProjectName) btnEditProjectName.style.display = 'inline-flex';
  }

  if (headerProjectName) headerProjectName.addEventListener('click', startHeaderProjectRename);
  if (btnEditProjectName) btnEditProjectName.addEventListener('click', startHeaderProjectRename);
  if (inputHeaderProjectName) {
    inputHeaderProjectName.addEventListener('blur', commitHeaderProjectRename);
    inputHeaderProjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitHeaderProjectRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelHeaderProjectRename();
      }
    });
  }

  // Resumes whatever New/Open/Back-to-Templates action the user was attempting once a
  // Save chosen from guardUnsavedChanges() actually succeeds (openSaveDialog's own
  // modalDefaultSettlers entry, below, clears this if that save is cancelled instead).
  let pendingActionAfterSave = null;

  /**
   * Requirement 4/5, P08: call before New Project, Back to Templates, or loading a
   * different saved project. Returns `true` when the caller should proceed immediately
   * (nothing dirty, or the user chose Discard), `false` when the caller must not proceed
   * (Cancel), or `'deferred'` when the user chose Save — in that case this function has
   * already opened the save dialog and stashed `action` in pendingActionAfterSave; the
   * caller should not also run `action` itself.
   */
  /**
   * Names what the unsaved-changes prompt is about. Never says "Untitled project" while a
   * named course is open: a block inside a course is “<block>” in “<course>”.
   */
  function describeActiveWork() {
    const course = appState.activeProject?.name;
    const block = appState.activeComponentInstance?.name || appState.currentProjectName;
    if (course && block && block !== course) return `“${block}” in “${course}”`;
    if (course) return `“${course}”`;
    if (block) return `“${block}”`;
    const type = appState.selectedComponent?.title || appState.selectedComponent?.name;
    return type ? `Your new ${type} block (not saved yet)` : 'Your work';
  }

  async function guardUnsavedChanges(action) {
    if (!appState.isDirty) return true;
    const result = await openConfirmDialog({
      title: 'Unsaved changes',
      message: `${describeActiveWork()} has unsaved changes. Save before continuing?`,
      confirmLabel: 'Discard',
      cancelLabel: 'Cancel',
      danger: true,
      extraLabel: 'Save'
    });
    if (result === false) return false;
    if (result === true) return true;
    pendingActionAfterSave = action;
    openSaveDialog('save');
    return 'deferred';
  }

  function hideAllWorkspacePanels() {
    [landingWorkspace, dashboardWorkspace, projectOverviewWorkspace, projectMediaWorkspace, coursePreviewWorkspace, projectQaWorkspace, storyboardImportWorkspace, postPublishWorkspace].forEach(panel => {
      if (panel) {
        panel.hidden = true;
        panel.style.display = 'none';
      }
    });
  }

  function showState(state, context = {}) {
    clearAllModalIsolations();
    hideAllWorkspacePanels();
    document.body.classList.toggle('is-landing-mode', state === 'landing');
    if (state !== 'editor') {
      unmountMcBehaviorGroup();
      unmountContextBandFields();
    }

    if (['landing', 'dashboard', 'project-overview', 'project-media', 'course-preview', 'project-qa', 'storyboard-import', 'post-publish'].includes(state)) {
      if (sidebar) {
        sidebar.hidden = true;
        sidebar.style.display = 'none';
      }
      catalogState.hidden = true;
      editorState.hidden = true;
      catalogState.style.display = 'none';
      editorState.style.display = 'none';
      if (configPanel) {
        configPanel.hidden = true;
        configPanel.style.display = 'none';
      }
      if (previewPanel) {
        previewPanel.hidden = true;
        previewPanel.style.display = 'none';
      }
      if (workspaceResizer) workspaceResizer.style.display = 'none';
      const btnDocked = document.getElementById('btn-docked-show-preview');
      if (btnDocked) btnDocked.style.display = 'none';
      if (appWorkspace) {
        appWorkspace.classList.remove('is-browsing');
        appWorkspace.classList.remove('is-authoring');
      }
      const status = document.getElementById('project-status');
      if (status) status.hidden = true;

      if (state === 'landing') {
        if (landingWorkspace) {
          landingWorkspace.hidden = false;
          landingWorkspace.style.display = 'flex';
          if (landingViewInstance) landingViewInstance.unmount();
          landingViewInstance = new LandingView({
            container: landingWorkspace,
            onEnterDashboard: () => showState('dashboard')
          });
          landingViewInstance.mount();
        }
      } else if (state === 'dashboard') {
        if (dashboardWorkspace) {
          dashboardWorkspace.hidden = false;
          dashboardWorkspace.style.display = 'flex';
          if (dashboardViewInstance) dashboardViewInstance.unmount();
          dashboardViewInstance = new DashboardView({
            container: dashboardWorkspace,
            onOpenProject: (projId) => {
              activeProjectId = projId;
              showState('project-overview', { projectId: projId });
            },
            onOpenCatalog: () => {
              showState('dashboard');
            },
            onCreateNewComponent: () => {
              performNewProject();
            },
            onOpenComponent: (componentId) => {
              const comp = componentCatalog.find(c => c.id === componentId) || getComponentById(COMPONENT_REGISTRY, componentId);
              if (comp) {
                loadComponentToEditor(comp);
              } else {
                showState('dashboard');
              }
            },
            onOpenPostPublish: () => {
              showState('post-publish');
            },
            onOpenStoryboardImport: () => {
              showState('storyboard-import');
            },
            onRestoreDraft: async (draft) => {
              if (await applyProject(draft, true)) {
                showToast(`Restored draft “${draft.name}”.`, 'success');
              }
            }
          });
          dashboardViewInstance.mount();
        }
      } else if (state === 'project-overview') {
        const projId = context.projectId || activeProjectId;
        activeProjectId = projId;
        if (projectOverviewWorkspace) {
          projectOverviewWorkspace.hidden = false;
          projectOverviewWorkspace.style.display = 'flex';
          if (projectOverviewInstance) projectOverviewInstance.unmount();
          projectOverviewInstance = new ProjectOverviewView({
            container: projectOverviewWorkspace,
            projectId: projId,
            onBackToDashboard: () => showState('dashboard'),
            onEditComponent: (project, comp) => {
              activeProjectId = project.id;
              applyComponentInstance(project, comp);
            },
            onExportComponent: async (project, comp) => {
              activeProjectId = project.id;
              const loaded = await applyComponentInstance(project, comp);
              if (loaded) {
                setupExportModalContent();
                openModal('modal-export');
              }
            },
            onOpenPreview: (id) => showState('course-preview', { projectId: id }),
            onOpenMedia: (id) => showState('project-media', { projectId: id }),
            onOpenQa: (id) => showState('project-qa', { projectId: id }),
            onExportProject: (id) => {
              showPreExportReviewDialog({
                projectId: id,
                onViewQa: (projId) => showState('project-qa', { projectId: projId }),
                onProceed: async (projId) => {
                  try {
                    await downloadCourseProjectZip(projId);
                    showToast('Course package exported successfully!', 'success');
                  } catch (err) {
                    showToast(`Export failed: ${err.message}`, 'error');
                  }
                }
              });
            }
          });
          if (context.selectedComponentId) {
            projectOverviewInstance.state.selectedType = 'component';
            projectOverviewInstance.state.selectedId = context.selectedComponentId;
          }
          projectOverviewInstance.mount();
        }
      } else if (state === 'project-media') {
        const projId = context.projectId || activeProjectId;
        if (projectMediaWorkspace) {
          projectMediaWorkspace.hidden = false;
          projectMediaWorkspace.style.display = 'flex';
          if (projectMediaInstance) projectMediaInstance.unmount();
          projectMediaInstance = new ProjectMediaView({
            container: projectMediaWorkspace,
            projectId: projId,
            onBack: () => showState('project-overview', { projectId: projId })
          });
          projectMediaInstance.mount();
        }
      } else if (state === 'course-preview') {
        const projId = context.projectId || activeProjectId;
        if (coursePreviewWorkspace) {
          coursePreviewWorkspace.hidden = false;
          coursePreviewWorkspace.style.display = 'flex';
          if (coursePreviewInstance) coursePreviewInstance.unmount();
          coursePreviewInstance = new CoursePreviewView({
            container: coursePreviewWorkspace,
            projectId: projId,
            onBack: () => showState('project-overview', { projectId: projId }),
            onOpenQa: (id) => showState('project-qa', { projectId: id }),
            onOpenPreview: (id) => showState('course-preview', { projectId: id }),
            onEditComponent: (project, comp) => {
              activeProjectId = project.id;
              applyComponentInstance(project, comp);
            }
          });
          coursePreviewInstance.mount();
        }
      } else if (state === 'project-qa') {
        const projId = context.projectId || activeProjectId;
        if (projectQaWorkspace) {
          projectQaWorkspace.hidden = false;
          projectQaWorkspace.style.display = 'flex';
          if (projectQaInstance) projectQaInstance.unmount();
          projectQaInstance = new ProjectQaView({
            container: projectQaWorkspace,
            projectId: projId,
            onBack: () => showState('project-overview', { projectId: projId }),
            onOpenQa: (id) => showState('project-qa', { projectId: id }),
            onOpenPreview: (id) => showState('course-preview', { projectId: id }),
            onEditComponent: (project, comp) => {
              activeProjectId = project.id;
              applyComponentInstance(project, comp);
            }
          });
          projectQaInstance.mount();
        }
      } else if (state === 'storyboard-import') {
        if (storyboardImportWorkspace) {
          storyboardImportWorkspace.hidden = false;
          storyboardImportWorkspace.style.display = 'flex';
          if (storyboardImportInstance) storyboardImportInstance.unmount();
          storyboardImportInstance = new StoryboardImportView({
            container: storyboardImportWorkspace,
            onBack: () => showState('dashboard'),
            onImported: (projectId) => {
              activeProjectId = projectId;
              showState('project-overview', { projectId });
            }
          });
          storyboardImportInstance.mount();
        }
      } else if (state === 'post-publish') {
        if (postPublishWorkspace) {
          postPublishWorkspace.hidden = false;
          postPublishWorkspace.style.display = 'flex';
          if (!postPublishWorkflowInstance) {
            postPublishWorkflowInstance = createPostPublishWorkflow({
              onBack: () => showState('dashboard')
            });
            postPublishWorkspace.appendChild(postPublishWorkflowInstance);
          }
        }
      }
    } else {
      if (configPanel) {
        configPanel.hidden = false;
        configPanel.style.display = '';
      }
      if (previewPanel) {
        previewPanel.hidden = false;
        previewPanel.style.display = '';
      }
      if (workspaceResizer) workspaceResizer.style.display = '';
      const btnDocked = document.getElementById('btn-docked-show-preview');
      if (btnDocked) btnDocked.style.display = '';

      if (state === 'catalog') {
        if (sidebar) {
          sidebar.hidden = false;
          sidebar.style.display = '';
        }
        catalogState.hidden = false;
        editorState.hidden = true;
        catalogState.style.display = 'flex';
        editorState.style.display = 'none';
        if (appWorkspace) {
          appWorkspace.classList.add('is-browsing');
          appWorkspace.classList.remove('is-authoring');
        }
        if (sidebar && sidebar.classList.contains('sidebar-collapsed')) {
          toggleSidebar(false);
        }
        const status = document.getElementById('project-status');
        if (status) status.hidden = true; // no project context on the catalog screen
      } else if (state === 'editor') {
        if (sidebar) {
          sidebar.hidden = true;
          sidebar.style.display = 'none';
        }
        catalogState.hidden = true;
        editorState.hidden = false;
        catalogState.style.display = 'none';
        editorState.style.display = 'flex';
        if (appWorkspace) {
          appWorkspace.classList.add('is-authoring');
          appWorkspace.classList.remove('is-browsing');
        }
        // Context-sensitive back navigation label
        if (btnBackToCatalog) {
          const backSpan = btnBackToCatalog.querySelector('span');
          if (backSpan) {
            backSpan.textContent = appState.activeProject ? 'Return to Course Workspace' : 'Back to Projects';
          }
          btnBackToCatalog.title = appState.activeProject ? 'Return to Course Workspace' : 'Back to Projects Dashboard';
        }
        // Auto-collapse sidebar in editor mode
        if (sidebar && !sidebar.classList.contains('sidebar-collapsed')) {
          toggleSidebar(true);
        }
        // Switch editor tabs back to the first 'content' tab
        switchEditorTab('content');
      }
      resetWorkspaceSplitRatio();
    }
    // P12: the single chokepoint every catalog<->editor transition passes through, so the
    // toolbar's Save/Export availability and the preview panel's empty state never need a
    // separate call site of their own to stay in sync with what's actually on screen.
    updateHeaderContext(state, context);
    updateToolbarActionAvailability();
    updatePreviewEmptyState();
  }

  function updateHeaderContext(state, _context = {}) {
    const toolbarActions = document.querySelector('.toolbar-actions');
    const projectTitleEditor = document.getElementById('project-title-editor');
    const status = document.getElementById('project-status');
    const btnProjectsDashboard = document.getElementById('btn-projects-dashboard');
    const dashboardHeaderActions = document.getElementById('dashboard-header-actions');

    // Update persistent Tubelight Navbar active tab
    const tubelightNav = document.getElementById('tubelight-navbar');
    if (tubelightNav) {
      let activeNav = 'dashboard';
      if (state === 'landing') activeNav = 'landing';
      else if (state === 'dashboard' || state === 'project-overview' || state === 'course-preview' || state === 'project-qa' || state === 'catalog' || state === 'editor') activeNav = 'dashboard';
      else if (state === 'project-media') activeNav = 'project-media';
      else if (state === 'post-publish') activeNav = 'post-publish';

      tubelightNav.querySelectorAll('.tubelight-nav-item').forEach(btn => {
        const isActive = btn.dataset.nav === activeNav;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      });
    }

    if (btnProjectsDashboard) {
      const isDashboardOrCourse = ['dashboard', 'project-overview', 'project-media', 'course-preview', 'project-qa'].includes(state);
      btnProjectsDashboard.classList.toggle('active', isDashboardOrCourse);
    }

    if (dashboardHeaderActions) {
      dashboardHeaderActions.style.display = (state === 'dashboard') ? 'flex' : 'none';
    }

    const contextualToolbar = document.getElementById('app-toolbar-contextual');
    if (contextualToolbar) {
      contextualToolbar.style.display = (state === 'editor') ? 'flex' : 'none';
    }

    if (['landing', 'dashboard', 'project-overview', 'project-media', 'course-preview', 'project-qa', 'storyboard-import', 'post-publish'].includes(state)) {
      if (toolbarActions) toolbarActions.style.display = 'none';
      if (projectTitleEditor) projectTitleEditor.style.display = 'none';
      if (status) status.hidden = true;
    } else if (state === 'editor') {
      if (toolbarActions) toolbarActions.style.display = 'flex';
      if (projectTitleEditor) projectTitleEditor.style.display = 'flex';
      updateToolbarActionAvailability();
      updateProjectStatusDisplay();
    } else {
      // catalog
      if (toolbarActions) toolbarActions.style.display = 'flex';
      if (projectTitleEditor) projectTitleEditor.style.display = 'none';
      if (status) status.hidden = true;
      updateToolbarActionAvailability();
    }
  }


  // P12 Requirement 3: there is no valid selected component to save or export while the
  // catalog screen is showing — whether that's a fresh launch, "New Project," or "Back to
  // Templates" (which also clears appState.selectedComponent, see performBackToCatalog).
  // Explains why near the disabled action via `title`/`aria-label`, matching the existing
  // pattern setExportActionsEnabled() uses for the Blocking-issues case inside the modal.
  function updateToolbarActionAvailability() {
    const hasSelection = Boolean(appState.selectedComponent);
    const noSelectionReason = 'Select a component to enable this.';
    [document.getElementById('btn-save'), document.getElementById('btn-export')].forEach(button => {
      if (!button) return;
      if (!button.dataset.defaultTitle) button.dataset.defaultTitle = button.title;
      button.disabled = !hasSelection;
      const title = hasSelection ? button.dataset.defaultTitle : noSelectionReason;
      button.title = title;
      button.setAttribute('aria-label', title);
    });
  }

  // P12: the live preview panel is a permanent sibling of the catalog/editor screens (not
  // hidden by showState() the way #catalog-state/#editor-state are), so without this it
  // would keep silently rendering appState.config's leftover content — the sample
  // accordion's own default data — even on a bare catalog screen where nothing is
  // selected, contradicting what the catalog screen itself is showing.
  function updatePreviewEmptyState() {
    const emptyState = document.getElementById('preview-empty-state');
    if (!emptyState || !livePreviewIframe) return;
    const hasSelection = Boolean(appState.selectedComponent || appState.previewedComponent);
    const wasHidden = livePreviewIframe.hidden;
    livePreviewIframe.hidden = !hasSelection;
    emptyState.hidden = hasSelection;
    if (wasHidden && hasSelection) void livePreviewIframe.offsetHeight;
  }

  function quickPreviewComponent(component) {
    appState.previewedComponent = component;
    const registryEntry = getComponentById(COMPONENT_REGISTRY, component.id) || component;
    const presets = getPresetsForComponent(component.id);
    const preset = presets.length ? presets[0] : null;
    const baseConfig = getDefaultConfig(registryEntry);
    const sampleConfig = preset?.config
      ? {
          blockTitle: preset.config.blockTitle || toSentenceCase(component.title || registryEntry.name || ''),
          blockHeadline: preset.config.blockHeadline || `Explore ${component.title || registryEntry.name}`,
          blockDesc: preset.config.blockDesc || component.desc || registryEntry.description || '',
          borderRadius: '12',
          shadowDepth: 'soft',
          borderOutline: true,
          trackCompletion: false,
          completionMsg: 'Complete!',
          ...baseConfig,
          ...preset.config
        }
      : {
          blockTitle: toSentenceCase(component.title || registryEntry.name || ''),
          blockHeadline: `Explore details about ${component.title || registryEntry.name}`,
          blockDesc: component.desc || registryEntry.description || '',
          borderRadius: '12',
          shadowDepth: 'soft',
          borderOutline: true,
          trackCompletion: false,
          completionMsg: 'Complete!',
          ...baseConfig
        };
    const sampleState = {
      selectedComponent: registryEntry,
      config: sampleConfig,
      activeTheme: appState.activeTheme || getBuiltInTheme(),
      componentOverrides: {}
    };
    const html = compilePreview(sampleState, componentRegistry, colorToRgba);
    if (livePreviewIframe) {
      const emptyState = document.getElementById('preview-empty-state');
      if (emptyState) emptyState.hidden = true;
      livePreviewIframe.hidden = false;
      writePreview(livePreviewIframe, html);
      showPreviewSyncToast('Preview loaded');
    }
    renderCatalog();
  }

  // ==========================================
  // CATALOG RENDERING
  // ==========================================
  function renderCatalog() {
    componentsGrid.innerHTML = '';

    let filtered = filterCatalog(componentCatalog, appState);
    filtered = sortCatalog(filtered, appState.catalogSortMode || 'recommended', {
      favorites: appState.favorites,
      recentlyUsed: appState.recentlyUsed
    });

    if (componentsGrid) {
      componentsGrid.classList.toggle('view-compact', appState.catalogViewDensity === 'compact');
    }
    if (btnDensityComfortable) {
      btnDensityComfortable.classList.toggle('active', appState.catalogViewDensity !== 'compact');
      btnDensityComfortable.setAttribute('aria-pressed', String(appState.catalogViewDensity !== 'compact'));
    }
    if (btnDensityCompact) {
      btnDensityCompact.classList.toggle('active', appState.catalogViewDensity === 'compact');
      btnDensityCompact.setAttribute('aria-pressed', String(appState.catalogViewDensity === 'compact'));
    }
    if (selectCatalogSort) {
      selectCatalogSort.value = appState.catalogSortMode || 'recommended';
    }

    renderFilterChips(filterChipsContainer, appState, {
      onRemoveChip: (key) => {
        if (key === 'category') {
          appState.activeCategory = 'interactive';
          navItems.forEach(n => {
            const isMatch = n.getAttribute('data-category') === 'interactive';
            n.classList.toggle('active', isMatch);
          });
        } else if (key === 'classification') {
          appState.activeClassification = 'all';
          classificationFilterButtons.forEach(b => {
            const isMatch = b.getAttribute('data-classification') === 'all';
            b.classList.toggle('active', isMatch);
            b.setAttribute('aria-pressed', String(isMatch));
          });
        } else if (key === 'purpose') {
          appState.activePurpose = 'all';
          purposeChips.forEach(c => {
            const isMatch = c.getAttribute('data-purpose') === 'all';
            c.classList.toggle('active', isMatch);
            c.setAttribute('aria-pressed', String(isMatch));
          });
        } else if (key === 'query') {
          appState.searchQuery = '';
          if (searchInput) searchInput.value = '';
          const btnClear = document.getElementById('btn-clear-search');
          if (btnClear) btnClear.style.display = 'none';
        }
        renderCatalog();
      },
      onClearAll: () => {
        appState.activeCategory = 'interactive';
        appState.activeClassification = 'all';
        appState.activePurpose = 'all';
        appState.searchQuery = '';
        if (searchInput) searchInput.value = '';
        const btnClear = document.getElementById('btn-clear-search');
        if (btnClear) btnClear.style.display = 'none';
        navItems.forEach(n => {
          const isMatch = n.getAttribute('data-category') === 'interactive';
          n.classList.toggle('active', isMatch);
        });
        classificationFilterButtons.forEach(b => {
          const isMatch = b.getAttribute('data-classification') === 'all';
          b.classList.toggle('active', isMatch);
          b.setAttribute('aria-pressed', String(isMatch));
        });
        purposeChips.forEach(c => {
          const isMatch = c.getAttribute('data-purpose') === 'all';
          c.classList.toggle('active', isMatch);
          c.setAttribute('aria-pressed', String(isMatch));
        });
        renderCatalog();
      }
    });

    if (filtered.length === 0) {
      const query = appState.searchQuery.trim();
      if (query) {
        componentsGrid.innerHTML = `
          <div class="catalog-empty-state">
            <div class="catalog-empty-icon" aria-hidden="true">🔍</div>
            <h4>No results for “${escapeHTML(query)}”</h4>
            <p>Try a different term, or clear the search to browse by category.</p>
          </div>
        `;
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn btn-text btn-small catalog-empty-clear';
        clearButton.textContent = 'Clear search';
        clearButton.addEventListener('click', () => {
          searchInput.value = '';
          appState.searchQuery = '';
          renderCatalog();
          searchInput.focus();
        });
        componentsGrid.querySelector('.catalog-empty-state').appendChild(clearButton);
      } else if (appState.activeCategory === 'favorites') {
        componentsGrid.innerHTML = `
          <div class="catalog-empty-state">
            <div class="catalog-empty-icon" aria-hidden="true">★</div>
            <h4>No Favorites Yet</h4>
            <p>Click the star on any component to add it here for quick access.</p>
          </div>
        `;
      } else if (appState.activeCategory === 'recent') {
        componentsGrid.innerHTML = `
          <div class="catalog-empty-state">
            <div class="catalog-empty-icon" aria-hidden="true">🕐</div>
            <h4>Nothing Used Yet</h4>
            <p>Components you open will show up here for quick access.</p>
          </div>
        `;
      } else {
        componentsGrid.innerHTML = `
          <div class="catalog-empty-state">
            <div class="catalog-empty-icon" aria-hidden="true">🔍</div>
            <h4>No Components Found</h4>
            <p>Try changing your category or learning purpose filter.</p>
          </div>
        `;
      }
      return;
    }

    filtered.forEach(comp => {
      componentsGrid.appendChild(createCatalogCard(comp, {
        isFavorited: appState.favorites.has(comp.id),
        isPreviewed: appState.previewedComponent?.id === comp.id,
        isSelected: appState.selectedComponent?.id === comp.id,
        onPreview: (component) => quickPreviewComponent(component),
        onSelect: loadComponentToEditor,
        onToggleFavorite: (id) => {
          if (appState.favorites.has(id)) {
            appState.favorites.delete(id);
          } else {
            appState.favorites.add(id);
          }
          updateFavoritesBadge();
          try { saveFavorites(appState.favorites); }
          catch (error) { showToast(error.message, 'error'); }
          renderCatalog();
        },
        onOpenDetails: (component) => {
          showComponentDetailsModal(component, loadComponentToEditor, (c) => {
            const registryEntry = getComponentById(COMPONENT_REGISTRY, c.id) || c;
            const presets = getPresetsForComponent(c.id);
            const preset = presets.length ? presets[0] : null;
            const baseConfig = getDefaultConfig(registryEntry);
            const sampleConfig = preset?.config
              ? {
                  blockTitle: preset.config.blockTitle || toSentenceCase(c.title || registryEntry.name || ''),
                  blockHeadline: preset.config.blockHeadline || `Explore ${c.title || registryEntry.name}`,
                  blockDesc: preset.config.blockDesc || c.desc || registryEntry.description || '',
                  borderRadius: '12',
                  shadowDepth: 'soft',
                  borderOutline: true,
                  trackCompletion: false,
                  completionMsg: 'Complete!',
                  ...baseConfig,
                  ...preset.config
                }
              : {
                  blockTitle: toSentenceCase(c.title || registryEntry.name || ''),
                  blockHeadline: `Explore details about ${c.title || registryEntry.name}`,
                  blockDesc: c.desc || registryEntry.description || '',
                  borderRadius: '12',
                  shadowDepth: 'soft',
                  borderOutline: true,
                  trackCompletion: false,
                  completionMsg: 'Complete!',
                  ...baseConfig
                };
            const sampleState = {
              selectedComponent: registryEntry,
              config: sampleConfig,
              activeTheme: appState.activeTheme || getBuiltInTheme(),
              componentOverrides: {}
            };
            return compilePreview(sampleState, componentRegistry, colorToRgba);
          });
        }
      }));
    });
  }

  // ==========================================
  // COMPONENT LOADER & EDITOR STATE
  // ==========================================
  // Rule: the selected preview device mode (js/device-preview.js) is intentionally left
  // untouched here. It reflects the author's current testing intent ("check every block
  // at mobile width this session"), not a per-component default, so it persists across
  // component switches rather than resetting to Desktop.

  function loadComponentToEditor(component) {
    if (!component) return;
    const catEntry = componentCatalog.find(c => c.id === component.id) || component;
    appState.currentProjectId = null;
    appState.currentProjectName = '';
    appState.selectedComponent = catEntry;
    
    const title = catEntry.title || catEntry.name || 'Component';
    const category = (catEntry.category || catEntry.categoryId || 'interactive').toUpperCase();
    
    activeComponentTitle.innerText = title;
    activeComponentCategory.innerText = category;
    updateComponentSpecificOptions(catEntry.id);
    syncIvAuthoringVideoSource();
    renderIvMarkerTimeline();

    // Sync block text items with defaults/reset if needed
    inputBlockTitle.value = toSentenceCase(title);
    inputBlockHeadline.value = `Explore details about ${title}`;
    
    appState.config.blockTitle = inputBlockTitle.value;
    appState.config.blockHeadline = inputBlockHeadline.value;
    if (catEntry.id !== 'accordion') {
      // The base config is the Accordion demo; its description is wrong for other blocks.
      appState.config.blockDesc = defaultBlockHeader(title).blockDesc;
      inputBlockDesc.value = appState.config.blockDesc;
    }
    
    // Set Favorites icon look
    setFavoriteButtonState(appState.favorites.has(catEntry.id));

    // Setup component-specific default fields
    setupComponentFields(catEntry.id);
    (catEntry.editorSchema?.componentFields || []).forEach(field => {
      appState.config[field.id] = structuredClone(field.default ?? '');
    });
    applyMissingSchemaDefaults(catEntry);
    syncResolvedThemeConfig();

    // P11 Requirement 1: a freshly-picked component starts with only its first item
    // expanded, not every item at once.
    schemaItemEditor.resetToDefaultCollapse(appState.config.items);
    // Render dynamic item list inputs
    renderDynamicItems();

    recordRecentlyUsed(component.id);

    // Show Editor Layout
    showState('editor');

    // Force live preview frame refresh
    updateLivePreview();
    history.clear(appState.config);
    // P08: an unmodified component's own schema defaults are not "meaningful project data
    // changes" (Requirement 2) — nothing has actually been authored yet, so there's
    // nothing to guard against losing. Same load-vs-edit reset updateLivePreview()'s own
    // comment describes, applied here for the same reason applyProject() needs it.
    appState.isDirty = false;
    updateProjectStatusDisplay();
  }

  function setupComponentFields(id) {
    const entry = getComponentById(COMPONENT_REGISTRY, id) || getComponentById(COMPONENT_REGISTRY, 'accordion');
    const defaults = getDefaultConfig(entry);
    appState.config.items = defaults.items;
    Object.entries(defaults).forEach(([key, value]) => {
      if (key !== 'items') appState.config[key] = value;
    });
  }

  function applyMissingSchemaDefaults(component) {
    const schema = component?.editorSchema;
    if (!schema) return;
    (schema.componentFields || []).forEach(field => {
      if (appState.config[field.id] === undefined) appState.config[field.id] = structuredClone(field.default ?? '');
    });
    (appState.config.items || []).forEach(item => (schema.itemFields || []).forEach(field => {
      if (item[field.id] === undefined) item[field.id] = structuredClone(field.default ?? '');
    }));
  }

  function performBackToCatalog() {
    if (appState.activeProject) {
      const projId = appState.activeProject.id;
      const compId = appState.activeComponentInstance?.id;
      appState.activeProject = null;
      appState.activeComponentInstance = null;
      appState.selectedComponent = null;
      appState.currentProjectId = null;
      appState.currentProjectName = '';
      showState('project-overview', { projectId: projId, selectedComponentId: compId });
      return;
    }
    const backBtnLabel = document.getElementById('btn-back-to-catalog-label') || document.querySelector('#btn-back-to-catalog span');
    if (backBtnLabel) backBtnLabel.textContent = 'Back to Projects';
    appState.selectedComponent = null;
    appState.currentProjectId = null;
    appState.currentProjectName = '';
    showState('dashboard');
  }

  btnBackToCatalog.addEventListener('click', async () => {
    const guard = await guardUnsavedChanges(performBackToCatalog);
    if (guard === true) performBackToCatalog();
  });

  // Persistent Tubelight Navigation Bar
  const tubelightNav = document.getElementById('tubelight-navbar');
  if (tubelightNav) {
    tubelightNav.querySelectorAll('.tubelight-nav-item').forEach(navBtn => {
      navBtn.addEventListener('click', async () => {
        const targetNav = navBtn.dataset.nav;
        const targetAction = () => {
          if (targetNav === 'landing') {
            showState('landing');
          } else if (targetNav === 'dashboard') {
            showState('dashboard');
          } else if (targetNav === 'catalog') {
            appState.selectedComponent = null;
            showState('catalog');
            renderCatalog();
          } else if (targetNav === 'project-media') {
            showState('project-media');
          } else if (targetNav === 'post-publish') {
            showState('post-publish');
          }
        };

        const guard = await guardUnsavedChanges(targetAction);
        if (guard === true) targetAction();
      });
    });
  }

  if (btnProjectsDashboard) {
    btnProjectsDashboard.addEventListener('click', async () => {
      const guard = await guardUnsavedChanges(() => showState('dashboard'));
      if (guard === true) showState('dashboard');
    });
  }

  const brandLogo = document.querySelector('.brand-logo');
  const logoText = document.querySelector('.logo-text');
  const brandLogoBtn = document.getElementById('brand-logo-btn');
  [brandLogo, logoText, brandLogoBtn].forEach(el => {
    if (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', async () => {
        const guard = await guardUnsavedChanges(() => showState('landing'));
        if (guard === true) showState('landing');
      });
    }
  });

  // Favorite toggle
  function setFavoriteButtonState(isFavorited) {
    btnFavoriteToggle.classList.toggle('favorited', isFavorited);
    const label = isFavorited ? 'Remove from Favorites' : 'Add to Favorites';
    btnFavoriteToggle.title = label;
    btnFavoriteToggle.setAttribute('aria-label', label);
    btnFavoriteToggle.setAttribute('aria-pressed', String(isFavorited));
  }

  btnFavoriteToggle.addEventListener('click', () => {
    if (!appState.selectedComponent) return;

    const id = appState.selectedComponent.id;
    if (appState.favorites.has(id)) {
      appState.favorites.delete(id);
    } else {
      appState.favorites.add(id);
    }
    setFavoriteButtonState(appState.favorites.has(id));

    updateFavoritesBadge();
    try { saveFavorites(appState.favorites); }
    catch (error) { showToast(error.message, 'error'); }
    
    if (appState.activeCategory === 'favorites') {
      renderCatalog();
    }
  });

  function updateFavoritesBadge() {
    favoritesCountBadge.innerText = appState.favorites.size;
  }

  function updateRecentBadge() {
    if (recentCountBadge) recentCountBadge.innerText = appState.recentlyUsed.length;
  }

  // P11 Requirement 5: recorded exactly once per selection — a fresh component pick
  // (loadComponentToEditor) or opening/restoring a saved project (applyProject via
  // syncEditorControls) — never on every keystroke or re-render.
  function recordRecentlyUsed(componentId) {
    appState.recentlyUsed = withRecentlyUsedEntry(appState.recentlyUsed, componentId);
    updateRecentBadge();
    try { saveRecentlyUsed(appState.recentlyUsed); }
    catch (error) { showToast(error.message, 'error'); }
    if (appState.activeCategory === 'recent') renderCatalog();
  }

  function updateCategoryBadges() {
    getCategoriesWithCounts(COMPONENT_REGISTRY).forEach(({ id, count }) => {
      const badge = document.querySelector(`.nav-item[data-category="${id}"] .badge`);
      if (badge) badge.textContent = String(count);
    });
  }

  async function updateStorageMeter() {
    const label = document.getElementById('storage-usage-label');
    const bar = document.getElementById('storage-progress-bar');
    const track = bar?.closest('.storage-bar');
    if (!label || !bar || !track) return;

    let state;
    if (!navigator.storage?.estimate) {
      state = describeStorageUsage({ supported: false });
    } else {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        state = describeStorageUsage({ supported: true, usage, quota });
      } catch {
        state = describeStorageUsage({ supported: true, failed: true });
      }
    }

    label.textContent = state.label;
    label.title = state.tooltip;
    bar.style.width = `${state.percent}%`;
    track.setAttribute('aria-valuenow', String(state.percent));
    track.setAttribute('aria-label', `Browser storage: ${state.label}`);
  }

  // ==========================================
  // EDITOR TABS SWITCHING
  // ==========================================
  editorTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchEditorTab(tabId);
    });
  });

  setupEditorTabKeyboardNavigation(editorTabs, tabPanes, (tabId) => {
    switchEditorTab(tabId);
  });

  function switchEditorTab(tabId) {
    activateEditorTab(tabId, editorTabs, tabPanes);
  }

  // ==========================================
  // CONFIGURATION SYNC LISTENERS
  // ==========================================
  function setupFormListeners() {
    // 1. Text Inputs
    const syncText = (elem, stateKey) => {
      elem.addEventListener('input', (e) => {
        appState.config[stateKey] = e.target.value;
        history.pushDebouncedState(appState.config);
        updateLivePreview();
      });
    };
    
    syncText(inputBlockTitle, 'blockTitle');
    syncText(inputBlockHeadline, 'blockHeadline');
    syncText(inputBlockDesc, 'blockDesc');
    syncText(inputCompletionMsg, 'completionMsg');

    selectHeadingLevel.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.blockHeadingLevel = e.target.value;
      updateLivePreview();
    });

    if (selectHeaderStyle) {
      selectHeaderStyle.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.headerStyle = e.target.value;
        if (headerCyanRuleWrapper) headerCyanRuleWrapper.style.display = e.target.value === 'editorial' ? 'flex' : 'none';
        updateLivePreview();
      });
    }

    if (inputHeaderCyanRule) {
      inputHeaderCyanRule.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.headerCyanRule = e.target.checked;
        updateLivePreview();
      });
    }

    if (selectSpacingDensity) {
      selectSpacingDensity.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.spacingDensity = e.target.value;
        updateLivePreview();
      });
    }

    if (inputContextBandEnabled) {
      inputContextBandEnabled.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.contextBandEnabled = e.target.checked;
        if (e.target.checked) {
          if (contextBandFields) contextBandFields.style.display = 'block';
          renderContextBandFields();
        } else {
          if (contextBandFields) contextBandFields.style.display = 'none';
          unmountContextBandFields();
        }
        updateLivePreview();
      });
    }

    // Colors, fonts, border radius, and shadow are permanently locked to the single AT&T
    // theme (js/themes.js) — no per-component override UI exists in this build.

    selectIconStyle.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.iconStyle = e.target.value;
      updateLivePreview();
    });

    // 5. Checkboxes
    const syncCheckbox = (checkbox, stateKey) => {
      checkbox.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config[stateKey] = e.target.checked;
        updateLivePreview();
      });
    };

    syncCheckbox(inputBehaviorAccordionMulti, 'accordionMulti');
    syncCheckbox(inputBehaviorAccordionAnimation, 'accordionAnimation');
    syncCheckbox(inputAccordionSequential, 'accordionSequential');
    syncCheckbox(inputAccordionShowProgress, 'accordionShowProgress');
    syncCheckbox(inputAccordionShowVisitedBadge, 'accordionShowVisitedBadge');
    syncCheckbox(inputAccordionExpandCollapseAll, 'accordionExpandCollapseAll');
    syncCheckbox(inputAccordionSearch, 'accordionSearch');
    syncCheckbox(inputAccordionAllowReset, 'accordionAllowReset');
    syncCheckbox(inputTrackCompletion, 'trackCompletion');

    const completionModeRadios = document.querySelectorAll('input[name="completion-mode"]');
    completionModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        history.pushState(appState.config);
        const mode = e.target.value;
        appState.config.completionMode = mode;
        appState.config.trackCompletion = mode !== 'none';
        if (inputTrackCompletion) inputTrackCompletion.checked = appState.config.trackCompletion;
        updateLivePreview();
      });
    });

    const inputAllowReset = document.getElementById('input-allow-reset');
    if (inputAllowReset) {
      inputAllowReset.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.allowReset = e.target.checked;
        updateLivePreview();
      });
    }

    selectFlipCardsMode.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.flipCardsMode = e.target.value;
      updateLivePreview();
    });
    syncCheckbox(inputFlipCardsShuffle, 'flipCardsShuffle');
    syncCheckbox(inputFlipCardsCategories, 'flipCardsCategories');
    syncCheckbox(inputFlipCardsSummary, 'flipCardsSummary');
    syncCheckbox(inputFlipCardsReset, 'flipCardsReset');
    syncText(inputFlipCardsFrontLabel, 'flipCardsFrontLabel');
    syncText(inputFlipCardsBackLabel, 'flipCardsBackLabel');

    selectTabsOrientation.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.tabsOrientation = e.target.value;
      updateLivePreview();
    });
    syncCheckbox(inputTabsNumbered, 'tabsNumbered');
    syncCheckbox(inputTabsSequential, 'tabsSequential');
    syncCheckbox(inputTabsShowProgress, 'tabsShowProgress');
    syncCheckbox(inputTabsShowVisitedBadge, 'tabsShowVisitedBadge');
    syncCheckbox(inputTabsCompareMode, 'tabsCompareMode');
    syncCheckbox(inputTabsAllowReset, 'tabsAllowReset');

    syncCheckbox(inputTimelineCategories, 'timelineCategoriesEnabled');
    syncCheckbox(inputTimelineCompareMode, 'timelineCompareMode');
    syncCheckbox(inputTimelineCollapsible, 'timelineCollapsibleDetails');
    syncCheckbox(inputTimelineChronological, 'timelineChronologicalReveal');
    syncCheckbox(inputTimelineShowProgress, 'timelineShowProgress');
    syncCheckbox(inputTimelineAllowReset, 'timelineAllowReset');

    selectIvResumeBehaviour.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.resumeBehaviour = e.target.value;
      updateLivePreview();
    });
    selectIvCompletionRule.addEventListener('change', (e) => {
      history.pushState(appState.config);
      appState.config.completionRule = e.target.value;
      updateLivePreview();
    });
    syncCheckbox(inputIvShowMarkerNav, 'showMarkerNavigation');
    syncCheckbox(inputIvShowProgress, 'showVideoProgress');
    syncCheckbox(inputIvAllowRestart, 'allowRestart');
  }



  // ==========================================
  // INTERACTIVE VIDEO: AUTHORING TIMELINE (Phase 2)
  // ==========================================
  // Only relevant while Interactive Video is selected; a plain builder-chrome widget
  // (styles.css), never part of any exported component output. Reuses the video element
  // directly (not the sandboxed Live Preview iframe) because reading currentTime/duration
  // and seeking on click both need real, unrestricted DOM access to the element itself.
  let ivAuthoringLastSrc = '';

  function syncIvAuthoringVideoSource() {
    if (!ivAuthoringVideo || appState.selectedComponent?.id !== 'interactive-video') return;
    const config = appState.config;
    const raw = config.videoSourceType === 'url' ? config.videoUrl : config.videoMediaId;
    const resolved = resolveMediaReference(raw);
    // Guards against reloading (and interrupting playback of) the exact same source on
    // every keystroke elsewhere in the form — updateLivePreview() runs on every config
    // change, including ones unrelated to the video source itself. An empty/unresolved
    // value (e.g. mid-typing an external URL, or no source configured) intentionally
    // leaves whatever is already loaded alone rather than flashing to a blank player.
    if (!resolved || resolved === ivAuthoringLastSrc) return;
    ivAuthoringLastSrc = resolved;
    ivAuthoringVideo.src = resolved;
    appState.config.videoDurationSeconds = undefined;
  }

  function updateIvTimeReadout() {
    if (!ivAuthoringTimeReadout) return;
    const current = formatIvTimestamp(ivAuthoringVideo.currentTime || 0);
    const total = Number.isFinite(ivAuthoringVideo.duration) ? formatIvTimestamp(ivAuthoringVideo.duration) : '--:--';
    ivAuthoringTimeReadout.textContent = `${current} / ${total}`;
  }

  function renderIvMarkerTimeline() {
    if (!ivAuthoringTimelineTrack || appState.selectedComponent?.id !== 'interactive-video') return;
    const items = Array.isArray(appState.config.items) ? appState.config.items : [];
    const duration = Number(appState.config.videoDurationSeconds);
    const hasDuration = Number.isFinite(duration) && duration > 0;
    ivAuthoringTimelineTrack.innerHTML = '';
    ivAuthoringTimelineEmptyHint.hidden = hasDuration && items.length > 0;
    if (!hasDuration) return;

    items.forEach((item, index) => {
      const isMc = item.type === 'multipleChoice';
      const pct = Math.max(0, Math.min(100, ((Number(item.timestamp) || 0) / duration) * 100));
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = `iv-timeline-tick ${isMc ? 'iv-timeline-tick-mc' : 'iv-timeline-tick-info'}`;
      tick.style.left = `${pct}%`;
      tick.dataset.idx = String(index);
      // Text content, not just color, tells the two marker types apart (WCAG 1.4.1) —
      // the marker list below uses the same convention (icon + visible type label).
      tick.textContent = isMc ? '?' : 'i';
      const timeLabel = formatIvTimestamp(item.timestamp);
      tick.title = `${timeLabel} — ${item.title || 'Untitled marker'}`;
      tick.setAttribute('aria-label', `${isMc ? 'Multiple Choice' : 'Information'} marker at ${timeLabel}: ${item.title || 'Untitled marker'}. Activate to jump the preview video here.`);
      tick.addEventListener('click', () => {
        if (Number.isFinite(ivAuthoringVideo.duration)) ivAuthoringVideo.currentTime = Number(item.timestamp) || 0;
        const card = dynamicItemsContainer.querySelector(`.dynamic-item-card[data-index="${index}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (card.querySelector('.item-collapse-btn') || card).focus();
        }
      });
      ivAuthoringTimelineTrack.appendChild(tick);
    });
  }

  if (ivAuthoringVideo) {
    ivAuthoringVideo.addEventListener('loadedmetadata', () => {
      appState.config.videoDurationSeconds = Number.isFinite(ivAuthoringVideo.duration) ? ivAuthoringVideo.duration : undefined;
      updateIvTimeReadout();
      renderIvMarkerTimeline();
      refreshPreflightBadge();
    });
    ivAuthoringVideo.addEventListener('timeupdate', updateIvTimeReadout);
  }

  if (btnIvAddMarkerAtTime) {
    btnIvAddMarkerAtTime.addEventListener('click', () => {
      if (!appState.selectedComponent || appState.selectedComponent.id !== 'interactive-video') return;
      const schema = appState.selectedComponent.editorSchema;
      addEditorItem(appState, schema);
      const newItem = appState.config.items[appState.config.items.length - 1];
      newItem.timestamp = Math.max(0, Math.round(ivAuthoringVideo.currentTime || 0));
      renderDynamicItems();
      renderIvMarkerTimeline();
      updateLivePreview();
    });
  }

  // ==========================================
  // DEVICE VIEWPORT & ZOOM CONTROLS
  // ==========================================
  const previewWidthLabel = document.getElementById('preview-width-label');
  const deviceModeClasses = ['desktop', 'tablet', 'mobile-lg', 'mobile'];
  const btnPreviewOrientation = document.getElementById('btn-preview-orientation');
  let isLandscapeOrientation = false;

  function applyDeviceMode(device) {
    deviceButtons.forEach(b => {
      const isActive = b.getAttribute('data-device') === device;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
    previewViewport.classList.remove(...deviceModeClasses);
    previewViewport.classList.add(device);
    previewWidthLabel.textContent = getDeviceWidthLabel(device, COMPONENT_MAX_WIDTH);

    if (btnPreviewOrientation) {
      const isMobileOrTablet = device === 'tablet' || device === 'mobile-lg' || device === 'mobile';
      btnPreviewOrientation.style.display = isMobileOrTablet ? 'inline-flex' : 'none';
      if (!isMobileOrTablet) {
        isLandscapeOrientation = false;
        previewViewport.classList.remove('landscape');
        btnPreviewOrientation.classList.remove('active');
      }
    }
  }

  if (btnPreviewOrientation) {
    btnPreviewOrientation.addEventListener('click', () => {
      isLandscapeOrientation = !isLandscapeOrientation;
      btnPreviewOrientation.classList.toggle('active', isLandscapeOrientation);
      previewViewport.classList.toggle('landscape', isLandscapeOrientation);
      showToast(isLandscapeOrientation ? 'Orientation: Landscape' : 'Orientation: Portrait', 'info', 1500);
      updateLivePreview();
    });
  }

  // Live Preview Zoom Controls
  let previewZoom = 1.0;
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  function applyPreviewZoom(level) {
    previewZoom = Math.min(1.5, Math.max(0.5, Math.round(level * 10) / 10));
    if (livePreviewIframe) {
      if (previewZoom === 1.0) {
        livePreviewIframe.style.transform = '';
        livePreviewIframe.style.width = '100%';
      } else {
        livePreviewIframe.style.transform = `scale(${previewZoom})`;
        livePreviewIframe.style.transformOrigin = 'top center';
        livePreviewIframe.style.width = `${100 / previewZoom}%`;
      }
    }
    if (btnZoomReset) {
      btnZoomReset.textContent = `${Math.round(previewZoom * 100)}%`;
    }
  }

  if (btnZoomIn) btnZoomIn.addEventListener('click', () => applyPreviewZoom(previewZoom + 0.1));
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => applyPreviewZoom(previewZoom - 0.1));
  if (btnZoomReset) btnZoomReset.addEventListener('click', () => applyPreviewZoom(1.0));

  deviceButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const device = btn.getAttribute('data-device');
      applyDeviceMode(device);
      try { savePreviewDevice(device); }
      catch (error) { showToast(error.message, 'error'); }
    });
  });

  btnPreviewRefresh.addEventListener('click', () => {
    const spinner = btnPreviewRefresh.querySelector('svg');
    if (spinner) {
      spinner.style.transform = 'rotate(360deg)';
      spinner.style.transition = 'transform 0.6s ease';
      
      setTimeout(() => {
        spinner.style.transform = 'rotate(0deg)';
        spinner.style.transition = 'none';
      }, 600);
    }
    
    updateLivePreview();
  });

  btnPreviewPopout.addEventListener('click', () => {
    openPreview(generateIframeContent());
  });

  // ==========================================
  // MODALS HANDLING
  // ==========================================
  const btnShortcuts = document.getElementById('btn-shortcuts');
  const modalShortcuts = document.getElementById('modal-shortcuts');
  if (btnShortcuts && modalShortcuts) {
    btnShortcuts.addEventListener('click', () => openModal('modal-shortcuts'));
  }
  let saveDialogMode = 'save';
  let renameTargetId = null;
  let modalStack = [];
  const modalFocusReturn = new Map();
  const modalDefaultSettlers = new Map();

  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  const modalIsolationCleanups = new Map();

  function openModal(id, triggerElement = null) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const opener = triggerElement || (modalFocusReturn.get(id) || document.activeElement);
    if (!modalFocusReturn.has(id)) modalFocusReturn.set(id, opener);
    modal.style.display = 'flex';
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modalStack = modalStack.filter(existing => existing !== id);
    modalStack.push(id);

    if (modalIsolationCleanups.has(id)) {
      modalIsolationCleanups.get(id)();
      modalIsolationCleanups.delete(id);
    }

    const cleanup = isolateModal(modal, {
      triggerElement: opener,
      onDismiss: () => closeModal(id)
    });
    modalIsolationCleanups.set(id, cleanup);

    const focusable = getFocusableElements(modal.querySelector('.modal-card'));
    (focusable[0] || modal.querySelector('.modal-card'))?.focus();
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('inert', '');
    modal.setAttribute('aria-hidden', 'true');
    modalStack = modalStack.filter(existing => existing !== id);

    if (modalIsolationCleanups.has(id)) {
      const cleanup = modalIsolationCleanups.get(id);
      modalIsolationCleanups.delete(id);
      if (typeof cleanup === 'function') cleanup();
    }

    const trigger = modalFocusReturn.get(id);
    modalFocusReturn.delete(id);
    if (trigger && typeof trigger.focus === 'function' && document.contains(trigger) && !trigger.disabled) {
      try {
        trigger.focus();
      } catch {
        // ignore focus error
      }
    }
    const settleAsDismissed = modalDefaultSettlers.get(id);
    if (settleAsDismissed) {
      modalDefaultSettlers.delete(id);
      settleAsDismissed();
    }
  }

  // extraLabel (P08) opts into a third button — e.g. unsaved-changes guards need
  // Save/Discard/Cancel, not just Confirm/Cancel. Resolves 'extra' when clicked, keeping
  // the existing true/false confirm/cancel contract unchanged for every other caller
  // (only Delete used this before P08) — the button stays hidden unless extraLabel is
  // passed, so nothing about the existing 2-button flow changes.
  function openConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, extraLabel = null }) {
    return new Promise(resolve => {
      document.getElementById('modal-confirm-title').textContent = title;
      document.getElementById('modal-confirm-message').textContent = message;
      const confirmBtn = document.getElementById('btn-confirm-dialog-action');
      const cancelBtn = document.getElementById('btn-confirm-dialog-cancel');
      const extraBtn = document.getElementById('btn-confirm-dialog-extra');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.classList.toggle('btn-danger', danger);
      confirmBtn.classList.toggle('btn-primary', !danger);
      cancelBtn.textContent = cancelLabel;
      extraBtn.hidden = !extraLabel;
      extraBtn.textContent = extraLabel || '';

      let settled = false;
      const settle = value => {
        if (settled) return;
        settled = true;
        confirmBtn.removeEventListener('click', onConfirm);
        extraBtn.removeEventListener('click', onExtra);
        resolve(value);
      };
      const onConfirm = () => {
        settle(true);
        closeModal('modal-confirm');
      };
      const onExtra = () => {
        settle('extra');
        closeModal('modal-confirm');
      };
      confirmBtn.addEventListener('click', onConfirm);
      if (extraLabel) extraBtn.addEventListener('click', onExtra);
      modalDefaultSettlers.set('modal-confirm', () => settle(false));
      openModal('modal-confirm');
    });
  }

  document.addEventListener('keydown', event => {
    const target = event.target;
    const isEditingText = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (modalStack.length) {
      const topId = modalStack[modalStack.length - 1];
      const modal = document.getElementById(topId);
      if (!modal) return;
      const card = modal.querySelector('.modal-card');

      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(topId);
        return;
      }

      if (event.key === 'Tab') {
        const focusable = getFocusableElements(card);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !card.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    // Escape outside modals: return from editor to catalog if authoring
    if (event.key === 'Escape' && !isEditingText) {
      if (document.body?.classList.contains('has-open-modal') || document.querySelector('.modal-overlay:not([style*="display: none"]):not([hidden])')) {
        return;
      }
      if (editorState && editorState.style.display !== 'none') {
        event.preventDefault();
        btnBackToCatalog?.click();
        return;
      }
    }

    // '/' jumps to search in catalog view
    if (event.key === '/' && !isEditingText) {
      if (searchInput && catalogState && catalogState.style.display !== 'none') {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }
    }

    // '?' opens shortcuts cheatsheet
    if (event.key === '?' && !isEditingText) {
      event.preventDefault();
      openModal('modal-shortcuts');
      return;
    }

    // F2 triggers inline project title editing
    if (event.key === 'F2' && !isEditingText) {
      if (appState.selectedComponent) {
        event.preventDefault();
        startHeaderProjectRename();
        return;
      }
    }

    const isCmdOrCtrl = event.ctrlKey || event.metaKey;

    if (isCmdOrCtrl) {
      const key = event.key.toLowerCase();

      // Undo / Redo
      if (key === 'z' && !event.shiftKey) {
        if (history.canUndo()) {
          event.preventDefault();
          performUndo();
        }
        return;
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (history.canRedo()) {
          event.preventDefault();
          performRedo();
        }
        return;
      }

      // Save
      if (key === 's') {
        event.preventDefault();
        const btnSave = document.getElementById('btn-save');
        if (btnSave && !btnSave.disabled) btnSave.click();
        return;
      }

      // Export
      if (key === 'e') {
        event.preventDefault();
        const btnExport = document.getElementById('btn-export');
        if (btnExport && !btnExport.disabled) btnExport.click();
        return;
      }

      // Open Project
      if (key === 'o') {
        event.preventDefault();
        const btnOpen = document.getElementById('btn-open');
        if (btnOpen) btnOpen.click();
        return;
      }

      // Refresh preview
      if (key === 'p') {
        event.preventDefault();
        btnPreviewRefresh?.click();
        return;
      }

      // New Project (Ctrl+Alt+N)
      if (event.altKey && key === 'n') {
        event.preventDefault();
        const btnNew = document.getElementById('btn-new');
        if (btnNew) btnNew.click();
        return;
      }

      // Zoom preview (+ / - / 0)
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        applyPreviewZoom(previewZoom + 0.1);
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        applyPreviewZoom(previewZoom - 0.1);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        applyPreviewZoom(1.0);
        return;
      }
    }

    // Alt combinations for quick tab / viewport switching
    if (event.altKey && !isCmdOrCtrl && !isEditingText) {
      if (event.key === '1') { event.preventDefault(); activateEditorTab('content'); }
      else if (event.key === '2') { event.preventDefault(); activateEditorTab('interaction'); }
      else if (event.key === '3') { event.preventDefault(); activateEditorTab('appearance'); }
      else if (event.key === '4') { event.preventDefault(); activateEditorTab('completion'); }
      else if (event.key.toLowerCase() === 'd') { event.preventDefault(); applyDeviceMode('desktop'); }
      else if (event.key.toLowerCase() === 't') { event.preventDefault(); applyDeviceMode('tablet'); }
      else if (event.key.toLowerCase() === 'm') { event.preventDefault(); applyDeviceMode('mobile'); }
    }
  });

  function syncSettingsControls() {
    document.getElementById('settings-export-format').value = appState.settings.exportFormat;
    document.getElementById('settings-enable-autosave').checked = appState.settings.autosave;
    document.getElementById('settings-limit-image').value = appState.settings.mediaLimitsMb.image;
    document.getElementById('settings-limit-audio').value = appState.settings.mediaLimitsMb.audio;
    document.getElementById('settings-limit-video').value = appState.settings.mediaLimitsMb.video;
    document.getElementById('settings-limit-svg').value = appState.settings.mediaLimitsMb.svg;
    document.getElementById('settings-completion-origin').value = appState.settings.completionParentOrigin;
  }

  function updateAccordionBehaviorVisibility(componentId) {
    accordionBehaviorGroup.hidden = componentId !== 'accordion';
  }

  function updateFlipCardsBehaviorVisibility(componentId) {
    flipCardsBehaviorGroup.hidden = componentId !== 'flip-cards';
  }

  function renderMcBehaviorGroup() {
    if (!mcBehaviorGroup) return;
    const config = appState.config || {};
    mcBehaviorGroup.innerHTML = `
      <h3 class="group-title">Confidence &amp; Retry (Multiple Choice)</h3>

      <div class="checkbox-wrapper">
        <input type="checkbox" id="input-mc-confidence-mode">
        <label for="input-mc-confidence-mode">Ask learners how confident they are before submitting</label>
      </div>

      <div class="checkbox-wrapper">
        <input type="checkbox" id="input-mc-require-confidence">
        <label for="input-mc-require-confidence">Require a confidence level before Submit is accepted (Confidence mode only)</label>
      </div>

      <div class="input-wrapper">
        <label for="input-mc-confidence-low-label">Confidence Label — Low</label>
        <input type="text" id="input-mc-confidence-low-label" value="${escapeHTML(config.mcConfidenceLowLabel || 'Not sure')}" maxlength="24">
      </div>
      <div class="input-wrapper">
        <label for="input-mc-confidence-mid-label">Confidence Label — Medium</label>
        <input type="text" id="input-mc-confidence-mid-label" value="${escapeHTML(config.mcConfidenceMidLabel || 'Somewhat sure')}" maxlength="24">
      </div>
      <div class="input-wrapper">
        <label for="input-mc-confidence-high-label">Confidence Label — High</label>
        <input type="text" id="input-mc-confidence-high-label" value="${escapeHTML(config.mcConfidenceHighLabel || 'Very sure')}" maxlength="24">
      </div>

      <div class="checkbox-wrapper">
        <input type="checkbox" id="input-mc-show-result-summary">
        <label for="input-mc-show-result-summary">Show a supportive interpretation of correctness + confidence (Confidence mode only)</label>
      </div>

      <div class="input-wrapper">
        <label for="input-mc-max-attempts">Maximum Attempts</label>
        <input type="number" id="input-mc-max-attempts" value="${Number.isInteger(config.mcMaxAttempts) && config.mcMaxAttempts > 0 ? config.mcMaxAttempts : 1}" min="1" max="5" step="1">
        <p class="field-hint">1 keeps the original one-shot behavior. Higher values let learners retry after an incorrect attempt.</p>
      </div>

      <div class="input-wrapper">
        <label for="input-mc-hint-text" id="label-mc-hint-text">Hint (shown after an incorrect attempt, if attempts remain)</label>
        <textarea id="input-mc-hint-text" rows="2" placeholder="e.g. Consider optical insertion loss" aria-describedby="hint-mc-hint-text"></textarea>
        <p class="field-hint" id="hint-mc-hint-text">e.g. Consider optical insertion loss</p>
      </div>

      <div class="checkbox-wrapper">
        <input type="checkbox" id="input-mc-show-correct-after-final">
        <label for="input-mc-show-correct-after-final">Reveal the correct answer after the final attempt</label>
      </div>

      <div class="input-wrapper">
        <label for="input-mc-final-explanation" id="label-mc-final-explanation">Final Explanation (shown once the question concludes)</label>
        <textarea id="input-mc-final-explanation" rows="2" placeholder="e.g. OTDR trace testing is required" aria-describedby="hint-mc-final-explanation"></textarea>
        <p class="field-hint" id="hint-mc-final-explanation">e.g. OTDR trace testing is required</p>
      </div>

      <div class="checkbox-wrapper">
        <input type="checkbox" id="input-mc-allow-reset">
        <label for="input-mc-allow-reset">Show a "Try Again" action once the question concludes</label>
      </div>
    `;

    inputMcHintText = upgradeTextareaToRichText(document.getElementById('input-mc-hint-text'), { fieldId: 'mcHintText', isSingleLine: false })?.validationControl || document.getElementById('input-mc-hint-text');
    inputMcFinalExplanation = upgradeTextareaToRichText(document.getElementById('input-mc-final-explanation'), { fieldId: 'mcFinalExplanation', isSingleLine: false })?.validationControl || document.getElementById('input-mc-final-explanation');

    inputMcConfidenceMode = document.getElementById('input-mc-confidence-mode');
    inputMcRequireConfidence = document.getElementById('input-mc-require-confidence');
    inputMcConfidenceLowLabel = document.getElementById('input-mc-confidence-low-label');
    inputMcConfidenceMidLabel = document.getElementById('input-mc-confidence-mid-label');
    inputMcConfidenceHighLabel = document.getElementById('input-mc-confidence-high-label');
    inputMcShowResultSummary = document.getElementById('input-mc-show-result-summary');
    inputMcMaxAttempts = document.getElementById('input-mc-max-attempts');
    inputMcShowCorrectAfterFinal = document.getElementById('input-mc-show-correct-after-final');
    inputMcAllowReset = document.getElementById('input-mc-allow-reset');

    if (inputMcConfidenceMode) inputMcConfidenceMode.checked = config.mcConfidenceMode === true;
    if (inputMcRequireConfidence) inputMcRequireConfidence.checked = config.mcRequireConfidence === true;
    if (inputMcShowResultSummary) inputMcShowResultSummary.checked = config.mcShowResultSummary === true;
    if (inputMcHintText) inputMcHintText.value = config.mcHintText || '';
    if (inputMcShowCorrectAfterFinal) inputMcShowCorrectAfterFinal.checked = config.mcShowCorrectAfterFinal === true;
    if (inputMcFinalExplanation) inputMcFinalExplanation.value = config.mcFinalExplanation || '';
    if (inputMcAllowReset) inputMcAllowReset.checked = config.mcAllowReset === true;

    const syncDynamicCheckbox = (elem, stateKey) => {
      if (!elem) return;
      elem.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config[stateKey] = e.target.checked;
        updateLivePreview();
      });
    };
    const syncDynamicText = (elem, stateKey) => {
      if (!elem) return;
      elem.addEventListener('input', (e) => {
        appState.config[stateKey] = e.target.value;
        history.pushDebouncedState(appState.config);
        updateLivePreview();
      });
    };

    syncDynamicCheckbox(inputMcConfidenceMode, 'mcConfidenceMode');
    syncDynamicCheckbox(inputMcRequireConfidence, 'mcRequireConfidence');
    syncDynamicText(inputMcConfidenceLowLabel, 'mcConfidenceLowLabel');
    syncDynamicText(inputMcConfidenceMidLabel, 'mcConfidenceMidLabel');
    syncDynamicText(inputMcConfidenceHighLabel, 'mcConfidenceHighLabel');
    syncDynamicCheckbox(inputMcShowResultSummary, 'mcShowResultSummary');
    syncDynamicCheckbox(inputMcShowCorrectAfterFinal, 'mcShowCorrectAfterFinal');
    syncDynamicCheckbox(inputMcAllowReset, 'mcAllowReset');
    syncDynamicText(inputMcHintText, 'mcHintText');
    syncDynamicText(inputMcFinalExplanation, 'mcFinalExplanation');

    if (inputMcMaxAttempts) {
      inputMcMaxAttempts.addEventListener('input', (e) => {
        const parsed = parseInt(e.target.value, 10);
        appState.config.mcMaxAttempts = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
        history.pushDebouncedState(appState.config);
        updateLivePreview();
      });
    }
  }

  function unmountMcBehaviorGroup() {
    if (!mcBehaviorGroup) return;
    mcBehaviorGroup.innerHTML = '';
    inputMcConfidenceMode = null;
    inputMcRequireConfidence = null;
    inputMcConfidenceLowLabel = null;
    inputMcConfidenceMidLabel = null;
    inputMcConfidenceHighLabel = null;
    inputMcShowResultSummary = null;
    inputMcMaxAttempts = null;
    inputMcHintText = null;
    inputMcShowCorrectAfterFinal = null;
    inputMcFinalExplanation = null;
    inputMcAllowReset = null;
  }

  function renderContextBandFields() {
    if (!contextBandFields) return;
    const config = appState.config || {};
    contextBandFields.innerHTML = `
      <div class="input-wrapper">
        <label for="input-context-band-text" id="label-context-band-text">Context Band Content</label>
        <textarea id="input-context-band-text" rows="2" placeholder="e.g. Recommended field procedures" aria-describedby="hint-context-band-text"></textarea>
        <p class="field-hint" id="hint-context-band-text">e.g. Recommended field procedures</p>
      </div>

      <div class="input-wrapper">
        <label for="select-context-band-alignment">Context Band Alignment</label>
        <select id="select-context-band-alignment" data-field-id="contextBandAlignment">
          <option value="left"${config.contextBandAlignment !== 'center' ? ' selected' : ''}>Left-aligned</option>
          <option value="center"${config.contextBandAlignment === 'center' ? ' selected' : ''}>Centered</option>
        </select>
      </div>
    `;

    inputContextBandText = upgradeTextareaToRichText(document.getElementById('input-context-band-text'), { fieldId: 'contextBandText', isSingleLine: false })?.validationControl || document.getElementById('input-context-band-text');
    selectContextBandAlignment = document.getElementById('select-context-band-alignment');

    if (inputContextBandText) {
      inputContextBandText.value = config.contextBandText || '';
      inputContextBandText.addEventListener('input', (e) => {
        appState.config.contextBandText = e.target.value;
        history.pushDebouncedState(appState.config);
        updateLivePreview();
      });
    }

    if (selectContextBandAlignment) {
      selectContextBandAlignment.addEventListener('change', (e) => {
        history.pushState(appState.config);
        appState.config.contextBandAlignment = e.target.value;
        updateLivePreview();
      });
    }
  }

  function unmountContextBandFields() {
    if (!contextBandFields) return;
    contextBandFields.innerHTML = '';
    inputContextBandText = null;
    selectContextBandAlignment = null;
  }

  function updateMcBehaviorVisibility(componentId) {
    const isMc = componentId === 'multiple-choice';
    mcBehaviorGroup.hidden = !isMc;
    if (isMc) {
      renderMcBehaviorGroup();
    } else {
      unmountMcBehaviorGroup();
    }
  }

  function updateTabsBehaviorVisibility(componentId) {
    tabsBehaviorGroup.hidden = componentId !== 'tab-blocks';
  }

  function updateTimelineBehaviorVisibility(componentId) {
    timelineBehaviorGroup.hidden = componentId !== 'vertical-timeline';
  }

  function updateIvBehaviorVisibility(componentId) {
    ivBehaviorGroup.hidden = componentId !== 'interactive-video';
  }

  function updateIvTimelineAuthoringVisibility(componentId) {
    ivTimelineAuthoringGroup.hidden = componentId !== 'interactive-video';
  }

  // Shows only the completion modes that are true for this component, worded for it (js/completion-modes.js).
  function syncCompletionModeCards(componentId) {
    const offeredModes = getAvailableCompletionModes(componentId);
    const modeWording = COMPLETION_MODE_WORDING[getCompletionKind(componentId)] || {};
    document.querySelectorAll('input[name="completion-mode"]').forEach(radio => {
      const card = radio.closest('.completion-mode-card');
      if (!card) return;
      card.hidden = !offeredModes.includes(radio.value);
      const desc = card.querySelector('.mode-card-desc');
      if (desc) {
        if (!desc.dataset.defaultText) desc.dataset.defaultText = desc.textContent.replace(/\s+/g, ' ').trim();
        desc.textContent = modeWording[radio.value] || desc.dataset.defaultText;
      }
    });
  }

  function updateComponentSpecificOptions(componentId) {
    syncCompletionModeCards(componentId);
    updateAccordionBehaviorVisibility(componentId);
    updateFlipCardsBehaviorVisibility(componentId);
    updateMcBehaviorVisibility(componentId);
    updateTabsBehaviorVisibility(componentId);
    updateTimelineBehaviorVisibility(componentId);
    updateIvBehaviorVisibility(componentId);
    updateIvTimelineAuthoringVisibility(componentId);

    // Interaction default guidance note
    const interactionGuidance = document.getElementById('interaction-default-guidance');
    const hasCustomBehavior = ['accordion', 'flip-cards', 'multiple-choice', 'tab-blocks', 'vertical-timeline', 'interactive-video'].includes(componentId);
    if (interactionGuidance) interactionGuidance.style.display = hasCustomBehavior ? 'none' : 'flex';

    // Appearance component card
    const appearanceAccordionIcon = document.getElementById('appearance-accordion-icon-wrapper');
    const appearanceTabs = document.getElementById('appearance-tabs-wrapper');
    const componentAppearanceCard = document.getElementById('component-appearance-card');
    if (appearanceAccordionIcon) appearanceAccordionIcon.style.display = componentId === 'accordion' ? 'flex' : 'none';
    if (appearanceTabs) appearanceTabs.style.display = componentId === 'tab-blocks' ? 'block' : 'none';
    if (componentAppearanceCard) componentAppearanceCard.style.display = (componentId === 'accordion' || componentId === 'tab-blocks') ? 'flex' : 'none';

    // Completion tab items & guidance
    const ivCompletionRuleWrapper = document.getElementById('iv-completion-rule-wrapper');
    if (ivCompletionRuleWrapper) ivCompletionRuleWrapper.style.display = componentId === 'interactive-video' ? 'flex' : 'none';

    const completionTierBadge = document.getElementById('completion-tier-badge');
    const completionTrackingType = document.getElementById('completion-tracking-type');
    const completionGuidanceText = document.getElementById('completion-guidance-text');
    const statusBanner = document.getElementById('completion-status-banner');
    const compMeta = componentCatalog.find(c => c.id === componentId) || appState.selectedComponent;
    if (compMeta && completionTierBadge && completionTrackingType && completionGuidanceText) {
      completionTierBadge.textContent = compMeta.tierLabel || compMeta.tier || 'Enhanced Rise';
      completionTierBadge.className = `completion-tier-badge card-tier-${compMeta.tier || 'enhanced-rise'}`;
      completionTrackingType.textContent = compMeta.completionTracking || 'View / Interaction';
      completionGuidanceText.textContent = compMeta.completionTracking
        ? `When exported via Rise Code Block, this component reports completion through Rise iframe message events (${compMeta.completionTracking}).`
        : 'Rise tracks completion for this block via standard learner scroll visibility when embedded.';
      if (statusBanner) {
        const isCustomLms = Boolean(compMeta.completionTracking);
        statusBanner.innerHTML = isCustomLms
          ? `<span class="completion-status-icon">✓</span><span class="completion-status-msg">Rise Code Block Compatible: dispatches iframe completion message on ${escapeHTML(compMeta.completionTracking.toLowerCase())}</span>`
          : `<span class="completion-status-icon">ℹ</span><span class="completion-status-msg">Standard Rise Scroll Tracking: Rise marks this block complete when scrolled into view</span>`;
      }
    }
  }

  function syncEditorControls() {
    syncResolvedThemeConfig();
    const config = appState.config;
    inputBlockTitle.value = config.blockTitle;
    inputBlockHeadline.value = config.blockHeadline;
    inputBlockDesc.value = config.blockDesc;
    config.blockHeadingLevel = normalizeHeadingLevel(config.blockHeadingLevel);
    selectHeadingLevel.value = config.blockHeadingLevel;
    if (selectHeaderStyle) selectHeaderStyle.value = config.headerStyle || 'minimal';
    if (inputHeaderCyanRule) inputHeaderCyanRule.checked = config.headerCyanRule === true;
    if (headerCyanRuleWrapper) headerCyanRuleWrapper.style.display = config.headerStyle === 'editorial' ? 'flex' : 'none';
    if (selectSpacingDensity) selectSpacingDensity.value = config.spacingDensity || 'standard';
    if (inputContextBandEnabled) {
      inputContextBandEnabled.checked = config.contextBandEnabled === true;
      if (config.contextBandEnabled) {
        if (contextBandFields) contextBandFields.style.display = 'block';
        renderContextBandFields();
      } else {
        if (contextBandFields) contextBandFields.style.display = 'none';
        unmountContextBandFields();
      }
    }
    inputBehaviorAccordionMulti.checked = config.accordionMulti;
    inputBehaviorAccordionAnimation.checked = config.accordionAnimation;
    selectIconStyle.value = config.iconStyle;
    inputAccordionSequential.checked = config.accordionSequential === true;
    inputAccordionShowProgress.checked = config.accordionShowProgress === true;
    inputAccordionShowVisitedBadge.checked = config.accordionShowVisitedBadge === true;
    inputAccordionExpandCollapseAll.checked = config.accordionExpandCollapseAll === true;
    inputAccordionSearch.checked = config.accordionSearch === true;
    inputAccordionAllowReset.checked = config.accordionAllowReset === true;
    
    // Defensive fallbacks (not just `= config.flipCardsX`): a project saved before this
    // feature existed has no flipCards* keys at all, and an unmatched <select> value would
    // otherwise render as blank rather than the actual effective default.
    selectFlipCardsMode.value = config.flipCardsMode || 'explore';
    inputFlipCardsShuffle.checked = config.flipCardsShuffle === true;
    inputFlipCardsCategories.checked = config.flipCardsCategories === true;
    inputFlipCardsSummary.checked = config.flipCardsSummary === true;
    inputFlipCardsReset.checked = config.flipCardsReset === true;
    inputFlipCardsFrontLabel.value = config.flipCardsFrontLabel || 'Front';
    inputFlipCardsBackLabel.value = config.flipCardsBackLabel || 'Back';
    
    selectTabsOrientation.value = config.tabsOrientation || 'horizontal';
    inputTabsNumbered.checked = config.tabsNumbered === true;
    inputTabsSequential.checked = config.tabsSequential === true;
    inputTabsShowProgress.checked = config.tabsShowProgress === true;
    inputTabsShowVisitedBadge.checked = config.tabsShowVisitedBadge === true;
    inputTabsCompareMode.checked = config.tabsCompareMode === true;
    inputTabsAllowReset.checked = config.tabsAllowReset === true;
    
    inputTimelineCategories.checked = config.timelineCategoriesEnabled === true;
    inputTimelineCompareMode.checked = config.timelineCompareMode === true;
    inputTimelineCollapsible.checked = config.timelineCollapsibleDetails === true;
    inputTimelineChronological.checked = config.timelineChronologicalReveal === true;
    inputTimelineShowProgress.checked = config.timelineShowProgress === true;
    inputTimelineAllowReset.checked = config.timelineAllowReset === true;
    
    selectIvResumeBehaviour.value = config.resumeBehaviour || 'manual';
    selectIvCompletionRule.value = config.completionRule || 'videoEnded';
    inputIvShowMarkerNav.checked = config.showMarkerNavigation !== false;
    inputIvShowProgress.checked = config.showVideoProgress !== false;
    inputIvAllowRestart.checked = config.allowRestart === true;
    
    updateComponentSpecificOptions(appState.selectedComponent.id);
    syncIvAuthoringVideoSource();
    renderIvMarkerTimeline();
    inputTrackCompletion.checked = config.trackCompletion;
    inputCompletionMsg.value = config.completionMsg || '';

    // Sync completion tracking mode radio cards & allow-reset checkbox. Only the modes that are true for this component are
    // offered (js/completion-modes.js), and a saved mode it does not offer maps to the one it does.
    syncCompletionModeCards(appState.selectedComponent.id);
    const currentCompletionMode = resolveCompletionMode(appState.selectedComponent.id, config);
    if (config.trackCompletion && config.completionMode !== currentCompletionMode) config.completionMode = currentCompletionMode;
    const targetModeRadio = document.querySelector(`input[name="completion-mode"][value="${currentCompletionMode}"]`);
    if (targetModeRadio) targetModeRadio.checked = true;
    const inputAllowReset = document.getElementById('input-allow-reset');
    if (inputAllowReset) inputAllowReset.checked = config.allowReset === true;

    activeComponentTitle.innerText = appState.selectedComponent.title;
    activeComponentCategory.innerText = appState.selectedComponent.category.toUpperCase();
    btnFavoriteToggle.classList.toggle('favorited', appState.favorites.has(appState.selectedComponent.id));
    // P11 Requirement 1: opening/restoring a project is also a fresh population of the
    // items list — same "only first item open" default as picking a blank component.
    schemaItemEditor.resetToDefaultCollapse(config.items);
    renderDynamicItems();
    recordRecentlyUsed(appState.selectedComponent.id);
  }

  async function applyProject(project, isDraft = false) {
    // loadProjects() upgrades legacy saves to Schema v3 course projects, which have no
    // top-level componentId/config. Open the first component through the v3 path.
    if (project.schemaVersion === 3 && project.components) {
      const firstId = [...(project.unsectionedComponentOrder || []), ...Object.keys(project.components)]
        .find(id => project.components[id]);
      if (!firstId) {
        showToast(`“${project.name}” has no components to open.`, 'warning');
        return false;
      }
      return applyComponentInstance(project, project.components[firstId]);
    }
    const compId = window.normalizeComponentType ? window.normalizeComponentType(project.componentId) : project.componentId;
    const component = componentCatalog.find(item => item.id === compId || item.id === project.componentId)
      || (typeof getComponentById === 'function' ? getComponentById(componentCatalog, compId) : null);
    if (!component) {
      showToast(`Cannot open “${project.name}”: its component is not available.`, 'error');
      return false;
    }
    resetConfig();
    appState.config = { ...appState.config, ...structuredClone(project.config), items: structuredClone(project.config.items) };
    appState.currentProjectId = getProject(project.id) ? project.id : null;
    appState.currentProjectName = project.name;
    appState.selectedComponent = component;
    applyMissingSchemaDefaults(component);
    const mediaRestore = await restoreMediaReferences(appState.config);
    appState.settings = { ...project.settings };
    // This build is locked to a single theme (js/themes.js) — always re-resolve the
    // current live theme rather than trust a project's stored snapshot, so a brand
    // color update (e.g. the AT&T palette) reaches every previously-saved project
    // and draft, not just newly-created ones.
    appState.activeTheme = getBuiltInTheme(DEFAULT_THEME_ID);
    appState.activeThemeId = appState.activeTheme.id;
    appState.componentOverrides = normalizeComponentOverrides(project.componentOverrides);
    appState.uiTheme = project.uiTheme;
    syncResolvedThemeConfig();
    setUiTheme(project.uiTheme);
    syncSettingsControls();
    syncEditorControls();
    showState('editor');
    updateLivePreview();
    // P08: resets what updateLivePreview() just set — an open/restore is a "load," not an
    // edit. Draft restores of a never-explicitly-saved project still correctly show
    // "Unsaved changes" (updateProjectStatusDisplay ignores isDirty when currentProjectId
    // is null, which getProject(project.id) above already resolved to null for that case).
    appState.isDirty = false;
    updateProjectStatusDisplay();
    if (mediaRestore.missing.length) {
      showToast(`${mediaRestore.missing.length} uploaded media file${mediaRestore.missing.length === 1 ? ' is' : 's are'} missing from this browser.`, 'warning', 6000);
    }
    if (!isDraft) saveCurrentDraft();
    return true;
  }

  async function applyComponentInstance(project, comp) {
    try {
      const compType = normalizeComponentType(comp.type);
      const component = componentCatalog.find(item => item.id === compType || item.id === comp.type)
        || getComponentById(COMPONENT_REGISTRY, compType)
        || getComponentById(COMPONENT_REGISTRY, comp.type);
      if (!component) {
        showToast(`Cannot open component type "${comp.type}".`, 'error');
        return false;
      }
      resetConfig();
      appState.config = { ...appState.config, ...structuredClone(comp.config), items: structuredClone(comp.config?.items || []) };
      // A block saved before new blocks got their own header still holds the Accordion demo
      // text; swap exactly those strings for ones derived from the block's own name.
      appState.config = repairLeakedAccordionHeader(appState.config, component.id, component.title || component.name || comp.name);
      appState.activeProject = project;
      appState.activeComponentInstance = comp;
      appState.currentProjectId = project.id;
      
      // Compute full breadcrumb path: Course Projects / [Course Name] / [Section Name] / [Component Name]
      let sectionName = 'Unsectioned Area';
      if (project.sections && typeof project.sections === 'object') {
        for (const sec of Object.values(project.sections)) {
          if (sec.componentOrder && Array.isArray(sec.componentOrder) && sec.componentOrder.includes(comp.id)) {
            sectionName = sec.name || 'Section';
            break;
          }
        }
      } else if (project.structure && Array.isArray(project.structure.sections)) {
        const foundSec = project.structure.sections.find(s => (s.componentIds || []).includes(comp.id));
        if (foundSec && foundSec.name) {
          sectionName = foundSec.name;
        }
      }
      appState.currentProjectName = comp.name || component.title || 'Untitled Component';
      appState.currentProjectBreadcrumb = `Course Projects / ${project.name} / ${sectionName} / ${comp.name}`;
      appState.selectedComponent = component;
      applyMissingSchemaDefaults(component);
      await restoreMediaReferences(appState.config);
      appState.settings = { ...project.settings };
      appState.activeTheme = getBuiltInTheme(DEFAULT_THEME_ID);
      appState.activeThemeId = appState.activeTheme.id;
      appState.componentOverrides = normalizeComponentOverrides(comp.styleOverrides || project.componentOverrides);
      appState.uiTheme = project.uiTheme || 'light';
      syncResolvedThemeConfig();
      setUiTheme(appState.uiTheme);
      syncSettingsControls();
      syncEditorControls();
      schemaItemEditor.resetToDefaultCollapse(appState.config.items);
      renderDynamicItems();
      const backBtnLabel = document.getElementById('btn-back-to-catalog-label') || document.querySelector('#btn-back-to-catalog span');
      if (backBtnLabel) backBtnLabel.textContent = 'Return to Course Workspace';
      showState('editor');
      updateLivePreview();
      history.clear(appState.config);
      appState.isDirty = false;
      updateProjectStatusDisplay();
      return true;
    } catch (err) {
      console.error('Error applying component instance:', err);
      showToast(`Could not open component editor: ${err.message}`, 'error');
      return false;
    }
  }

  function buildCurrentProject(name, asNew = false) {
    if (!appState.selectedComponent) throw new Error('Choose a component before saving.');
    if (appState.activeProject && appState.activeComponentInstance && !asNew) {
      const proj = getProject(appState.activeProject.id) || appState.activeProject;
      if (proj.components && proj.components[appState.activeComponentInstance.id]) {
        proj.components[appState.activeComponentInstance.id].config = structuredClone(appState.config);
        proj.components[appState.activeComponentInstance.id].styleOverrides = structuredClone(appState.componentOverrides);
        proj.updatedAt = new Date().toISOString();
        return proj;
      }
    }
    const existing = !asNew && appState.currentProjectId ? getProject(appState.currentProjectId) : null;
    return buildProject({
      id: existing?.id,
      createdAt: existing?.createdAt,
      name,
      componentId: appState.selectedComponent.id,
      config: appState.config,
      activeTheme: appState.activeTheme,
      componentOverrides: appState.componentOverrides,
      uiTheme: appState.uiTheme,
      settings: appState.settings
    });
  }

  function collectValidationErrors() {
    const schema = appState.selectedComponent?.editorSchema;
    if (!schema) return [];
    const items = Array.isArray(appState.config.items) ? appState.config.items : [];
    const errors = [];

    if (items.length < (schema.minItems || 0)) {
      errors.push(`Add at least ${schema.minItems} ${schema.itemLabel.toLowerCase()}${schema.minItems === 1 ? '' : 's'}.`);
    }
    (schema.componentFields || []).forEach(field => {
      errors.push(...validateSchemaField(field, appState.config[field.id], items));
    });
    items.forEach((item, index) => {
      (schema.itemFields || []).forEach(field => {
        validateSchemaField(field, item[field.id], items)
          .forEach(message => errors.push(`${formatItemLabel(schema, index)}: ${message}`));
      });
    });

    const componentResult = validateActiveComponent(appState, componentRegistry);
    if (!componentResult.valid) errors.push(...componentResult.errors);

    return errors;
  }

  function openSaveDialog(mode = 'save', projectId = null) {
    saveDialogMode = mode;
    renameTargetId = projectId;
    const isRename = mode === 'rename';
    const target = isRename ? getProject(projectId) : null;
    saveModalTitle.textContent = isRename ? 'Rename Project' : 'Save Project';
    saveNameInput.value = target?.name || appState.currentProjectName || appState.selectedComponent?.title || '';
    document.getElementById('btn-confirm-save').textContent = isRename ? 'Rename' : 'Save';
    btnConfirmSaveAs.style.display = isRename ? 'none' : '';
    // P08: if this dialog closes (any way — Cancel, X, Escape) while still dirty, no save
    // actually happened, so any action deferred by guardUnsavedChanges() must not run
    // later on some unrelated future save. Re-registered on every open since closeModal()
    // deletes the entry after each fire (see modalDefaultSettlers, above).
    modalDefaultSettlers.set('modal-save', () => { if (appState.isDirty) pendingActionAfterSave = null; });
    openModal('modal-save');
    saveNameInput.focus();
    saveNameInput.select();
  }

  function performSave(asNew) {
    const name = saveNameInput.value.trim();
    if (!name) {
      showToast('Enter a project name.', 'error');
      saveNameInput.focus();
      return;
    }
    try {
      const saved = saveProject(buildCurrentProject(name, asNew));
      appState.currentProjectId = saved.id;
      appState.currentProjectName = saved.name;
      // An explicit save leaves nothing to recover; a draft equal to the project would only
      // make the dashboard call already-saved work an "unsaved working draft".
      window.clearTimeout(draftTimer);
      clearDraft();
      // Set before closeModal() so modal-save's own settler (above) sees isDirty already
      // false and correctly leaves pendingActionAfterSave alone for this success path.
      appState.isDirty = false;
      closeModal('modal-save');
      updateProjectStatusDisplay();
      showToast(`Saved “${saved.name}”.`, 'success');
      updateStorageMeter();
      const accessibilityWarnings = validateMediaAccessibility(appState.config, appState.selectedComponent.id);
      if (accessibilityWarnings.length) showToast(accessibilityWarnings[0], 'warning', 6000);
      if (pendingActionAfterSave) {
        const action = pendingActionAfterSave;
        pendingActionAfterSave = null;
        action();
      }
    } catch (error) {
      showToast(error.message, 'error', 5000);
    }
  }

  const selectedProjectsForCoursePack = new Set();

  function updateCoursePackControls() {
    const btn = document.getElementById('btn-export-course-pack');
    const countSpan = document.getElementById('course-pack-selected-count');
    const selectAllCheck = document.getElementById('check-select-all-projects');
    const projects = loadProjects();
    const count = selectedProjectsForCoursePack.size;
    if (countSpan) countSpan.textContent = String(count);
    if (btn) {
      btn.disabled = count === 0;
      btn.title = count === 0 ? 'Select at least one saved project to export a course pack' : `Export ${count} project(s) as Course Pack ZIP`;
    }
    if (selectAllCheck) {
      selectAllCheck.checked = projects.length > 0 && count === projects.length;
      selectAllCheck.indeterminate = count > 0 && count < projects.length;
    }
  }

  function renderStoredProjects() {
    savedComponentsList.innerHTML = '';
    const projects = loadProjects();
    // Prune selections of projects that were deleted
    const currentProjectIds = new Set(projects.map(p => p.id));
    for (const id of selectedProjectsForCoursePack) {
      if (!currentProjectIds.has(id)) selectedProjectsForCoursePack.delete(id);
    }
    updateCoursePackControls();

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'saved-components-empty';
      empty.textContent = 'No saved projects yet. Save a component or import a project JSON file.';
      savedComponentsList.appendChild(empty);
      return;
    }

    projects.forEach(project => {
      const card = document.createElement('div');
      card.className = `saved-component-card${project.id === appState.currentProjectId ? ' active-card' : ''}`;
      
      const leftCol = document.createElement('div');
      leftCol.className = 'sc-card-left';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sc-checkbox';
      checkbox.checked = selectedProjectsForCoursePack.has(project.id);
      checkbox.title = `Select “${project.name}” for course pack export`;
      checkbox.setAttribute('aria-label', `Select ${project.name} for course pack`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedProjectsForCoursePack.add(project.id);
        else selectedProjectsForCoursePack.delete(project.id);
        updateCoursePackControls();
      });

      const details = document.createElement('div');
      details.className = 'sc-details';
      const name = document.createElement('div');
      name.className = 'sc-name';
      name.textContent = project.name;
      name.title = project.name;
      const meta = document.createElement('div');
      meta.className = 'sc-meta';
      const openType = project.componentId || Object.values(project.components || {})[0]?.type;
      const component = componentCatalog.find(item => item.id === openType);
      meta.textContent = `Modified: ${formatReadableDate(project.updatedAt)} • ${component?.title || openType || 'Course project'}`;
      details.append(name, meta);
      leftCol.append(checkbox, details);

      const actions = document.createElement('div');
      actions.className = 'sc-actions';
      const addAction = (label, handler) => {
        const button = document.createElement('button');
        button.className = 'btn btn-text btn-small';
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', handler);
        actions.appendChild(button);
      };
      const performLoad = async () => {
        if (await applyProject(project)) {
          closeModal('modal-open');
          showToast(`Opened “${project.name}”.`, 'success');
        }
      };
      addAction('Load', async () => {
        const guard = await guardUnsavedChanges(performLoad);
        if (guard === true) await performLoad();
      });
      addAction('Rename', () => openSaveDialog('rename', project.id));
      addAction('Duplicate', () => {
        try { duplicateProject(project.id); renderStoredProjects(); showToast('Project duplicated.', 'success'); }
        catch (error) { showToast(error.message, 'error'); }
      });
      addAction('Export JSON (content only)', () => downloadProjectJson(project));
      addAction('Export Backup (.rise-project.zip)', async () => {
        try {
          const packaged = await exportProjectPackage(project);
          downloadProjectPackage(project.name, packaged.blob);
          showToast(packaged.missing.length
            ? `Backup downloaded (${formatExportedFileSize(packaged.size)}), but ${packaged.missing.length} referenced file(s) were missing from local storage and could not be included.`
            : `Project backup downloaded (${formatExportedFileSize(packaged.size)}). It includes your media files and can be imported again.`,
            packaged.missing.length ? 'warning' : 'success', 6000);
        } catch (error) { showToast(`Backup failed: ${error.message}`, 'error', 6000); }
      });
      addAction('Delete', async () => {
        const confirmed = await openConfirmDialog({ title: 'Delete Project', message: `Delete “${project.name}”? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
        if (!confirmed) return;
        try {
          deleteProject(project.id);
          selectedProjectsForCoursePack.delete(project.id);
          if (appState.currentProjectId === project.id) appState.currentProjectId = null;
          renderStoredProjects();
          showToast(`Deleted “${project.name}”.`, 'success');
          updateStorageMeter();
        } catch (error) { showToast(error.message, 'error'); }
      });
      card.append(leftCol, actions);
      savedComponentsList.appendChild(card);
    });
  }

  const selectAllProjectsCheck = document.getElementById('check-select-all-projects');
  if (selectAllProjectsCheck) {
    selectAllProjectsCheck.addEventListener('change', () => {
      const projects = loadProjects();
      if (selectAllProjectsCheck.checked) {
        projects.forEach(p => selectedProjectsForCoursePack.add(p.id));
      } else {
        selectedProjectsForCoursePack.clear();
      }
      renderStoredProjects();
    });
  }

  const btnExportCoursePack = document.getElementById('btn-export-course-pack');
  if (btnExportCoursePack) {
    btnExportCoursePack.addEventListener('click', async () => {
      const projects = loadProjects().filter(p => selectedProjectsForCoursePack.has(p.id));
      if (!projects.length) return showToast('Select at least one project for the course pack.', 'warning');
      const titleInput = document.getElementById('course-pack-title-input');
      const courseTitle = titleInput?.value.trim() || 'Course Package';

      btnExportCoursePack.disabled = true;
      const originalText = btnExportCoursePack.innerHTML;
      btnExportCoursePack.innerHTML = '<span>Building Course Pack…</span>';

      try {
        const componentsData = [];
        for (const project of projects) {
          const compDef = componentCatalog.find(item => item.id === project.componentId) || { id: project.componentId, title: project.name, category: 'interactive' };
          const prepared = await prepareMediaExport(project.config, { mode: 'package' });
          const projectTheme = project.theme || BUILT_IN_THEMES.find(t => t.id === DEFAULT_THEME_ID);
          const exportState = {
            selectedComponent: compDef,
            config: prepared.config,
            activeTheme: projectTheme,
            activeThemeId: projectTheme.id,
            componentOverrides: project.componentOverrides || {},
            settings: project.settings || {}
          };
          const html = compilePreview(exportState, componentRegistry, colorToRgba);
          componentsData.push({
            name: project.name,
            componentId: project.componentId,
            title: project.name,
            html,
            assets: prepared.assets,
            manifest: prepared.manifest
          });
        }

        const pack = await buildCoursePackZip({ courseTitle, components: componentsData });
        downloadCoursePackZip(courseTitle, pack.blob);
        showToast(`Course Pack ZIP downloaded with ${componentsData.length} block(s) (${formatExportedFileSize(pack.size)}).`, 'success');
      } catch (error) {
        showToast(`Course pack export failed: ${error.message}`, 'error', 6000);
      } finally {
        btnExportCoursePack.innerHTML = originalText;
        updateCoursePackControls();
      }
    });
  }

  function performNewProject() {
    clearDraft();
    resetConfig();
    const defaultTheme = getAvailableThemes().find(theme => theme.id === defaultThemeId)
      || BUILT_IN_THEMES.find(theme => theme.id === DEFAULT_THEME_ID);
    appState.activeThemeId = defaultTheme.id;
    appState.activeTheme = structuredClone(defaultTheme);
    appState.componentOverrides = {};
    syncResolvedThemeConfig();
    appState.currentProjectId = null;
    appState.currentProjectName = '';
    appState.isDirty = false; // P08: a blank slate hasn't been edited yet
    releaseAllMediaObjectURLs();
    const defaultComp = componentCatalog.find(c => c.id === 'tab-blocks') || componentCatalog.find(c => c.id === 'accordion') || componentCatalog[0];
    if (defaultComp) {
      loadComponentToEditor(defaultComp);
    } else {
      showState('catalog');
      renderCatalog();
    }
    showToast('New project started.', 'success');
  }

  document.getElementById('btn-new').addEventListener('click', async () => {
    const guard = await guardUnsavedChanges(performNewProject);
    if (guard === true) performNewProject();
  });

  document.getElementById('btn-open').addEventListener('click', () => {
    renderStoredProjects();
    openModal('modal-open');
  });

  const btnDuplicate = document.getElementById('btn-duplicate');
  if (btnDuplicate) {
    btnDuplicate.addEventListener('click', () => {
      if (!appState.selectedComponent) {
        showToast('Select or open a component block to duplicate.', 'warning');
        return;
      }
      try {
        const baseName = appState.currentProjectName || appState.selectedComponent.title || 'Component Block';
        const duplicateName = `${baseName} (Copy)`;
        const duplicatedProject = buildCurrentProject(duplicateName, true);
        const saved = saveProject(duplicatedProject);
        appState.currentProjectId = saved.id;
        appState.currentProjectName = saved.name;
        appState.isDirty = false;
        window.clearTimeout(draftTimer);
        clearDraft();
        updateProjectStatusDisplay();
        showToast(`Duplicated block as “${saved.name}”.`, 'success');
      } catch (error) {
        showToast(`Duplicate failed: ${error.message}`, 'error', 5000);
      }
    });
  }

  document.getElementById('btn-save').addEventListener('click', () => {
    const validationErrors = collectValidationErrors();
    if (validationErrors.length) {
      switchEditorTab('content');
      showToast(validationErrors[0], 'error', 6000);
      return;
    }

    if (appState.activeProject && appState.activeComponentInstance) {
      updateProjectStatusDisplay('saving');
      try {
        const proj = getProject(appState.activeProject.id) || appState.activeProject;
        if (proj.components && proj.components[appState.activeComponentInstance.id]) {
          proj.components[appState.activeComponentInstance.id].config = structuredClone(appState.config);
          proj.components[appState.activeComponentInstance.id].styleOverrides = structuredClone(appState.componentOverrides);
          proj.updatedAt = new Date().toISOString();
          saveProject(proj);
          appState.activeProject = proj;
          appState.isDirty = false;
          // Nothing left to recover after an explicit save: a draft that equals the saved
          // project would only make the dashboard offer to "resume" work that is already saved.
          window.clearTimeout(draftTimer);
          clearDraft();
          updateProjectStatusDisplay();
          showToast(`Saved component “${appState.activeComponentInstance.name}” to ${proj.name}.`, 'success');
          return;
        }
      } catch (error) {
        updateProjectStatusDisplay('failed');
        showToast(`Save failed: ${error.message}`, 'error', 5000);
        return;
      }
    }
    openSaveDialog('save');
  });

  document.getElementById('btn-import-project').addEventListener('click', () => importProjectFile.click());
  importProjectFile.addEventListener('change', async () => {
    const file = importProjectFile.files?.[0];
    if (!file) return;
    try {
      if (isProjectPackageFile(file)) {
        const { project: imported, restoredMediaCount, missingMedia } = await importProjectPackage(file);
        renderStoredProjects();
        showToast(missingMedia.length
          ? `Imported “${imported.name}”, restored ${restoredMediaCount} media file(s), but ${missingMedia.length} referenced file(s) weren't in the package or this browser.`
          : `Imported “${imported.name}”${restoredMediaCount ? ` and restored ${restoredMediaCount} media file(s)` : ''}.`,
          missingMedia.length ? 'warning' : 'success', 6000);
      } else {
        const imported = importProjectJson(await file.text());
        renderStoredProjects();
        showToast(`Imported “${imported.name}”.`, 'success');
      }
    } catch (error) {
      showToast(`Import failed: ${error.message}`, 'error', 6000);
    } finally {
      importProjectFile.value = '';
    }
  });

  function renderPresetsModal() {
    const list = document.getElementById('presets-list');
    if (!list) return;
    list.innerHTML = '';
    const compId = appState.selectedComponent?.id || 'accordion';
    const presets = getPresetsForComponent(compId);

    if (!presets.length) {
      list.innerHTML = `
        <div class="sc-empty" style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted);">
          <p>No starter presets are currently available for this component archetype.</p>
        </div>
      `;
      return;
    }

    presets.forEach(preset => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <span class="preset-card-domain">${escapeHTML(preset.domain)}</span>
        <div class="preset-card-title">${escapeHTML(preset.title)}</div>
        <div class="preset-card-desc">${escapeHTML(preset.description)}</div>
        <div class="preset-card-action">Apply Preset →</div>
      `;
      const apply = () => {
        history.pushState(appState.config);
        appState.config = { ...appState.config, ...structuredClone(preset.config), items: structuredClone(preset.config.items) };
        if (appState.selectedComponent) {
          applyMissingSchemaDefaults(appState.selectedComponent);
        }
        syncEditorControls();
        updateLivePreview();
        closeModal('modal-presets');
        showToast(`Applied preset “${preset.title}”.`, 'success');
      };
      card.addEventListener('click', apply);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          apply();
        }
      });
      list.appendChild(card);
    });
  }

  // Setup modal clicks
  Object.keys(modalTriggers).forEach(btnId => {
    const triggerBtn = document.getElementById(btnId);
    const modalId = modalTriggers[btnId];
    const modalElem = document.getElementById(modalId);
    
    if (triggerBtn && modalElem) {
      triggerBtn.addEventListener('click', () => {
        
        // Dynamic loading setup for modals
        if (modalId === 'modal-export') {
          setupExportModalContent();
        }
        if (modalId === 'modal-settings') syncSettingsControls();
        if (modalId === 'modal-preflight') renderPreflightModal();
        if (modalId === 'modal-presets') renderPresetsModal();

        openModal(modalId);
      });
    }
  });

  // Close modals
  modalOverlays.forEach(overlay => {
    const closeBtns = overlay.querySelectorAll('.modal-close-btn, .modal-cancel-btn');

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.id === 'modal-component-details') closeComponentDetailsModal();
        else closeModal(overlay.id);
      }
    });

    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (overlay.id === 'modal-component-details') closeComponentDetailsModal();
        else closeModal(overlay.id);
      });
    });
  });

  const btnConfirmSave = document.getElementById('btn-confirm-save');
  btnConfirmSave.addEventListener('click', () => {
    if (saveDialogMode === 'rename') {
      const name = saveNameInput.value.trim();
      if (!name) return showToast('Enter a project name.', 'error');
      try {
        renameProject(renameTargetId, name);
        if (appState.currentProjectId === renameTargetId) {
          appState.currentProjectName = name;
          saveCurrentDraft();
        }
        closeModal('modal-save');
        renderStoredProjects();
        showToast('Project renamed.', 'success');
      }
      catch (error) { showToast(error.message, 'error'); }
      return;
    }
    performSave(false);
  });
  btnConfirmSaveAs.addEventListener('click', () => performSave(true));

  // Settings Save
  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      const selectExport = document.getElementById('settings-export-format');
      const checkAutosave = document.getElementById('settings-enable-autosave');
      const limitImage = document.getElementById('settings-limit-image');
      const limitAudio = document.getElementById('settings-limit-audio');
      const limitVideo = document.getElementById('settings-limit-video');
      const limitSvg = document.getElementById('settings-limit-svg');
      const completionOrigin = document.getElementById('settings-completion-origin');

      try {
        appState.settings = saveSettings({
          exportFormat: selectExport.value,
          autosave: checkAutosave.checked,
          mediaLimitsMb: {
            image: Number(limitImage.value),
            audio: Number(limitAudio.value),
            video: Number(limitVideo.value),
            svg: Number(limitSvg.value)
          },
          completionParentOrigin: completionOrigin.value
        });
        syncSettingsControls();
        if (!appState.settings.autosave) clearDraft();
        else saveCurrentDraft();
        showToast('Settings applied successfully.', 'success');
        closeModal('modal-settings');
        renderDynamicItems();
        // P08: Builder Settings (media limits, autosave, export format) are a global app
        // preference, not project data — updateLivePreview() re-renders the preview using
        // the new settings (e.g. an updated media-size limit), but must not flip the
        // *project's* dirty state as a side effect of that. Preserve whatever it was.
        const wasDirty = appState.isDirty;
        updateLivePreview();
        appState.isDirty = wasDirty;
        updateProjectStatusDisplay();
      } catch (error) {
        showToast(error.message, 'error', 5000);
      }
    });
  }


  // Code Copy Buttons
  setupCopyBtn('btn-copy-html', 'export-html-code');

  function setupCopyBtn(btnId, targetId) {
    const btn = document.getElementById(btnId);
    const target = document.getElementById(targetId);
    if (btn && target) {
      btn.addEventListener('click', async () => {
        const code = target.textContent || '';
        const originalText = btn.textContent;
        btn.disabled = true;

        try {
          await copyTextToClipboard(code);
          btn.textContent = 'Copied!';
          btn.classList.add('copy-success');
          showToast('Code copied to the clipboard.', 'success');
        } catch (error) {
          btn.textContent = 'Copy failed';
          btn.classList.add('copy-error');
          showToast(error.message, 'error', 6000);
        }

        window.setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copy-success', 'copy-error');
          btn.disabled = false;
        }, 2000);
      });
    }
  }

  let currentExportBundle = null;
  let currentRiseZipBundle = null;

  async function prepareCurrentExport() {
    const prepared = await prepareMediaExport(appState.config);
    const exportState = { ...appState, config: prepared.config };
    const html = compilePreview(exportState, componentRegistry, colorToRgba);
    return { html, assets: prepared.assets, ...buildExportPayload(html, prepared) };
  }

  // Rise Project ZIP always packages every local asset (never inlines, never blocks on
  // "requires a separate file" — packaging one *is* the point), and the ZIP is only
  // actually assembled after every asset resolves, since a missing asset blocks this
  // export entirely rather than shipping an index.html with a dangling reference.
  async function prepareRiseZipBundle() {
    const prepared = await prepareMediaExport(appState.config, { mode: 'package' });
    const exportState = { ...appState, config: prepared.config };
    const html = compilePreview(exportState, componentRegistry, colorToRgba);
    if (prepared.missing.length) {
      return { html, manifest: prepared.manifest, warnings: prepared.warnings, missing: prepared.missing, blob: null, size: 0 };
    }
    const packaged = await buildRiseProjectZip({ html, assets: prepared.assets, manifest: prepared.manifest });
    return {
      html, manifest: prepared.manifest, missing: prepared.missing,
      warnings: [...prepared.warnings, ...packaged.warnings], blob: packaged.blob, size: packaged.size
    };
  }

  // Tracked so applyCompletionExportGate() (a second, independent gate layered on top —
  // see below) never re-enables a button the general preflight gate already disabled.
  let lastExportGateEnabled = true;

  function setExportActionsEnabled(enabled) {
    lastExportGateEnabled = enabled;
    const copyBtn = document.getElementById('btn-copy-html');
    if (copyBtn) {
      copyBtn.disabled = !enabled;
      copyBtn.title = enabled ? '' : 'Fix the blocking errors listed above before exporting.';
    }
    const zipButton = document.getElementById('btn-download-rise-zip');
    if (zipButton && enabled === false) {
      zipButton.disabled = true;
      zipButton.title = 'Fix the blocking errors listed above before exporting.';
    }
  }

  // A second, independent Blocking gate (Requirement 4, P02) layered on top of the general
  // preflight gate above: when completion tracking is on, the Web Package ZIP format
  // can't report completion to Rise (js/compatibility.js's single source of truth), so its
  // action is disabled with a direct fix — use "Copy for Rise" instead.
  function applyCompletionExportGate() {
    const gateIssue = checkCompletionExportFormatIssue(appState.config, 'rise-zip');
    const zipButton = document.getElementById('btn-download-rise-zip');
    const zipCard = document.getElementById('export-card-zip');
    let banner = zipCard?.querySelector('.completion-export-block');
    if (gateIssue) {
      if (zipCard && !banner) {
        banner = document.createElement('div');
        banner.className = 'field-error completion-export-block';
        banner.setAttribute('role', 'alert');
        const cardBody = zipCard.querySelector('.export-card-body');
        if (cardBody) cardBody.insertBefore(banner, cardBody.firstChild);
        else zipCard.insertBefore(banner, zipCard.firstChild);
      }
      if (banner) banner.textContent = gateIssue.explanation;
      if (zipButton) { zipButton.disabled = true; zipButton.title = 'Switch to "Copy for Rise" — the ZIP package doesn\'t report completion to Rise.'; }
    } else {
      if (banner) banner.remove();
      if (zipButton && lastExportGateEnabled) { zipButton.disabled = false; zipButton.title = ''; }
    }
  }

  // Identifies the newest export-modal Preflight run, so a slow layout measurement from an
  // earlier open (or a component that has since changed) can never overwrite a fresher result.
  let exportPreflightRunId = 0;

  function showLayoutCheckPending(container) {
    const note = document.createElement('div');
    note.className = 'preflight-layout-pending';
    note.setAttribute('role', 'status');
    note.textContent = 'Checking layout at desktop and mobile widths…';
    container.appendChild(note);
  }

  function issueSignature(issues) {
    return JSON.stringify(issues.map(item => [item.ruleId, item.itemIndex ?? null, item.explanation]));
  }

  // Never throws and never touches export availability: a failed/aborted measurement just
  // surfaces the same manual-check Recommendation the blocking version always did.
  async function refreshExportPreflightWithLayout(context, container, firstIssues, runId) {
    try {
      await attachDomMeasurement(context);
      if (runId !== exportPreflightRunId) return;
      const issues = await runPreflight(context);
      if (runId !== exportPreflightRunId) return;
      // Re-rendering replaces the list (and any focused "Go to field" button), so only do it
      // when the layout check actually added something; otherwise just clear the pending note.
      if (issueSignature(issues) === issueSignature(firstIssues)) {
        container.querySelector('.preflight-layout-pending')?.remove();
        return;
      }
      const summary = renderPreflightResults(container, issues);
      updatePreflightBadge(summary);
      announcePreflightSummary('export-preflight-announcement', issues);
    } catch {
      if (runId === exportPreflightRunId) container.querySelector('.preflight-layout-pending')?.remove();
    }
  }

  async function runExportPreflightGate() {
    const container = document.getElementById('export-preflight-results');
    if (!container) { setExportActionsEnabled(true); return true; } // fail open: a missing results panel is a tooling problem, not a content one
    const runId = ++exportPreflightRunId;
    const context = buildPreflightContext();
    // P12 Requirement 3: no selected component is a genuine reason to block export — the
    // toolbar's Export button is already disabled in this case (updateToolbarActionAvailability),
    // so this is defense-in-depth against anything that could still reach this modal.
    if (!context) {
      container.innerHTML = '<div class="preflight-empty">Select a component before exporting.</div>';
      setExportActionsEnabled(false);
      return false;
    }
    try {
      // The layout measurement (hidden-iframe renders at desktop and mobile widths) is by far
      // the slowest part of Preflight, and its two rules can only ever raise Warnings or
      // Recommendations (js/validation.js checkClippingRisk/checkMobileOverflow) — never a
      // Blocking error — so it can't change `canExport`. The modal therefore reveals as soon
      // as the fast checks are done and folds the layout findings in when they arrive.
      const issues = await runPreflight(context);
      const summary = renderPreflightResults(container, issues);
      updatePreflightBadge(summary);
      announcePreflightSummary('export-preflight-announcement', issues);
      setExportActionsEnabled(summary.canExport);
      showLayoutCheckPending(container);
      refreshExportPreflightWithLayout(context, container, issues, runId);
      return summary.canExport;
    } catch (error) {
      container.innerHTML = `<div class="preflight-empty">Preflight check failed: ${escapeHTML(error.message)}</div>`;
      setExportActionsEnabled(true); // fail open: a broken preflight check must not itself block a working export
      return true;
    }
  }

  // 2-Card Export Layout: Adaptively highlights Copy for Rise (standard components)
  // vs Web Package ZIP (when media elements are uploaded or attached).
  function updatePrimaryExportSection(payload) {
    const trackCompletion = Boolean(appState.config.trackCompletion);
    const title = document.getElementById('export-primary-title');
    const desc = document.getElementById('export-primary-desc');
    const riseCard = document.getElementById('export-card-rise');
    const zipCard = document.getElementById('export-card-zip');
    const pasteWarningBox = document.getElementById('export-large-paste-warning');
    const hasMedia = (payload.assets && payload.assets.length > 0) || payload.warnings.length > 0;

    if (title) {
      title.textContent = trackCompletion ? 'Rise Code Block with completion' : 'Copy for Rise';
    }
    if (desc) {
      desc.textContent = trackCompletion
        ? 'Paste this into a Code > Add code block in Rise 360. This format is required for Rise to detect when this component is complete.'
        : 'Paste directly into a Code > Add code block in Articulate Rise.';
    }

    // A ZIP cannot report completion to Rise (the same rule that disables its download button), so
    // when completion tracking is on it must not be the recommended format even if media is present.
    const zipCannotReportCompletion = Boolean(checkCompletionExportFormatIssue(appState.config, 'rise-zip'));
    const recommendZip = hasMedia && !zipCannotReportCompletion;

    if (riseCard && zipCard) {
      riseCard.classList.toggle('is-recommended', !recommendZip);
      zipCard.classList.toggle('is-recommended', recommendZip);
    }

    if (hasMedia && pasteWarningBox) {
      pasteWarningBox.hidden = false;
      pasteWarningBox.textContent = zipCannotReportCompletion
        ? 'Media elements detected in this component. Because it reports completion to Rise, use the Rise Code Block (Copy for Rise): the Web Package ZIP cannot report completion.'
        : 'Media elements detected in this component. The Web Package ZIP loads faster with media. Copy for Rise also works and gives the same result in Rise.';
    }
  }

  async function setupExportModalContent() {
    // The modal opens showing only #export-modal-loading (index.html); the real content
    // (#export-modal-content) stays hidden until this whole function settles — success or
    // failure — so the modal goes straight from "loading" to "ready" instead of briefly
    // showing an empty compliance section and "—" placeholder sizes first.
    const loadingEl = document.getElementById('export-modal-loading');
    const contentEl = document.getElementById('export-modal-content');
    if (loadingEl) loadingEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
    try {
      const canExport = await runExportPreflightGate();
      const warningBox = document.getElementById('export-media-warning');
      if (warningBox) { warningBox.hidden = false; warningBox.classList.add('is-loading'); warningBox.textContent = 'Preparing media export…'; }
      try {
        currentExportBundle = await prepareCurrentExport();
      } catch (error) {
        currentExportBundle = null;
        if (warningBox) { warningBox.classList.remove('is-loading'); warningBox.textContent = `Export preparation failed: ${error.message}`; }
        showToast(`Export preparation failed: ${error.message}`, 'error', 6000);
        return;
      }
      const payload = currentExportBundle;

      // Paste-friendly HTML fragment for custom HTML blocks
      const htmlCode = document.getElementById('export-html-code');
      if (htmlCode) htmlCode.textContent = payload.fragment;
      const htmlSize = getExportedFileSize(payload.fragment);
      const htmlSizeLabel = document.getElementById('export-html-size');
      if (htmlSizeLabel) htmlSizeLabel.textContent = formatExportedFileSize(htmlSize);
      const pasteWarningBox = document.getElementById('export-large-paste-warning');
      if (pasteWarningBox) {
        const pasteWarning = buildLargePasteWarning(htmlSize);
        pasteWarningBox.hidden = !pasteWarning;
        pasteWarningBox.textContent = pasteWarning || '';
      }
      if (warningBox) {
        warningBox.classList.remove('is-loading');
        warningBox.hidden = payload.warnings.length === 0;
        warningBox.textContent = payload.warnings.join(' ');
      }

      updatePrimaryExportSection(payload);
      applyCompletionExportGate();
      // Not awaited: the Web Package ZIP pane prepares an entire second bundle (media packaged
      // as real files, a second full compile, then the ZIP bytes themselves), which most opens
      // of this modal never need (Copy for Rise is the common path). It already has its own
      // "Preparing…" loading state (rise-zip-warning below) and fills in a moment after the
      // modal reveals, instead of the modal blocking on work the user may never use.
      setupRiseZipPane(canExport);
    } finally {
      if (loadingEl) loadingEl.hidden = true;
      if (contentEl) contentEl.hidden = false;
    }
  }

  async function setupRiseZipPane(canExport) {
    const zipWarningBox = document.getElementById('rise-zip-warning');
    const zipBlockingBox = document.getElementById('rise-zip-blocking');
    const zipSizeLabel = document.getElementById('rise-zip-file-size');
    const zipManifestCode = document.getElementById('rise-zip-manifest');
    const zipButton = document.getElementById('btn-download-rise-zip');
    if (zipWarningBox) { zipWarningBox.hidden = false; zipWarningBox.classList.add('is-loading'); zipWarningBox.textContent = 'Preparing Web Package ZIP…'; }
    try {
      currentRiseZipBundle = await prepareRiseZipBundle();
    } catch (error) {
      currentRiseZipBundle = null;
      if (zipWarningBox) { zipWarningBox.classList.remove('is-loading'); zipWarningBox.textContent = `ZIP preparation failed: ${error.message}`; }
      return;
    }
    const bundle = currentRiseZipBundle;
    if (zipManifestCode) zipManifestCode.textContent = JSON.stringify(bundle.manifest, null, 2);
    if (zipWarningBox) {
      zipWarningBox.classList.remove('is-loading');
      zipWarningBox.hidden = bundle.warnings.length === 0;
      zipWarningBox.textContent = bundle.warnings.join(' ');
    }
    const blocked = bundle.missing.length > 0;
    if (zipBlockingBox) {
      zipBlockingBox.hidden = !blocked;
      zipBlockingBox.textContent = blocked
        ? `Export blocked: ${bundle.missing.length} required asset${bundle.missing.length === 1 ? ' is' : 's are'} missing from local storage (${bundle.missing.join(', ')}). Re-upload the missing file(s) before exporting.`
        : '';
    }
    if (zipSizeLabel) zipSizeLabel.textContent = blocked ? '' : `Web Package ZIP size: ${formatExportedFileSize(bundle.size)}`;
    if (zipButton) {
      // This pane now fills in after the modal reveals (setupExportModalContent no longer
      // awaits it), so it must fold in the completion-format gate itself: applyCompletionExportGate
      // already ran by then and would otherwise be silently overwritten here.
      const completionBlocked = Boolean(checkCompletionExportFormatIssue(appState.config, 'rise-zip'));
      const enabled = canExport && !blocked && !completionBlocked;
      zipButton.disabled = !enabled;
      zipButton.title = blocked
        ? 'Re-upload the missing asset(s) before exporting.'
        : completionBlocked
          ? 'Switch to "Copy for Rise" — the ZIP package doesn\'t report completion to Rise.'
          : enabled ? '' : 'Fix the blocking errors listed above before exporting.';
    }
  }

  const btnDownloadRiseZip = document.getElementById('btn-download-rise-zip');
  if (btnDownloadRiseZip) {
    btnDownloadRiseZip.addEventListener('click', async () => {
      const title = appState.selectedComponent?.title || 'rise-component';
      let bundle = currentRiseZipBundle;
      try {
        if (!bundle) bundle = await prepareRiseZipBundle();
      } catch (error) {
        showToast(`Export failed: ${error.message}`, 'error', 6000);
        return;
      }
      if (bundle.missing.length) {
        showToast(`Export blocked: ${bundle.missing.length} required asset${bundle.missing.length === 1 ? ' is' : 's are'} missing from local storage. Re-upload the missing file(s).`, 'error', 7000);
        return;
      }
      downloadZipFile(title, bundle.blob);
      showToast(`Web Package ZIP downloaded (${formatExportedFileSize(bundle.size)}).`, 'success');
    });
  }

  // ==========================================
  // LIVE PREVIEW COMPILER & GENERATOR
  // ==========================================
  let draftTimer = null;

  function saveCurrentDraft() {
    if (!appState.settings.autosave || !appState.selectedComponent) return;
    try {
      const existing = appState.currentProjectId ? getProject(appState.currentProjectId) : null;
      saveDraft(buildProject({
        id: existing?.id || 'draft',
        createdAt: existing?.createdAt,
        name: appState.currentProjectName || appState.selectedComponent.title,
        componentId: appState.selectedComponent.id,
        config: appState.config,
        activeTheme: appState.activeTheme,
        componentOverrides: appState.componentOverrides,
        uiTheme: appState.uiTheme,
        settings: appState.settings
      }));
    } catch (error) {
      showToast(`Draft autosave failed: ${error.message}`, 'error', 5000);
    }
  }

  function scheduleDraftSave() {
    if (!appState.settings.autosave || !appState.selectedComponent) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveCurrentDraft, 700);
  }

  function updateLivePreview() {
    if (!livePreviewIframe) return;
    currentExportBundle = null;
    pruneMediaObjectURLs(appState.config);
    updatePreviewEmptyState();
    // P12: nothing selected means there is no real content to render or validate — without
    // this, a bare catalog screen would still silently compile and preview
    // appState.config's leftover/sample data (P12 Requirement 1's "accidental default").
    if (!appState.selectedComponent) return;
    validateActiveComponent(appState, componentRegistry);
    writePreview(livePreviewIframe, generateIframeContent());
    scheduleDraftSave();
    refreshPreflightBadge();
    refreshItemIssueBadges();
    syncIvAuthoringVideoSource();
    renderIvMarkerTimeline();
    // P08: every call here follows a meaningful project-data change (config/theme/
    // overrides) — never a transient UI-only change like preview device mode or panel
    // state, which don't call updateLivePreview() at all. Load flows (applyProject,
    // component selection) also call this, then immediately reset isDirty back to false
    // themselves, so this alone doesn't mark a freshly opened project dirty.
    appState.isDirty = true;
    updateProjectStatusDisplay();
  }

  // ==========================================
  // PREFLIGHT VALIDATION (js/validation.js)
  // ==========================================
  const SEVERITY_LABELS = { blocking: 'Blocking Errors', warning: 'Warnings', recommendation: 'Recommendations' };

  function buildPreflightContext() {
    if (!appState.selectedComponent) return null;
    return {
      componentId: appState.selectedComponent.id,
      schema: appState.selectedComponent.editorSchema,
      config: appState.config,
      theme: appState.activeTheme,
      componentOverrides: appState.componentOverrides,
      settings: appState.settings
    };
  }

  function updateEditorTabBadges(issues) {
    if (!appState.selectedComponent) {
      ['content', 'interaction', 'appearance', 'completion'].forEach(tabName => {
        const badge = document.getElementById(`tab-badge-${tabName}`);
        if (badge) badge.style.display = 'none';
      });
      return;
    }
    const context = buildPreflightContext();
    const issueList = issues || (context ? collectSyncIssues(context) : []);
    const tabCounts = { content: 0, interaction: 0, appearance: 0, completion: 0 };

    issueList.forEach(issue => {
      const fieldId = issue.field || issue.key || issue.fieldId || '';
      const tab = getFieldTabLocation(fieldId) || 'content';
      if (tabCounts[tab] !== undefined) {
        tabCounts[tab]++;
      }
    });

    ['content', 'interaction', 'appearance', 'completion'].forEach(tabName => {
      const badge = document.getElementById(`tab-badge-${tabName}`);
      if (badge) {
        const count = tabCounts[tabName];
        if (count > 0) {
          badge.textContent = count > 9 ? '9+' : String(count);
          badge.style.display = 'inline-flex';
          badge.title = `${count} issue${count > 1 ? 's' : ''} in ${tabName}`;
        } else {
          badge.style.display = 'none';
        }
      }
    });
  }

  function refreshPreflightBadge() {
    const context = buildPreflightContext();
    if (!context) return;
    const syncIssues = collectSyncIssues(context);
    updatePreflightBadge(summarizePreflight(syncIssues));
    updateEditorTabBadges(syncIssues);
  }

  // Clipping-risk/mobile-overflow (P07) need a real hidden-iframe render — too expensive
  // to run on every keystroke (Requirement 6), so this is only ever called from a full
  // preflight run (panel open, export gate), never from refreshPreflightBadge()'s
  // per-keystroke path. `domMeasurementAbort` cancels a still-in-flight measurement when a
  // newer one starts (e.g. the author reopens Preflight before the previous run finished)
  // so a stale result can never land after a fresher request superseded it.
  let domMeasurementAbort = null;

  async function attachDomMeasurement(context) {
    domMeasurementAbort?.abort();
    const controller = new AbortController();
    domMeasurementAbort = controller;
    try {
      const html = generateIframeContent();
      context.domMeasurement = await measureRenderedDimensions(html, { signal: controller.signal });
    } catch {
      context.domMeasurement = null; // measured-but-failed, not "never attempted" — still surfaces the manual-check recommendation
    }
    return context;
  }

  function updatePreflightBadge(summary) {
    if (!preflightBadge) return;
    const total = summary.blocking.length + summary.warnings.length + summary.recommendations.length;
    preflightBadge.dataset.state = summary.blocking.length ? 'blocking' : total ? 'warning' : 'clean';
    preflightBadge.textContent = total ? `Preflight (${total})` : 'Preflight';
    updateEditorTabBadges();
  }

  function jumpToPreflightField(fieldId, itemIndexRaw) {
    const itemIndex = itemIndexRaw === '' || itemIndexRaw === undefined ? null : Number(itemIndexRaw);
    closeModal('modal-preflight');
    closeModal('modal-export');
    window.setTimeout(() => {
      jumpToEditorField(fieldId, itemIndex);
    }, 60);
  }

  // Concise accessible summary (Requirement 5, P05) — a single short sentence in its own
  // aria-live region, instead of the full detailed issue list itself being live (which
  // would re-read every issue's full text aloud on every update — real chatter, not just a
  // theoretical risk, since the export modal used to do exactly that). Deliberately not
  // called from refreshPreflightBadge()'s per-keystroke path — only from a full preflight
  // render (modal open, export gate), so typing never triggers an announcement.
  function announcePreflightSummary(regionId, issues) {
    const region = document.getElementById(regionId);
    if (region) region.textContent = summarizePreflightForAnnouncement(issues);
  }

  function computeCompliancePillars(issues) {
    const brandIssues = issues.filter(i => i.rule?.includes('brand') || i.title?.toLowerCase().includes('brand') || i.title?.toLowerCase().includes('color') || i.title?.toLowerCase().includes('typography'));
    const a11yIssues = issues.filter(i => i.rule?.includes('a11y') || i.title?.toLowerCase().includes('contrast') || i.title?.toLowerCase().includes('accessibility') || i.title?.toLowerCase().includes('alt'));
    const riseIssues = issues.filter(i => i.rule?.includes('rise') || i.title?.toLowerCase().includes('rise') || i.title?.toLowerCase().includes('overflow') || i.title?.toLowerCase().includes('height') || i.title?.toLowerCase().includes('completion'));
    const mediaIssues = issues.filter(i => i.rule?.includes('media') || i.title?.toLowerCase().includes('media') || i.title?.toLowerCase().includes('image') || i.title?.toLowerCase().includes('video') || i.title?.toLowerCase().includes('audio'));

    const getPillarState = (pillIssues) => {
      if (pillIssues.some(i => i.severity === 'blocking')) return 'blocking';
      if (pillIssues.some(i => i.severity === 'warning')) return 'warning';
      return 'pass';
    };

    return [
      { id: 'brand', name: 'Brand & typography', state: getPillarState(brandIssues), count: brandIssues.length },
      { id: 'a11y', name: 'Accessibility (automated checks only)', state: getPillarState(a11yIssues), count: a11yIssues.length },
      { id: 'rise', name: 'Rise 360 layout & completion', state: getPillarState(riseIssues), count: riseIssues.length },
      { id: 'media', name: 'Media & asset budgets', state: getPillarState(mediaIssues), count: mediaIssues.length }
    ];
  }

  function renderPreflightResults(container, issues) {
    const summary = summarizePreflight(issues);
    const pillars = computeCompliancePillars(issues);
    const passingCount = pillars.filter(p => p.state === 'pass').length;

    const pillarsHTML = `
      <div class="compliance-pillars-grid">
        ${pillars.map(p => {
          const icon = p.state === 'pass' ? '✓' : p.state === 'warning' ? '!' : '×';
          const metaText = p.state === 'pass' ? 'Automated checks passed' : `${p.count} ${p.state === 'blocking' ? 'blocking issue' : 'warning'}${p.count === 1 ? '' : 's'}`;
          return `
            <div class="compliance-pillar-card">
              <span class="compliance-pillar-status is-${p.state}">${icon}</span>
              <div class="compliance-pillar-info">
                <span class="compliance-pillar-name">${escapeHTML(p.name)}</span>
                <span class="compliance-pillar-meta">${escapeHTML(metaText)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const sections = [['blocking', summary.blocking], ['warning', summary.warnings], ['recommendation', summary.recommendations]];
    const sectionsHTML = sections.filter(([, list]) => list.length).map(([severity, list]) => `
      <div class="preflight-section">
        <div class="preflight-section-title is-${severity}">${SEVERITY_LABELS[severity]} (${list.length})</div>
        <ul class="preflight-issue-list">
          ${list.map(item => `
            <li class="preflight-issue is-${item.severity}">
              <div class="preflight-issue-text">
                <span class="preflight-issue-title">${escapeHTML(item.title)}</span>
                <span class="preflight-issue-message">${escapeHTML(item.explanation)}</span>
              </div>
              ${item.fix ? `<button type="button" class="preflight-issue-jump" data-field-id="${escapeHTML(item.fieldId ?? '')}" data-item-index="${item.itemIndex ?? ''}">${escapeHTML(item.fix.label)}</button>` : ''}
            </li>`).join('')}
        </ul>
      </div>`).join('');

    const statusBanner = `<div class="preflight-summary-line" style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: ${summary.blocking.length ? 'var(--danger)' : 'var(--text-main)'};">Automated checks: ${passingCount} of 4 areas passed${summary.blocking.length ? ' · Fix blocking errors before export' : ''}</div>`;
    // Scope and limits of the automated checks, always visible with the result so a pass is never
    // read as a certificate (audit 2026-09-30, section 1). Kept as one shared block so the
    // Preflight panel and the export modal cannot drift apart.
    const scopeHTML = `
      <div class="preflight-scope">
        <p class="preflight-scope-note">These are automated checks only. They cannot certify WCAG conformance or Rise 360 compatibility.</p>
        <details>
          <summary>What do these checks cover, and what still needs a person?</summary>
          <ul>
            <li><strong>Brand &amp; typography:</strong> the approved AT&amp;T colour, type and icon tokens.</li>
            <li><strong>Accessibility:</strong> a subset of WCAG-related rules only: accessible names, alt text, colour contrast, heading level, link text and focus outlines.</li>
            <li><strong>Rise 360 layout &amp; completion:</strong> rendered height and mobile width measured in this Builder's own preview, and completion-tracking settings.</li>
            <li><strong>Media &amp; asset budgets:</strong> file type and size limits, and missing or external files.</li>
          </ul>
          <p>Before publishing, operate the block with only a keyboard, test it with a screen reader, and preview it in Rise 360 itself.</p>
        </details>
      </div>`;

    container.innerHTML = statusBanner + pillarsHTML + scopeHTML + (sectionsHTML || '<div class="preflight-empty">The automated checks found no issues. Review the block in Rise 360 before publishing.</div>');
    container.querySelectorAll('.preflight-issue-jump').forEach(button => {
      button.addEventListener('click', () => jumpToPreflightField(button.dataset.fieldId, button.dataset.itemIndex));
    });
    return summary;
  }

  async function renderPreflightModal() {
    const container = document.getElementById('preflight-results');
    if (!container) return;
    const context = buildPreflightContext();
    if (!context) { container.innerHTML = '<div class="preflight-empty">Select a component first.</div>'; return; }
    container.innerHTML = '<div class="preflight-empty">Running preflight checks…</div>';
    try {
      await attachDomMeasurement(context);
      const issues = await runPreflight(context);
      const summary = renderPreflightResults(container, issues);
      updatePreflightBadge(summary);
      announcePreflightSummary('preflight-announcement', issues);
    } catch (error) {
      container.innerHTML = `<div class="preflight-empty">Preflight check failed: ${escapeHTML(error.message)}</div>`;
    }
  }

  // Run the initialization
  window.addEventListener('beforeunload', releaseAllMediaObjectURLs);
  // P08: the browser's own native "leave site?" prompt — the one unsaved-changes guard
  // that can't use openConfirmDialog (a page already mid-unload can't await a promise or
  // show a custom modal). Setting returnValue is what triggers the native prompt; the
  // message string itself is ignored by every modern browser, which shows its own fixed
  // text instead — set anyway for older engines that still honor it.
  window.addEventListener('beforeunload', event => {
    if (!appState.isDirty) return;
    event.preventDefault();
    event.returnValue = 'You have unsaved changes. Leaving now will lose them.';
  });
  await init();

});
