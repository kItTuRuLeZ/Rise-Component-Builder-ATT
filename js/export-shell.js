// Shared export shell: the outer document shape, shared design-token wiring, and the
// shared accessibility/completion utilities every component relies on. Per-component
// markup/CSS/JS live in components/*.js and are composed in here — this file owns none
// of it. See docs/EXPORT-CONTRACT.md for the full pipeline description.

import { escapeAttribute, normalizeHeadingLevel } from './utilities.js';

// 'self' is deliberately absent from img-src/media-src: this document is loaded into a
// sandboxed iframe without allow-same-origin (index.html), which gives it a unique opaque
// origin rather than a real, stable one — 'self' has nothing consistent to resolve against
// there, and different Chrome builds/versions have been observed to disagree on how to
// handle that, silently dropping the whole style/image layer in some of them. http:/https:
// already cover every legitimate same-origin case this policy needs, so 'self' added no
// real permission — only this compatibility risk.
export const CSP_META = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' http: https: data: blob: file:; media-src 'self' http: https: blob: file:; connect-src 'none'; base-uri 'none'; form-action 'none'";

// Reset + shared block chrome (title/headline/description) + shared surfaces and density. No component-specific rules.
export const BASE_RESET_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-family);
      background-color: var(--bg-body);
      color: var(--text-main);
      padding: calc(30px * var(--spacing-scale));
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      transition: background-color var(--animation-speed) ease;
    }

    button { border-radius: var(--button-radius); }
    li::marker { color: inherit; font-size: inherit; line-height: inherit; }
    sub, sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
    sup { top: -0.5em; }
    sub { bottom: -0.25em; }
    a { color: var(--accent, #0057B8); text-underline-offset: 2px; }

    /* Interactive Block Shell */
    .rise-block-wrapper {
      width: 100%;
      max-width: var(--component-max-width);
      margin: 0 auto;
    }

    /* Density presets */
    .rise-block-wrapper.density-compact {
      --spacing-scale: 0.82;
    }
    .rise-block-wrapper.density-standard {
      --spacing-scale: 1;
    }
    .rise-block-wrapper.density-spacious {
      --spacing-scale: 1.18;
    }

    /* Shared Block Header */
    .block-header {
      margin-bottom: calc(24px * var(--spacing-scale));
      text-align: left;
    }

    .block-label {
      font-size: 19px;
      font-weight: 700;
      letter-spacing: normal;
      color: var(--accent);
      margin-bottom: 4px;
      white-space: pre-line;
    }

    .block-headline {
      font-family: var(--heading-font-family);
      white-space: pre-line;
      font-size: var(--att-fs-h2, 1.5rem);
      font-weight: var(--att-fw-bold, 700);
      color: var(--text-main);
      line-height: var(--att-lh-heading, 1.25);
      text-wrap: pretty;
    }

    .block-desc {
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-muted);
      margin-top: 6px;
      line-height: var(--att-lh-body, 1.5);
      white-space: pre-line;
      max-width: 70ch;
    }

    /* AT&T Editorial Header Presentation */
    .block-header.header-editorial {
      margin-bottom: calc(32px * var(--spacing-scale));
    }

    .block-header.header-editorial .block-label {
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-w-bold, 700);
      letter-spacing: normal;
      color: var(--att-cobalt, #00388F);
      margin-bottom: 8px;
    }

    .block-header.header-editorial .block-headline {
      font-size: clamp(1.625rem, 4vw, 2rem);
      font-weight: var(--att-w-bold, 700);
      color: var(--att-heading-contrast, #000000);
      line-height: var(--att-lh-heading, 1.25);
    }

    .block-header.header-editorial .header-cyan-rule {
      width: 36px;
      height: 3px;
      background-color: var(--att-blue, #009FDB);
      margin-top: 10px;
      margin-bottom: 12px;
      border-radius: 2px;
    }

    .block-header.header-editorial .block-desc {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      color: var(--att-text, #000000);
      margin-top: 10px;
      max-width: 70ch;
    }

    /* Optional Context Band */
    .block-context-band {
      background-color: var(--att-grey-1, #F3F4F5);
      border-top: 2px solid var(--att-blue, #009FDB);
      border-radius: var(--att-radius-md, 12px);
      padding: calc(14px * var(--spacing-scale)) calc(18px * var(--spacing-scale));
      margin-bottom: calc(24px * var(--spacing-scale));
      color: var(--att-text, #000000);
      box-shadow: var(--att-shadow-1, 0 1px 2px rgba(0,0,0,0.06));
    }

    .block-context-band.align-center {
      text-align: center;
    }

    .block-context-band.align-left {
      text-align: left;
    }

    .context-band-text {
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      margin: 0;
      max-width: 70ch;
      display: inline-block;
      text-align: inherit;
    }

    /* Shared Surface & Media Treatments */
    .att-surface, .att-card {
      background-color: var(--att-surface, #FFFFFF);
      border: 1px solid var(--att-border, #DCDFE3);
      border-radius: var(--att-radius-lg, 20px);
      box-shadow: var(--att-shadow-1, 0 1px 2px rgba(0,0,0,0.06));
    }

    .att-surface-sunken {
      background-color: var(--att-grey-1, #F3F4F5);
      border: 1px solid var(--att-border, #DCDFE3);
      border-radius: var(--att-radius-lg, 20px);
    }

    .att-media-frame {
      border-radius: var(--att-radius-lg, 20px);
      overflow: hidden;
      max-width: 100%;
    }

    .att-img-cover {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .att-img-contain {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }`;

// Shared accessibility primitives + the completion-tracker widget's CSS (used by every
// component whenever completion tracking is enabled — not specific to any one of them).
export const SHARED_A11Y_CSS = `
    [hidden] { display: none !important; }

    .sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    :where(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="radio"]):focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
      box-shadow: 0 0 0 2px var(--bg-card);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Completion Tracker Bar */
    .completion-tracker {
      margin-top: 30px;
      border-top: 1px solid var(--border-color);
      padding-top: 20px;
    }

    .progress-bar-container {
      height: 8px;
      width: 100%;
      background-color: var(--bg-body);
      border-radius: 10px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      background-color: var(--accent);
      width: 0%;
      transition: width 0.3s ease;
    }

    .completion-reset-btn {
      margin-top: 12px;
      padding: 8px 18px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      color: var(--primary);
      background: var(--bg-card);
      border: 1px solid var(--primary);
      border-radius: var(--button-radius, 999px);
      cursor: pointer;
    }

    .completion-reset-btn:hover { background: var(--primary-tint, transparent); }

    .completion-reset-btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }

    .completion-success-message {
      margin: 12px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    @media (forced-colors: active) {
      :where(button, [role="button"], [role="radio"], [role="tab"], input) { border: 1px solid ButtonText; }
      :where(button, [role="button"], [role="radio"], [role="tab"], input):focus-visible { outline: 3px solid Highlight; }
      .progress-fill { background: Highlight; }
    }`;

/**
 * The shared accessibility/completion-tracking JS every component calls into
 * (`viewedItems.add(idx); updateProgress();` / `updateTrackerComplete()`), scoped to
 * this export's instanceId so multiple exports pasted onto one page never collide.
 *
 * Three separated concepts (docs/COMPLETION-INTEGRATION.md):
 *   1. Internal interaction progress — `viewedItems`/`updateProgress()`: which items have
 *      been interacted with, and the visible/ARIA percentage. Always active whenever
 *      trackCompletion is on, regardless of whether anything is embedding this component.
 *   2. Internal component completion — `evaluateComponentCompletion()`: the one-time
 *      percent-reaches-100 transition. Purely internal state; does not by itself imply
 *      any host noticed.
 *   3. Parent-window notification — delegated entirely to `RiseComponentCompletion`
 *      (js/completion.js), which decides *whether* and *how* to tell a host, and is the
 *      only thing here that touches window.parent/postMessage.
 */
export function renderSharedA11yScript({ instanceId, trackCompletion, totalItems, completionMessage }) {
  return `
    var viewedItems = new Set();
    var totalItems = ${Number(totalItems) || 1};
    var completionMessage = ${completionMessage};

    function announce(message) {
      var status = document.getElementById('${instanceId}-interaction-status');
      if (!status) return;
      status.textContent = '';
      window.setTimeout(function() { status.textContent = message; }, 20);
    }

    // Concept #1: internal interaction progress (ARIA valuenow/valuetext only — no
    // completion decision here).
    function setProgressAccessibility(percent) {
      var progress = document.getElementById('${instanceId}-progress-bar');
      if (progress) {
        progress.setAttribute('aria-valuenow', String(percent));
        progress.setAttribute('aria-valuetext', percent + ' percent complete');
      }
    }

    // Concept #2: internal component completion. Fires the (adapter-owned) notification
    // exactly once per completed state — see RiseComponentCompletion.notifyComplete().
    function evaluateComponentCompletion(percent) {
      if (percent < 100) return;
      // The shared Start over button (Completion tab, "Allow learner to reset / restart"). Reloading the
      // block returns every component to its starting state; the host keeps any completion it already has.
      var resetBtn = document.getElementById('${instanceId}-completion-reset');
      if (resetBtn && resetBtn.hidden) {
        resetBtn.hidden = false;
        resetBtn.addEventListener('click', function() { window.location.reload(); });
      }
      if (typeof RiseComponentCompletion === 'undefined' || RiseComponentCompletion.hasCompleted()) return;
      announce(completionMessage);
      var messageEl = document.getElementById('${instanceId}-completion-message');
      if (messageEl) {
        messageEl.textContent = completionMessage;
        messageEl.hidden = false;
      }
      RiseComponentCompletion.notifyComplete();
    }

    function updateProgress() {
      if (!${Boolean(trackCompletion)}) return;
      var percent = Math.min(Math.round((viewedItems.size / totalItems) * 100), 100);
      var txt = document.getElementById('${instanceId}-completion-text');
      var bar = document.getElementById('${instanceId}-progress-fill');
      if (txt && bar) {
        txt.textContent = percent + '%';
        bar.style.width = percent + '%';
      }
      setProgressAccessibility(percent);
      evaluateComponentCompletion(percent);
    }

    function updateTrackerComplete() {
      if (!${Boolean(trackCompletion)}) return;
      var txt = document.getElementById('${instanceId}-completion-text');
      var bar = document.getElementById('${instanceId}-progress-fill');
      if (txt && bar) {
        txt.textContent = '100%';
        bar.style.width = '100%';
      }
      setProgressAccessibility(100);
      evaluateComponentCompletion(100);
    }`;
}

const BOOTSTRAP_JS = `
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initComponent);
    } else {
      initComponent();
    }`;

/**
 * Assembles the complete standalone HTML document. This is the ONLY place that owns the
 * outer document shape (CSP, fonts, shared CSS/tokens, block header, completion tracker,
 * the combined script IIFE). Every export format and the live preview all go through this
 * same function via js/preview.js#generateIframeContent — see docs/EXPORT-CONTRACT.md.
 */
export function renderShell({
  instanceId, tokensCSS, fontQuery, customFontFaceCSS = '', componentCSS, blockLabel, blockHeadline, blockDesc,
  blockHeadingLevel, componentHTML, completionTrackerHTML, sharedA11yScript, componentJS, blockBackgroundImage = '',
  headerStyle = 'minimal', headerCyanRule = false, spacingDensity = 'standard',
  contextBandEnabled = false, contextBandText = '', contextBandAlignment = 'left'
}) {
  // Rise embeds this markup inside a lesson page that has its own h1, so the wrapping
  // headline's tag is author-configurable (defaults to h2) rather than a hardcoded h1 —
  // see docs/ACCESSIBILITY-CONFORMANCE.md.
  const headingTag = normalizeHeadingLevel(blockHeadingLevel);
  // Purely decorative, opt-in per component (js/editor-schemas.js's sharedComponentFields
  // "Block Background Image"). Already scheme-allowlisted by sanitizePreviewConfig
  // (js/utilities.js#sanitizeURL) before it ever reaches here; escapeAttribute is
  // defense-in-depth for the HTML-attribute interpolation itself. Omitted entirely (not
  // just left empty) when unset, so components that never use it stay byte-identical.
  const backgroundStyle = blockBackgroundImage
    ? ` style="background-image:url('${escapeAttribute(blockBackgroundImage)}');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:var(--border-radius);padding:24px;"`
    : '';
  // A theme's font families may be entirely self-hosted (js/custom-fonts.js) — in that case
  // fontQuery is empty and the Google Fonts <link> would otherwise request nothing useful
  // (or 400, depending on host), so it's only emitted when at least one family actually
  // needs it. Self-hosted families are embedded as base64 @font-face rules directly in the
  // page's own <style>, so they work identically in preview and every export mode with no
  // external request and no separate asset-packaging step.
  const googleFontsLink = fontQuery ? `<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">` : '';

  const isEditorial = headerStyle === 'editorial';
  const cyanRuleHtml = (isEditorial && headerCyanRule) ? '\n      <div class="header-cyan-rule" aria-hidden="true"></div>' : '';
  const blockLabelHtml = blockLabel ? `\n      <div class="block-label">${blockLabel}</div>` : '';
  const blockDescHtml = blockDesc ? `\n      <div class="block-desc">${blockDesc}</div>` : '';
  const headerClass = isEditorial ? 'block-header header-editorial' : 'block-header header-minimal';

  const headerHtml = (blockLabel || blockHeadline || blockDesc) ? `
    <div class="${headerClass}">${blockLabelHtml}
      <${headingTag} class="block-headline" id="${instanceId}-block-headline">${blockHeadline}</${headingTag}>${cyanRuleHtml}${blockDescHtml}
    </div>` : '';

  const contextBandHtml = (contextBandEnabled && contextBandText && contextBandText.trim()) ? `
    <aside class="block-context-band align-${contextBandAlignment}" role="note" aria-label="Context">
      <p class="context-band-text">${contextBandText}</p>
    </aside>` : '';

  const densityClass = (spacingDensity && spacingDensity !== 'standard') ? ` density-${spacingDensity}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP_META}">
  ${googleFontsLink}
  <style>
${customFontFaceCSS}
    :root, .rise-block-wrapper {
${tokensCSS}
    }
${BASE_RESET_CSS}
${componentCSS}
${SHARED_A11Y_CSS}
  </style>
</head>
<body>

  <main class="rise-block-wrapper${densityClass}"${backgroundStyle} aria-labelledby="${instanceId}-block-headline">${headerHtml}${contextBandHtml}

    <div class="block-content">
      ${componentHTML}
    </div>

    ${completionTrackerHTML}
    <div id="${instanceId}-interaction-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  </main>

  <script>
    (function() {
${sharedA11yScript}
${componentJS}
${BOOTSTRAP_JS}
    })();
  </script>
</body>
</html>
`;
}

export function renderCompletionTrackerHTML(instanceId, trackCompletion, allowReset = false) {
  if (!trackCompletion) return '';
  return `
    <div class="completion-tracker" aria-labelledby="${instanceId}-completion-label">
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600;">
          <span id="${instanceId}-completion-label">Progress completion</span>
          <span id="${instanceId}-completion-text" aria-hidden="true">0%</span>
        </div>
        <div class="progress-bar-container" id="${instanceId}-progress-bar" role="progressbar" aria-labelledby="${instanceId}-completion-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 percent complete">
          <div class="progress-fill" id="${instanceId}-progress-fill"></div>
        </div>
        <p id="${instanceId}-completion-message" class="completion-success-message" hidden></p>
        ${allowReset ? `<button type="button" class="completion-reset-btn" id="${instanceId}-completion-reset" hidden>Start over</button>` : ''}
      </div>`;
}
