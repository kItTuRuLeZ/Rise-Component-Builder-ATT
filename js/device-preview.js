export const DEVICE_MODES = [
  { id: 'desktop', width: null, label: 'Desktop', ariaLabel: 'Desktop preview width' },
  // landscapeWidth is the same device turned on its side; styles.css has the matching .landscape rules.
  { id: 'tablet', width: 768, landscapeWidth: 1024, label: 'Tablet', ariaLabel: 'Tablet preview width, 768 pixels' },
  { id: 'mobile-lg', width: 430, landscapeWidth: 932, label: 'Large Mobile', ariaLabel: 'Large mobile preview width, 430 pixels' },
  { id: 'mobile', width: 375, landscapeWidth: 667, label: 'Mobile', ariaLabel: 'Mobile preview width, 375 pixels' }
];

export const DEFAULT_DEVICE_MODE = 'desktop';

export function isValidDeviceMode(id) {
  return DEVICE_MODES.some(mode => mode.id === id);
}

export function getDeviceMode(id) {
  return DEVICE_MODES.find(mode => mode.id === id) || null;
}

/**
 * The label beside the device buttons. When the preview panel is narrower than the chosen device the wrapper is clamped
 * to the panel (real layout width, never a scaled picture - docs/ARCHITECTURE.md), so a Tablet or a Landscape phone can
 * show less than its width. Say so instead of leaving the author to wonder why Landscape looks unchanged.
 * @param {string} id
 * @param {number} componentMaxWidth
 * @param {boolean} landscape
 * @param {number} actualWidth the width the preview currently renders at, in px
 * @returns {{ text: string, clamped: boolean, title: string }}
 */
export function describeDeviceWidth(id, componentMaxWidth, landscape, actualWidth) {
  const mode = getDeviceMode(id);
  const text = getDeviceWidthLabel(id, componentMaxWidth, landscape);
  if (!mode || mode.width === null) return { text, clamped: false, title: '' };
  const target = landscape && mode.landscapeWidth ? mode.landscapeWidth : mode.width;
  if (Number.isFinite(actualWidth) && actualWidth > 0 && actualWidth < target - 1) {
    const shown = Math.round(actualWidth);
    return {
      text: shown + 'px of ' + target + 'px',
      clamped: true,
      title: 'The preview panel is narrower than this ' + mode.label.toLowerCase() + ' (' + target + 'px), so the preview is cut to '
        + shown + 'px. Drag the divider or hide the editor panel to see the full width.'
    };
  }
  return { text, clamped: false, title: '' };
}

export function getDeviceWidthLabel(id, componentMaxWidth, landscape = false) {
  const mode = getDeviceMode(id);
  if (!mode) return '';
  if (mode.width === null) return `Up to ${componentMaxWidth}px`;
  return `${landscape && mode.landscapeWidth ? mode.landscapeWidth : mode.width}px`;
}
