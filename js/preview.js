import { sanitizePreviewConfig, richTextToPlain, sanitizeRichText, serializeForInlineScript } from './utilities.js';
import { resolveMediaReferencesForPreview } from './media-storage.js';
import { applyThemeToConfig, getBuiltInTheme, resolveThemeTokens } from './themes.js';
import { renderCompletionTrackerHTML, renderSharedA11yScript, renderShell } from './export-shell.js';
import { renderCompletionAdapterScript } from './completion.js';
import { CUSTOM_FONT_FACES_BY_FAMILY } from './custom-fonts.js';
import { ATT_TOKENS_CSS } from './att-tokens.js';

// The single source of truth for how wide an authored Rise block ever actually renders
// (also referenced by the builder's own Desktop preview mode, js/device-preview.js).
export const COMPONENT_MAX_WIDTH = 740;

export function writePreview(iframe, html) {
  if (!iframe) return;
  iframe.srcdoc = html;
}

export function openPreview(html) {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) return;
  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();
}

/**
 * Deterministic per-export instance id: same input state always yields the same id
 * (never Date.now()/Math.random()), so compiling the same project twice produces
 * byte-identical output. This is what keeps ids/JS globals collision-free when two
 * exported fragments are pasted onto the same host page — see docs/EXPORT-CONTRACT.md.
 */
function getInstanceId(appState) {
  return `rcb-${appState.currentProjectId || 'preview'}`;
}

// How many distinct interactions count toward 100% completion, per component shape.
// This only sizes the shared completion tracker; it carries no component-specific
// markup/CSS/JS of its own.
// Components that already offer their own reset or restart control. The Completion tab's
// "Allow learner to reset / restart after completion" option adds a shared Start over button
// to every other component (it used to be read by Sorting Activity alone).
const SELF_RESETTING_COMPONENTS = new Set(['sorting-activity', 'scenario', 'multiple-choice', 'multiple-select', 'interactive-video']);

function getTrackableCount(compId, itemCount) {
  if (compId === 'flip-cards') return Math.max(Math.ceil(itemCount / 2), 1);
  if (compId === 'scenario') return Math.max(itemCount - 1, 1);
  if (['audio-player', 'video-frame'].includes(compId)) return 1;
  return Math.max(itemCount, 1);
}

