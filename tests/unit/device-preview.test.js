import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_DEVICE_MODE, DEVICE_MODES, getDeviceMode, getDeviceWidthLabel, isValidDeviceMode
} from '../../js/device-preview.js';
import { loadPreviewDevice, savePreviewDevice, KEYS } from '../../js/storage.js';
import { memoryLocalStorage } from '../fixtures/index.js';

describe('device preview modes', () => {
  test('defines desktop, tablet, large mobile, and mobile in largest-to-smallest order', () => {
    expect(DEVICE_MODES.map(mode => mode.id)).toEqual(['desktop', 'tablet', 'mobile-lg', 'mobile']);
    expect(DEVICE_MODES.map(mode => mode.width)).toEqual([null, 768, 430, 375]);
  });

  test('default mode is desktop', () => {
    expect(DEFAULT_DEVICE_MODE).toBe('desktop');
    expect(isValidDeviceMode(DEFAULT_DEVICE_MODE)).toBe(true);
  });

  test('isValidDeviceMode rejects unknown ids', () => {
    expect(isValidDeviceMode('ultra-wide')).toBe(false);
    expect(isValidDeviceMode('')).toBe(false);
    expect(isValidDeviceMode(undefined)).toBe(false);
  });

  test('getDeviceMode resolves a known id and returns null otherwise', () => {
    expect(getDeviceMode('tablet')?.width).toBe(768);
    expect(getDeviceMode('unknown')).toBeNull();
  });

  test('getDeviceWidthLabel reports a fixed pixel width for tablet, large mobile, and mobile', () => {
    expect(getDeviceWidthLabel('tablet', 740)).toBe('768px');
    expect(getDeviceWidthLabel('mobile-lg', 740)).toBe('430px');
    expect(getDeviceWidthLabel('mobile', 740)).toBe('375px');
  });

  test('getDeviceWidthLabel reports the configured component maximum for desktop', () => {
    expect(getDeviceWidthLabel('desktop', 740)).toBe('Up to 740px');
  });

  test('getDeviceWidthLabel returns an empty string for an unknown mode', () => {
    expect(getDeviceWidthLabel('unknown', 740)).toBe('');
  });
});

describe('preview device persistence', () => {
  beforeEach(() => { globalThis.localStorage = memoryLocalStorage(); });

  test('defaults to desktop when nothing has been saved', () => {
    expect(loadPreviewDevice()).toBe('desktop');
  });

  test('round-trips a saved device mode', () => {
    savePreviewDevice('mobile');
    expect(loadPreviewDevice()).toBe('mobile');
    savePreviewDevice('mobile-lg');
    expect(loadPreviewDevice()).toBe('mobile-lg');
  });

  test('falls back to desktop for a corrupted stored value', () => {
    localStorage.setItem(KEYS.previewDevice, JSON.stringify('not-a-real-device'));
    expect(loadPreviewDevice()).toBe('desktop');
  });

  test('falls back to desktop when asked to save an invalid mode', () => {
    savePreviewDevice('ultra-wide');
    expect(loadPreviewDevice()).toBe('desktop');
  });
});

describe('landscape widths', () => {
  test('the width label reports the turned device', async () => {
    const { getDeviceWidthLabel } = await import('../../js/device-preview.js');
    expect(getDeviceWidthLabel('tablet', 740, false)).toBe('768px');
    expect(getDeviceWidthLabel('tablet', 740, true)).toBe('1024px');
    expect(getDeviceWidthLabel('mobile', 740, true)).toBe('667px');
    expect(getDeviceWidthLabel('mobile-lg', 740, true)).toBe('932px');
    expect(getDeviceWidthLabel('desktop', 740, true)).toBe('Up to 740px');
  });
});
