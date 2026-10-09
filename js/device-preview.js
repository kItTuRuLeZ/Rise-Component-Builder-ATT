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

export function getDeviceWidthLabel(id, componentMaxWidth, landscape = false) {
  const mode = getDeviceMode(id);
  if (!mode) return '';
  if (mode.width === null) return `Up to ${componentMaxWidth}px`;
  return `${landscape && mode.landscapeWidth ? mode.landscapeWidth : mode.width}px`;
}