export function generateIframeContent(appState, componentRegistry, colorToRgba) {
  const compId = appState.selectedComponent ? appState.selectedComponent.id : 'accordion';
  const entry = componentRegistry[compId];
  if (!entry) {
    throw new Error(`Cannot compile preview: no registered component module for "${compId}". This component may have been removed from the registry.`);
  }

  const theme = appState.activeTheme || getBuiltInTheme();
  const themedConfig = applyThemeToConfig(
    resolveMediaReferencesForPreview(appState.config), theme, appState.componentOverrides
  );
  const c = sanitizePreviewConfig(themedConfig, compId);
  const themeTokens = resolveThemeTokens(theme, appState.componentOverrides);
  const toRgba = colorToRgba;
  const instanceId = getInstanceId(appState);

  const shadowStyle = {
    'none': 'none',
    'soft': '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)',
    'medium': '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.05)',
    'premium': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)'
  }[c.shadowDepth];

  const bodyBg = themeTokens.background;
  const textMain = themeTokens.text;
  const textMuted = themeTokens.mutedText;
  const cardBg = themeTokens.surface;
  const borderColor = c.borderOutline ? themeTokens.border : 'transparent';
  const cardBorder = c.borderOutline ? '1px solid var(--border-color)' : 'none';
  const fontStack = themeTokens.fontFamily;
  const headingFontStack = themeTokens.headingFontFamily;
  // A theme's fontFamily/headingFontFamily may each independently be a Google Fonts family
  // or a self-hosted one registered in js/custom-fonts.js — split them so a self-hosted
  // family is never requested from Google (it isn't there) and a Google family never
  // silently falls through with no @font-face at all.
  const uniqueFamilies = [...new Set([fontStack, headingFontStack])];
  const googleFamilies = uniqueFamilies.filter(font => !CUSTOM_FONT_FACES_BY_FAMILY[font]);
  const fontQuery = googleFamilies
    .map(font => `family=${font.replaceAll(' ', '+')}:wght@300;400;500;600;700`).join('&');
  const customFontFaceCSS = uniqueFamilies
    .map(font => CUSTOM_FONT_FACES_BY_FAMILY[font]).filter(Boolean).join('\n\n');
  const density = c.spacingDensity || themeTokens.spacingDensity || 'standard';
  const spacingScale = { compact: 0.82, standard: 1, comfortable: 1, spacious: 1.18 }[density] || 1;
  const primaryLight = toRgba(c.colorPrimary, 0.12, 'rgba(0, 56, 143, 0.12)');
  const primaryTint = toRgba(c.colorPrimary, 0.05, 'rgba(0, 56, 143, 0.05)');
  const focusRing = toRgba(c.colorPrimary, 0.16, 'rgba(0, 56, 143, 0.16)');
  const accentLight = toRgba(c.colorAccent, 0.14, 'rgba(0, 159, 219, 0.14)');
  const accentTint = toRgba(c.colorAccent, 0.07, 'rgba(0, 159, 219, 0.07)');
  // Feedback-panel tints: not AT&T brand colors (success/danger are neutral-palette
  // status tokens, not derived from --primary/--accent), so opacity-based tinting here
  // isn't the "improvised brand shade" the AT&T theme rules prohibit — it only bars
  // inventing tints of the blue brand colors themselves.
  const successTint = toRgba(themeTokens.success, 0.1, 'rgba(145, 220, 0, 0.1)');
  const dangerTint = toRgba(themeTokens.danger, 0.1, 'rgba(0, 56, 143, 0.1)');
  const onPrimary = themeTokens.surface;
  const onAccent = themeTokens.surface;

  const tokensCSS = `
      --primary: ${c.colorPrimary};
      --accent: ${c.colorAccent};
      --primary-hover: ${themeTokens.primaryHover};
      --bg-body: ${bodyBg};
      --bg-card: ${cardBg};
      --text-main: ${textMain};
      --text-muted: ${textMuted};
      --border-color: ${borderColor};
      --border-radius: ${c.borderRadius}px;
      --button-radius: ${themeTokens.buttonRadius}px;
      --border-style: ${cardBorder};
      --shadow-style: ${shadowStyle};
      --font-family: '${fontStack}', sans-serif;
      --heading-font-family: '${headingFontStack}', sans-serif;
      --spacing-scale: ${spacingScale};
      --animation-speed: ${themeTokens.animationSpeed}ms;
      --primary-light: ${primaryLight};
      --primary-tint: ${primaryTint};
      --focus-ring: ${focusRing};
      --accent-light: ${accentLight};
      --accent-tint: ${accentTint};
      --success: ${themeTokens.success};
      --warning: ${themeTokens.warning};
      --danger: ${themeTokens.danger};
      --success-tint: ${successTint};
      --danger-tint: ${dangerTint};
      --on-primary: ${onPrimary};
      --on-accent: ${onAccent};
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.06);
      --component-max-width: ${COMPONENT_MAX_WIDTH}px;

      /* AT&T brand token layer (js/att-tokens.js ← design/att-tokens.css). Present in
         every artifact; not yet consumed by component CSS — the color/type/curvature
         passes wire it in. Theme tokens above stay the active layer for now. */
${ATT_TOKENS_CSS}`;

  const trackableCount = getTrackableCount(compId, c.items.length);
  const a11yScript = renderSharedA11yScript({
    instanceId,
    trackCompletion: c.trackCompletion,
    totalItems: trackableCount,
    completionMessage: serializeForInlineScript(richTextToPlain(c.completionMsg) || 'Activity complete!')
  });
  // The completion adapter (js/completion.js) is only shipped when completion tracking
  // is actually on — an author who leaves it off gets no messaging code, no 'message'
  // listener, and no notion of "completion" at all. See docs/COMPLETION-INTEGRATION.md
  // "Required vs. optional completion".
  const completionAdapterScript = c.trackCompletion
    ? renderCompletionAdapterScript({
        allowedOrigin: appState.settings?.completionParentOrigin || null
      })
    : '';
  const sharedA11yScript = `${a11yScript}\n${completionAdapterScript}`;

  return renderShell({
    instanceId,
    tokensCSS,
    fontQuery,
    customFontFaceCSS,
    componentCSS: entry.generateCSS(),
    blockLabel: sanitizeRichText(c.blockTitle || ''),
    blockHeadline: sanitizeRichText(c.blockHeadline || ''),
    blockDesc: sanitizeRichText(c.blockDesc || ''),
    blockHeadingLevel: c.blockHeadingLevel,
    componentHTML: entry.generateHTML(c, instanceId),
    completionTrackerHTML: renderCompletionTrackerHTML(instanceId, c.trackCompletion, Boolean(c.allowReset) && !SELF_RESETTING_COMPONENTS.has(compId)),
    sharedA11yScript,
    componentJS: entry.generateJS(c, instanceId),
    blockBackgroundImage: c.blockBackgroundImage,
    headerStyle: c.headerStyle || 'minimal',
    headerCyanRule: Boolean(c.headerCyanRule),
    spacingDensity: density,
    contextBandEnabled: Boolean(c.contextBandEnabled),
    contextBandText: sanitizeRichText(c.contextBandText || ''),
    contextBandAlignment: c.contextBandAlignment || 'left'
  });
}
