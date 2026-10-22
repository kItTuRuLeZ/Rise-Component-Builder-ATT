import { applyThemeToConfig, DEFAULT_THEME_ID, getBuiltInTheme } from './themes.js';

const initialTheme = getBuiltInTheme(DEFAULT_THEME_ID);

const initialConfig = applyThemeToConfig({
  blockTitle: 'INTERACTIVE ACCORDION',
  blockHeadline: 'Explore the Core Dimensions',
  blockDesc: 'Click on the headers below to discover detailed insights.',
  headerStyle: 'minimal',
  headerCyanRule: false,
  spacingDensity: 'standard',
  contextBandEnabled: false,
  contextBandText: '',
  contextBandAlignment: 'left',
  colorPrimary: '#00388F',
  colorAccent: '#009FDB',
  colorBg: '#FFFFFF',
  colorText: '#000000',
  borderRadius: '12',
  shadowDepth: 'soft',
  borderOutline: true,
  accordionMulti: true,
  accordionAnimation: true,
  iconStyle: 'chevron',
  trackCompletion: false,
  completionMsg: 'Activity Complete!',
  items: [
    { title: 'Understanding User Intent', content: 'Instructional design begins by identifying the core learning objectives and alignment with business outcomes.' },
    { title: 'Designing for Engagement', content: 'Modern eLearning relies on micro-interactions, clean visual layouts, and bite-sized chunks of information.' },
    { title: 'SCORM and Tracking Analytics', content: 'Export clean standard elements to trace course completion, custom interaction states, and score cards.' }
  ]
}, initialTheme);

export const appState = {
  currentProjectId: null,
  currentProjectName: '',
  // P08: true once meaningful project data (config/theme/overrides) has changed since the
  // last successful save/open/new — never set for transient UI state (open panels,
  // preview device, search/category filters). See app.js#updateLivePreview and
  // #applyProject/#performSave for where this flips.
  isDirty: false,
  uiTheme: 'light',
  activeThemeId: initialTheme.id,
  activeTheme: initialTheme,
  componentOverrides: {},
  activeCategory: 'interactive',
  // Independent of activeCategory (see js/catalog.js#filterCatalog) — 'all', 'enhanced', or
  // 'custom'. Same transient-UI-filter status as activeCategory/searchQuery above.
  activeClassification: 'all',
  activePurpose: 'all',
  searchQuery: '',
  selectedComponent: null,
  favorites: new Set(),
  // P11: most-recently-used first, deduplicated, bounded — see js/storage.js's
  // RECENTLY_USED_LIMIT/withRecentlyUsedEntry.
  recentlyUsed: [],
  // UI/UX Enhancement state
  sidebarCollapsed: false,
  catalogViewDensity: 'comfortable', // 'comfortable' | 'compact'
  catalogSortMode: 'recommended', // 'recommended' | 'recent' | 'alphabetical' | 'enhanced' | 'custom' | 'interactive'
  editorSplitRatio: 50, // Percentage width for editor panel in authoring mode (30 to 70)
  previewVisible: true,
  previewFullscreen: false,
  previewZoom: 1.0,
  safeAreaOverlay: false,
  previewedComponent: null,
  settings: {
    defaultFont: 'Lato',
    exportFormat: 'web',
    autosave: true,
    mediaLimitsMb: { image: 10, audio: 30, video: 100, svg: 2 }
  },
  config: structuredClone(initialConfig)
};

// The editor's base config (above) is the Accordion demo. Any component that doesn't define
// its own header text used to inherit these strings, so every new block was titled
// "INTERACTIVE ACCORDION". They are kept here so they can be recognised and replaced.
export const ACCORDION_DEMO_HEADER = Object.freeze({
  blockTitle: initialConfig.blockTitle,
  blockHeadline: initialConfig.blockHeadline,
  blockDesc: initialConfig.blockDesc
});

/** Header text for a component, derived from its own name. */
export function defaultBlockHeader(title) {
  const name = String(title || 'Component').trim() || 'Component';
  return {
    blockTitle: name.toUpperCase(),
    blockHeadline: `Explore details about ${name}`,
    // The Accordion's description ("Click on the headers below…") is wrong for other blocks.
    blockDesc: ''
  };
}

/**
 * Replaces leaked Accordion demo header text on a non-Accordion component, field by field.
 * Only exact matches of the demo strings are touched, so anything an author wrote is kept.
 */
export function repairLeakedAccordionHeader(config, componentType, title) {
  if (!config || componentType === 'accordion') return config;
  const fresh = defaultBlockHeader(title);
  const repaired = { ...config };
  for (const key of Object.keys(ACCORDION_DEMO_HEADER)) {
    if (repaired[key] === ACCORDION_DEMO_HEADER[key]) repaired[key] = fresh[key];
  }
  return repaired;
}

export function resetConfig() {
  appState.config = structuredClone(initialConfig);
  return appState.config;
}
