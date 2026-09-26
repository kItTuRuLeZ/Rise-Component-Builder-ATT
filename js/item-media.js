import { escapeAttribute, escapeHTML, sanitizeRichText } from './utilities.js';
import { isMediaReference, MEDIA_LIMITS } from './media.js';
import { createMediaUploadControl } from './media-upload.js';
import { mediaStore, peekMediaObjectURL } from './media-storage.js';

/**
 * @typedef {'none'|'image'|'audio'|'video'} ItemMediaType
 * @typedef {'upload'|'url'} ItemMediaSourceType
 * @typedef {'above'|'below'|'left'|'right'} ItemMediaPlacement
 * @typedef {'original'|'16:9'|'4:3'|'1:1'|'3:2'} ItemMediaAspectRatio
 * @typedef {'contain'|'cover'} ItemMediaFit
 * @typedef {'metadata'|'none'} ItemMediaPreload
 * 
 * @typedef {Object} ItemMediaConfig
 * @property {ItemMediaType} type
 * @property {ItemMediaSourceType} sourceType
 * @property {string} src
 * @property {string} [mediaId]
 * @property {string} [fileName]
 * @property {string} [mimeType]
 * @property {string} [alt]
 * @property {boolean} [decorative]
 * @property {string} [caption]
 * @property {string} [transcript]
 * @property {ItemMediaPlacement} [placement]
 * @property {ItemMediaAspectRatio} [aspectRatio]
 * @property {ItemMediaFit} [fit]
 * @property {string} [focalPosition]
 * @property {string} [posterSrc]
 * @property {string} [posterMediaId]
 * @property {string} [captionsSrc]
 * @property {ItemMediaPreload} [preload]
 */

/**
 * Creates a fresh default media configuration for a repeatable item.
 * @returns {ItemMediaConfig}
 */
export function createDefaultItemMedia() {
  return {
    type: 'none',
    sourceType: 'upload',
    src: '',
    mediaId: '',
    fileName: '',
    mimeType: '',
    alt: '',
    decorative: false,
    caption: '',
    transcript: '',
    placement: 'above',
    aspectRatio: 'original',
    fit: 'contain',
    focalPosition: 'center center',
    posterSrc: '',
    posterMediaId: '',
    captionsSrc: '',
    preload: 'metadata'
  };
}

export function getItemMediaType(item) {
  if (!item || typeof item !== 'object') return 'none';
  if (typeof item.media === 'string') return item.media;
  return item.media?.type || item.media?.kind || item.mediaType || 'none';
}

/**
 * Creates an empty item media config for a specific type.
 * @param {ItemMediaType} type 
 * @returns {ItemMediaConfig}
 */
export function createEmptyItemMedia(type) {
  switch (type) {
    case 'image':
      return {
        type: 'image',
        sourceType: 'upload',
        src: '',
        mediaId: '',
        fileName: '',
        mimeType: '',
        alt: '',
        decorative: false,
        caption: '',
        transcript: '',
        placement: 'above',
        aspectRatio: 'original',
        fit: 'contain',
        focalPosition: 'center center',
        posterSrc: '',
        posterMediaId: '',
        captionsSrc: '',
        preload: 'metadata'
      };
    case 'audio':
      return {
        type: 'audio',
        sourceType: 'upload',
        src: '',
        mediaId: '',
        fileName: '',
        mimeType: '',
        alt: '',
        decorative: false,
        caption: '',
        transcript: '',
        placement: 'above',
        aspectRatio: 'original',
        fit: 'contain',
        focalPosition: 'center center',
        posterSrc: '',
        posterMediaId: '',
        captionsSrc: '',
        preload: 'metadata'
      };
    case 'video':
      return {
        type: 'video',
        sourceType: 'upload',
        src: '',
        mediaId: '',
        fileName: '',
        mimeType: '',
        alt: '',
        decorative: false,
        caption: '',
        transcript: '',
        placement: 'above',
        aspectRatio: '16:9',
        fit: 'contain',
        focalPosition: 'center center',
        posterSrc: '',
        posterMediaId: '',
        captionsSrc: '',
        preload: 'metadata'
      };
    default:
      return createDefaultItemMedia();
  }
}

/**
 * Normalizes item media configuration, guaranteeing safe defaults without mutating callers.
 * @param {any} item 
 * @returns {ItemMediaConfig}
 */
export function normalizeItemMedia(item) {
  if (!item || typeof item !== 'object') return createDefaultItemMedia();
  const raw = typeof item.media === 'object' && item.media !== null
    ? item.media
    : (typeof item.media === 'string' ? { type: item.media } : {});
  const rawType = getItemMediaType(item);
  const type = ['none', 'image', 'audio', 'video'].includes(rawType) ? rawType : 'none';
  const sourceType = ['upload', 'url'].includes(raw.sourceType) ? raw.sourceType : 'upload';
  const placement = ['above', 'below', 'left', 'right'].includes(raw.placement) ? raw.placement : 'above';
  const aspectRatio = ['original', '16:9', '4:3', '1:1', '3:2'].includes(raw.aspectRatio) ? raw.aspectRatio : (type === 'video' ? '16:9' : 'original');
  const fit = ['contain', 'cover'].includes(raw.fit) ? raw.fit : 'contain';
  const preload = ['metadata', 'none'].includes(raw.preload) ? raw.preload : 'metadata';

  // Handle media reference object in src or mediaId
  let src = typeof raw.src === 'string' ? raw.src : '';
  let mediaId = typeof raw.mediaId === 'string' ? raw.mediaId : '';
  let fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  let mimeType = typeof raw.mimeType === 'string' ? raw.mimeType : '';

  if (raw.src && typeof raw.src === 'object') {
    if (typeof raw.src.mediaId === 'string') mediaId = raw.src.mediaId;
    else if (typeof raw.src.assetId === 'string') mediaId = raw.src.assetId;
    if (typeof raw.src.name === 'string') fileName = raw.src.name;
    else if (typeof raw.src.fileName === 'string') fileName = raw.src.fileName;
    if (typeof raw.src.mimeType === 'string') mimeType = raw.src.mimeType;
  }

  if (mediaId && (!src || (!src.startsWith('blob:') && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('assets/')))) {
    const runtimeUrl = peekMediaObjectURL(mediaId);
    if (runtimeUrl) {
      src = runtimeUrl;
    }
  }

  let posterSrc = typeof raw.posterSrc === 'string' ? raw.posterSrc : '';
  let posterMediaId = typeof raw.posterMediaId === 'string' ? raw.posterMediaId : '';
  if (posterMediaId && (!posterSrc || (!posterSrc.startsWith('blob:') && !posterSrc.startsWith('data:') && !posterSrc.startsWith('http') && !posterSrc.startsWith('assets/')))) {
    const runtimePoster = peekMediaObjectURL(posterMediaId);
    if (runtimePoster) posterSrc = runtimePoster;
  }

  return {
    type,
    sourceType,
    src,
    mediaId,
    fileName,
    mimeType,
    alt: typeof raw.alt === 'string' ? raw.alt : '',
    decorative: Boolean(raw.decorative),
    caption: typeof raw.caption === 'string' ? raw.caption : '',
    transcript: typeof raw.transcript === 'string' ? raw.transcript : '',
    placement,
    aspectRatio,
    fit,
    focalPosition: typeof raw.focalPosition === 'string' ? raw.focalPosition : 'center center',
    posterSrc,
    posterMediaId,
    captionsSrc: typeof raw.captionsSrc === 'string' ? raw.captionsSrc : '',
    preload
  };
}

/**
 * Checks whether an item contains an active media attachment (non-none with source).
 * @param {any} media 
 * @returns {boolean}
 */
export function isItemMediaActive(media) {
  if (!media || typeof media !== 'object') return false;
  const target = media.media && typeof media.media === 'object' ? media.media : media;
  if (!target.type || target.type === 'none') return false;
  return Boolean(target.src || target.mediaId || target.fileName);
}

/**
 * Validates item media configuration for preflight/export QA.
 * @param {ItemMediaConfig} media 
 * @param {number} [itemIndex=0] 
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateItemMedia(media, itemIndex = 0) {
  const errors = [];
  const warnings = [];
  const idxLabel = `Item ${itemIndex + 1}`;

  if (!media || media.type === 'none') {
    return { valid: true, errors, warnings };
  }

  if (!media.src && !media.mediaId) {
    errors.push(`${idxLabel}: ${media.type.toUpperCase()} media type is selected, but no media source was provided.`);
  }

  if (media.type === 'image') {
    if (!media.decorative && (!media.alt || !String(media.alt).trim())) {
      warnings.push(`${idxLabel}: Meaningful image is missing alternative text. Add descriptive alt text or mark it decorative.`);
    }
  }

  if (media.sourceType === 'url' && media.src) {
    const trimmed = String(media.src).trim();
    if (trimmed.startsWith('http://')) {
      warnings.push(`${idxLabel}: Insecure HTTP media URL detected (${trimmed}). HTTPS is strongly recommended for LMS and Rise 360 compatibility.`);
    }

    if (media.type === 'video' && !trimmed.match(/\.(mp4|webm|ogv)(\?.*)?$/i) && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
      warnings.push(`${idxLabel}: "${trimmed}" does not appear to be a direct video file (MP4/WebM). Generic streaming webpages may not play inside Rise 360.`);
    }

    if (media.type === 'audio' && !trimmed.match(/\.(mp3|wav|ogg|m4a)(\?.*)?$/i) && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
      warnings.push(`${idxLabel}: "${trimmed}" does not appear to be a direct audio file (MP3/WAV/OGG).`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Creates the reusable DOM editor control for item media attachments.
 * @param {Object} options
 * @param {any} options.item - Item object from the parent component config
 * @param {number} options.index - 0-indexed position
 * @param {() => void} options.onChange - Triggered when any media field updates
 * @param {any} [options.limits] - Custom media size limits
 * @param {any} [options.store] - IndexedDB media store instance
 * @param {string} [options.itemLabel] - Accessible human-readable label of the item
 * @returns {HTMLElement}
 */
export function createItemMediaControl({ item, index, onChange, limits = MEDIA_LIMITS, store = mediaStore, itemLabel = '', allowedTypes = null }) {
  const currentType = getItemMediaType(item);
  if (!item.media || typeof item.media !== 'object') {
    item.media = currentType !== 'none' ? { ...createEmptyItemMedia(currentType), type: currentType } : createDefaultItemMedia();
  } else {
    item.media = { ...createDefaultItemMedia(), ...item.media };
  }

  const media = item.media;
  const contextLabel = itemLabel || item.title || `Item ${index + 1}`;
  const container = document.createElement('div');
  container.className = 'item-media-attachment-container item-media-section';

  const shell = document.createElement('div');
  shell.className = 'item-media-details-shell';

  const header = document.createElement('div');
  header.className = 'item-media-summary-header';
  const summaryTitle = document.createElement('span');
  summaryTitle.className = 'item-media-summary-title';
  summaryTitle.textContent = 'Media — Optional';
  const summaryBadge = document.createElement('span');
  summaryBadge.className = 'item-media-type-badge';
  summaryBadge.textContent = media.type === 'none' ? 'None' : media.type.toUpperCase();
  header.append(summaryTitle, summaryBadge);
  shell.appendChild(header);

  const body = document.createElement('div');
  body.className = 'item-media-editor-body';

  // 1. Media Type Selector
  const typeWrapper = document.createElement('div');
  typeWrapper.className = 'input-wrapper item-media-type-wrapper';
  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Media Type';
  const typeId = `item-media-type-${index}-${Math.random().toString(36).slice(2, 7)}`;
  typeLabel.htmlFor = typeId;

  const typeSelect = document.createElement('select');
  typeSelect.id = typeId;
  typeSelect.className = 'item-media-type-select';
  typeSelect.setAttribute('aria-label', `Media Type for ${contextLabel}`);
  [
    { value: 'none', label: 'None (Text Only)' },
    { value: 'image', label: 'Image (JPG, PNG, WebP, SVG, GIF)' },
    { value: 'audio', label: 'Audio (MP3, WAV, OGG, M4A)' },
    { value: 'video', label: 'Video (MP4, WebM)' }
  ].filter(opt => !Array.isArray(allowedTypes) || opt.value === 'none' || allowedTypes.includes(opt.value)).forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    if (media.type === opt.value) el.selected = true;
    typeSelect.appendChild(el);
  });

  typeWrapper.append(typeLabel, typeSelect);
  body.appendChild(typeWrapper);

  // Sub-controls container (re-rendered based on selected type)
  const subControls = document.createElement('div');
  subControls.className = 'item-media-subcontrols';
  body.appendChild(subControls);

  function renderSubControls() {
    subControls.innerHTML = '';
    const activeType = getItemMediaType(item);
    summaryBadge.textContent = activeType === 'none' ? 'None' : activeType.toUpperCase();

    if (activeType === 'none') {
      return;
    }

    const typeCap = activeType.charAt(0).toUpperCase() + activeType.slice(1);
    const itemMediaLabel = `${contextLabel} ${typeCap}`;

    // 2. Upload / URL Source Control
    const uploadField = {
      id: `media-source-${index}`,
      type: activeType,
      label: `${typeCap} File`,
      uploadKind: activeType,
      contextLabel: itemMediaLabel,
      preferredDimensions: activeType === 'image' ? '1200 × 800 px or responsive' : undefined
    };

    const uploadControl = createMediaUploadControl({
      field: uploadField,
      controlId: `item-media-file-${index}`,
      value: media.mediaId ? { mediaId: media.mediaId, assetId: media.mediaId, source: 'upload', sourceType: 'library', kind: media.type, mediaType: media.type, name: media.fileName, fileName: media.fileName, mimeType: media.mimeType } : media.src,
      limits,
      store,
      contextLabel: itemMediaLabel,
      onChange: value => {
        if (isMediaReference(value)) {
          media.sourceType = 'upload';
          media.mediaId = value.mediaId || value.assetId;
          media.fileName = value.name || value.fileName || '';
          media.mimeType = value.mimeType || '';
          media.src = value;
        } else if (typeof value === 'string') {
          media.sourceType = 'url';
          media.src = value;
          media.mediaId = '';
          media.fileName = '';
        } else {
          media.src = '';
          media.mediaId = '';
          media.fileName = '';
        }
        onChange();
      }
    });

    subControls.appendChild(uploadControl.element);

    // 3. Image Specific Fields
    if (media.type === 'image') {
      // Alt text & Decorative checkbox
      const altWrapper = document.createElement('div');
      altWrapper.className = 'input-wrapper';
      const altLabel = document.createElement('label');
      altLabel.textContent = 'Image Alternative Text';
      const altId = `item-media-alt-${index}`;
      altLabel.htmlFor = altId;
      const altInput = document.createElement('textarea');
      altInput.id = altId;
      altInput.rows = 2;
      altInput.placeholder = 'Describe the image content and purpose for screen reader users';
      altInput.value = media.alt || '';
      altInput.disabled = Boolean(media.decorative);
      altInput.setAttribute('aria-label', `Image Alternative Text for ${contextLabel}`);

      const decorWrapper = document.createElement('div');
      decorWrapper.className = 'checkbox-wrapper';
      const decorInput = document.createElement('input');
      decorInput.type = 'checkbox';
      decorInput.id = `item-media-decor-${index}`;
      decorInput.checked = Boolean(media.decorative);
      decorInput.setAttribute('aria-label', `Decorative image (empty alt text) for ${contextLabel}`);
      const decorLabel = document.createElement('label');
      decorLabel.htmlFor = decorInput.id;
      decorLabel.textContent = 'Decorative image (empty alt text)';

      decorInput.addEventListener('change', () => {
        media.decorative = decorInput.checked;
        altInput.disabled = decorInput.checked;
        if (decorInput.checked) altInput.value = '';
        media.alt = altInput.value;
        onChange();
      });

      altInput.addEventListener('input', () => {
        media.alt = altInput.value;
        onChange();
      });

      decorWrapper.append(decorInput, decorLabel);
      altWrapper.append(altLabel, altInput, decorWrapper);
      subControls.appendChild(altWrapper);

      // Caption
      const captionWrapper = document.createElement('div');
      captionWrapper.className = 'input-wrapper';
      const captionLabel = document.createElement('label');
      captionLabel.textContent = 'Image Caption (Optional)';
      const captionInput = document.createElement('input');
      captionInput.type = 'text';
      captionInput.placeholder = 'Optional visible caption below image';
      captionInput.value = media.caption || '';
      captionInput.setAttribute('aria-label', `Image Caption for ${contextLabel}`);
      captionInput.addEventListener('input', () => {
        media.caption = captionInput.value;
        onChange();
      });
      captionWrapper.append(captionLabel, captionInput);
      subControls.appendChild(captionWrapper);

      // Placement & Aspect Ratio & Fit Grid
      const layoutRow = document.createElement('div');
      layoutRow.className = 'item-media-layout-grid';

      // Placement
      const placementWrapper = document.createElement('div');
      placementWrapper.className = 'input-wrapper';
      const placementLabel = document.createElement('label');
      placementLabel.textContent = 'Placement';
      const placementSelect = document.createElement('select');
      placementSelect.setAttribute('aria-label', `Image Placement for ${contextLabel}`);
      [
        { value: 'above', label: 'Above text (Full width)' },
        { value: 'below', label: 'Below text (Full width)' },
        { value: 'left', label: 'Left of text (Side-by-side)' },
        { value: 'right', label: 'Right of text (Side-by-side)' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.placement === opt.value) el.selected = true;
        placementSelect.appendChild(el);
      });
      placementSelect.addEventListener('change', () => {
        media.placement = placementSelect.value;
        onChange();
      });
      placementWrapper.append(placementLabel, placementSelect);

      // Aspect Ratio
      const ratioWrapper = document.createElement('div');
      ratioWrapper.className = 'input-wrapper';
      const ratioLabel = document.createElement('label');
      ratioLabel.textContent = 'Aspect Ratio';
      const ratioSelect = document.createElement('select');
      ratioSelect.setAttribute('aria-label', `Image Aspect Ratio for ${contextLabel}`);
      [
        { value: 'original', label: 'Original' },
        { value: '16:9', label: '16:9 Landscape' },
        { value: '4:3', label: '4:3 Standard' },
        { value: '1:1', label: '1:1 Square' },
        { value: '3:2', label: '3:2 Classic' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.aspectRatio === opt.value) el.selected = true;
        ratioSelect.appendChild(el);
      });
      ratioSelect.addEventListener('change', () => {
        media.aspectRatio = ratioSelect.value;
        onChange();
      });
      ratioWrapper.append(ratioLabel, ratioSelect);

      // Fit
      const fitWrapper = document.createElement('div');
      fitWrapper.className = 'input-wrapper';
      const fitLabel = document.createElement('label');
      fitLabel.textContent = 'Image Fit';
      const fitSelect = document.createElement('select');
      fitSelect.setAttribute('aria-label', `Image Fit for ${contextLabel}`);
      [
        { value: 'contain', label: 'Contain (Show complete image)' },
        { value: 'cover', label: 'Cover (Fill area)' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.fit === opt.value) el.selected = true;
        fitSelect.appendChild(el);
      });
      fitSelect.addEventListener('change', () => {
        media.fit = fitSelect.value;
        onChange();
      });
      fitWrapper.append(fitLabel, fitSelect);

      layoutRow.append(placementWrapper, ratioWrapper, fitWrapper);
      subControls.appendChild(layoutRow);
    }

    // 4. Audio Specific Fields
    if (media.type === 'audio') {
      const audioRow = document.createElement('div');
      audioRow.className = 'item-media-layout-grid';

      // Placement (above/below)
      const placementWrapper = document.createElement('div');
      placementWrapper.className = 'input-wrapper';
      const placementLabel = document.createElement('label');
      placementLabel.textContent = 'Audio Placement';
      const placementSelect = document.createElement('select');
      placementSelect.setAttribute('aria-label', `Audio Placement for ${contextLabel}`);
      [
        { value: 'above', label: 'Above text' },
        { value: 'below', label: 'Below text' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.placement === opt.value) el.selected = true;
        placementSelect.appendChild(el);
      });
      placementSelect.addEventListener('change', () => {
        media.placement = placementSelect.value;
        onChange();
      });
      placementWrapper.append(placementLabel, placementSelect);

      // Preload
      const preloadWrapper = document.createElement('div');
      preloadWrapper.className = 'input-wrapper';
      const preloadLabel = document.createElement('label');
      preloadLabel.textContent = 'Preload';
      const preloadSelect = document.createElement('select');
      preloadSelect.setAttribute('aria-label', `Audio Preload for ${contextLabel}`);
      [
        { value: 'metadata', label: 'Metadata (Recommended)' },
        { value: 'none', label: 'None (Load only on play)' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.preload === opt.value) el.selected = true;
        preloadSelect.appendChild(el);
      });
      preloadSelect.addEventListener('change', () => {
        media.preload = preloadSelect.value;
        onChange();
      });
      preloadWrapper.append(preloadLabel, preloadSelect);

      audioRow.append(placementWrapper, preloadWrapper);
      subControls.appendChild(audioRow);

      // Caption / Label
      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'input-wrapper';
      const labelLabel = document.createElement('label');
      labelLabel.textContent = 'Audio Label / Title (Optional)';
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'e.g. Executive Interview Audio Snippet';
      labelInput.value = media.caption || '';
      labelInput.setAttribute('aria-label', `Audio Label for ${contextLabel}`);
      labelInput.addEventListener('input', () => {
        media.caption = labelInput.value;
        onChange();
      });
      labelWrapper.append(labelLabel, labelInput);
      subControls.appendChild(labelWrapper);

      // Transcript
      const transcriptWrapper = document.createElement('div');
      transcriptWrapper.className = 'input-wrapper';
      const transcriptLabel = document.createElement('label');
      transcriptLabel.textContent = 'Audio Transcript (Optional)';
      const transcriptInput = document.createElement('textarea');
      transcriptInput.rows = 3;
      transcriptInput.placeholder = 'Add full text transcript for accessibility';
      transcriptInput.value = media.transcript || '';
      transcriptInput.setAttribute('aria-label', `Audio Transcript for ${contextLabel}`);
      transcriptInput.addEventListener('input', () => {
        media.transcript = transcriptInput.value;
        onChange();
      });
      transcriptWrapper.append(transcriptLabel, transcriptInput);
      subControls.appendChild(transcriptWrapper);
    }

    // 5. Video Specific Fields
    if (media.type === 'video') {
      const videoRow = document.createElement('div');
      videoRow.className = 'item-media-layout-grid';

      // Placement
      const placementWrapper = document.createElement('div');
      placementWrapper.className = 'input-wrapper';
      const placementLabel = document.createElement('label');
      placementLabel.textContent = 'Video Placement';
      const placementSelect = document.createElement('select');
      placementSelect.setAttribute('aria-label', `Video Placement for ${contextLabel}`);
      [
        { value: 'above', label: 'Above text (Full width)' },
        { value: 'below', label: 'Below text (Full width)' },
        { value: 'left', label: 'Left of text (Side-by-side)' },
        { value: 'right', label: 'Right of text (Side-by-side)' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.placement === opt.value) el.selected = true;
        placementSelect.appendChild(el);
      });
      placementSelect.addEventListener('change', () => {
        media.placement = placementSelect.value;
        onChange();
      });
      placementWrapper.append(placementLabel, placementSelect);

      // Aspect Ratio
      const ratioWrapper = document.createElement('div');
      ratioWrapper.className = 'input-wrapper';
      const ratioLabel = document.createElement('label');
      ratioLabel.textContent = 'Aspect Ratio';
      const ratioSelect = document.createElement('select');
      ratioSelect.setAttribute('aria-label', `Video Aspect Ratio for ${contextLabel}`);
      [
        { value: '16:9', label: '16:9 Widescreen' },
        { value: '4:3', label: '4:3 Standard' },
        { value: 'original', label: 'Original' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.aspectRatio === opt.value) el.selected = true;
        ratioSelect.appendChild(el);
      });
      ratioSelect.addEventListener('change', () => {
        media.aspectRatio = ratioSelect.value;
        onChange();
      });
      ratioWrapper.append(ratioLabel, ratioSelect);

      // Preload
      const preloadWrapper = document.createElement('div');
      preloadWrapper.className = 'input-wrapper';
      const preloadLabel = document.createElement('label');
      preloadLabel.textContent = 'Preload';
      const preloadSelect = document.createElement('select');
      preloadSelect.setAttribute('aria-label', `Video Preload for ${contextLabel}`);
      [
        { value: 'metadata', label: 'Metadata (Recommended)' },
        { value: 'none', label: 'None (Load only on play)' }
      ].forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (media.preload === opt.value) el.selected = true;
        preloadSelect.appendChild(el);
      });
      preloadSelect.addEventListener('change', () => {
        media.preload = preloadSelect.value;
        onChange();
      });
      preloadWrapper.append(preloadLabel, preloadSelect);

      videoRow.append(placementWrapper, ratioWrapper, preloadWrapper);
      subControls.appendChild(videoRow);

      // Poster Image Control
      const posterField = {
        id: `item-media-poster-${index}`,
        type: 'image',
        label: 'Video Poster Image (Optional)',
        uploadKind: 'image',
        contextLabel: `${contextLabel} Video Poster`,
        preferredDimensions: '1200 × 675 px (16:9)'
      };
      const posterUploadControl = createMediaUploadControl({
        field: posterField,
        controlId: `item-media-poster-${index}`,
        value: media.posterMediaId ? { mediaId: media.posterMediaId, assetId: media.posterMediaId, source: 'upload', sourceType: 'library', kind: 'image', mediaType: 'image' } : media.posterSrc,
        limits,
        store,
        contextLabel: `${contextLabel} Video Poster`,
        onChange: val => {
          if (isMediaReference(val)) {
            media.posterMediaId = val.mediaId || val.assetId;
            media.posterSrc = val;
          } else if (typeof val === 'string') {
            media.posterMediaId = '';
            media.posterSrc = val;
          } else {
            media.posterMediaId = '';
            media.posterSrc = '';
          }
          onChange();
        }
      });
      subControls.appendChild(posterUploadControl.element);

      // Captions Control
      const captionsField = {
        id: `item-media-captions-${index}`,
        type: 'captions',
        label: 'WebVTT Captions Track URL or File (Optional)',
        uploadKind: 'captions',
        contextLabel: `${contextLabel} Video Captions`
      };
      const captionsUploadControl = createMediaUploadControl({
        field: captionsField,
        controlId: `item-media-captions-${index}`,
        value: media.captionsSrc || '',
        limits,
        store,
        contextLabel: `${contextLabel} Video Captions`,
        onChange: val => {
          media.captionsSrc = typeof val === 'string' ? val : (val?.name || '');
          onChange();
        }
      });
      subControls.appendChild(captionsUploadControl.element);

      // Transcript
      const transcriptWrapper = document.createElement('div');
      transcriptWrapper.className = 'input-wrapper';
      const transcriptLabel = document.createElement('label');
      transcriptLabel.textContent = 'Video Transcript (Optional)';
      const transcriptInput = document.createElement('textarea');
      transcriptInput.rows = 3;
      transcriptInput.placeholder = 'Add full text transcript for accessibility';
      transcriptInput.value = media.transcript || '';
      transcriptInput.setAttribute('aria-label', `Video Transcript for ${contextLabel}`);
      transcriptInput.addEventListener('input', () => {
        media.transcript = transcriptInput.value;
        onChange();
      });
      transcriptWrapper.append(transcriptLabel, transcriptInput);
      subControls.appendChild(transcriptWrapper);
    }
  }

  typeSelect.addEventListener('change', () => {
    const newType = /** @type {ItemMediaType} */ (typeSelect.value);
    if (newType === 'none') {
      Object.assign(item.media, createDefaultItemMedia());
      item.media.type = 'none';
    } else {
      const defaults = createEmptyItemMedia(newType);
      Object.assign(item.media, defaults);
      item.media.type = newType;
      if (newType === 'image') {
        if (!item.media.placement) item.media.placement = 'above';
        if (!item.media.aspectRatio) item.media.aspectRatio = 'original';
        if (!item.media.fit) item.media.fit = 'contain';
        if (item.media.decorative === undefined) item.media.decorative = false;
        if (!item.media.alt) item.media.alt = '';
      } else if (newType === 'audio') {
        if (!item.media.placement) item.media.placement = 'above';
        if (!item.media.preload) item.media.preload = 'metadata';
        if (!item.media.transcript) item.media.transcript = '';
      } else if (newType === 'video') {
        if (!item.media.placement) item.media.placement = 'above';
        if (!item.media.aspectRatio || item.media.aspectRatio === 'original') item.media.aspectRatio = '16:9';
        if (!item.media.preload) item.media.preload = 'metadata';
        if (!item.media.transcript) item.media.transcript = '';
      }
    }
    renderSubControls();
    onChange();
  });

  renderSubControls();
  shell.appendChild(body);
  container.appendChild(shell);
  return container;
}

/**
 * Generates semantic HTML for an item's media element (image/audio/video/transcript).
 * @param {ItemMediaConfig} media
 * @param {string} instanceId
 * @param {number} itemIndex
 * @returns {string}
 */
export function renderItemMediaElement(media, instanceId, itemIndex) {
  if (!isItemMediaActive(media)) return '';

  const normalized = normalizeItemMedia({ media });
  let resolvedSrc = '';
  if (normalized.src && typeof normalized.src === 'string' && (normalized.src.startsWith('blob:') || normalized.src.startsWith('data:') || normalized.src.startsWith('assets/') || normalized.src.startsWith('http://') || normalized.src.startsWith('https://') || normalized.src.startsWith('/') || normalized.src.startsWith('./'))) {
    resolvedSrc = normalized.src;
  } else if (normalized.mediaId) {
    resolvedSrc = peekMediaObjectURL(normalized.mediaId) || (typeof normalized.src === 'string' ? normalized.src : '') || normalized.fileName || '';
  } else {
    resolvedSrc = (typeof normalized.src === 'string' ? normalized.src : '') || normalized.fileName || '';
  }
  const src = escapeAttribute(resolvedSrc);
  const alt = normalized.decorative ? '' : escapeAttribute(normalized.alt || 'Item illustration');
  const placement = normalized.placement;
  const ratio = normalized.aspectRatio;
  const fit = normalized.fit;
  const preload = normalized.preload;
  const idPrefix = `${instanceId}-item-${itemIndex}-media`;

  let mediaMarkup = '';

  if (normalized.type === 'image') {
    mediaMarkup = `
      <figure class="item-media-figure item-media-aspect-${ratio.replace(':', '-')}" style="--item-media-fit: ${fit};">
        <img src="${src}" alt="${alt}" class="item-media-img" loading="lazy" />
        ${normalized.caption ? `<figcaption class="item-media-caption">${escapeHTML(normalized.caption)}</figcaption>` : ''}
      </figure>
    `;
  } else if (normalized.type === 'audio') {
    mediaMarkup = `
      <div class="item-media-audio-shell">
        ${normalized.caption ? `<div class="item-media-audio-label">${escapeHTML(normalized.caption)}</div>` : ''}
        <audio class="item-media-audio-player" controls preload="${preload}">
          <source src="${src}" ${normalized.mimeType ? `type="${escapeAttribute(normalized.mimeType)}"` : ''}>
          Your browser does not support this audio format.
        </audio>
        ${normalized.transcript ? `
          <details class="item-media-transcript-drawer">
            <summary class="item-media-transcript-toggle">Audio Transcript</summary>
            <div class="item-media-transcript-body">${sanitizeRichText(normalized.transcript)}</div>
          </details>
        ` : ''}
      </div>
    `;
  } else if (normalized.type === 'video') {
    const poster = normalized.posterSrc ? ` poster="${escapeAttribute(normalized.posterSrc)}"` : '';
    const captions = normalized.captionsSrc ? `<track src="${escapeAttribute(normalized.captionsSrc)}" kind="captions" srclang="en" label="English">` : '';

    mediaMarkup = `
      <div class="item-media-video-shell item-media-aspect-${ratio.replace(':', '-')}">
        <video class="item-media-video-player" controls preload="${preload}"${poster}>
          <source src="${src}" ${normalized.mimeType ? `type="${escapeAttribute(normalized.mimeType)}"` : ''}>
          ${captions}
          Your browser does not support this video format.
        </video>
        ${normalized.transcript ? `
          <details class="item-media-transcript-drawer">
            <summary class="item-media-transcript-toggle">Video Transcript</summary>
            <div class="item-media-transcript-body">${sanitizeRichText(normalized.transcript)}</div>
          </details>
        ` : ''}
      </div>
    `;
  }

  return `<div class="item-media-slot item-media-type-${normalized.type} item-media-align-${placement}" id="${idPrefix}">${mediaMarkup}</div>`;
}

/**
 * Wraps content body and media into a responsive layout (above, below, left, right).
 * @param {ItemMediaConfig} media
 * @param {string} contentHTML
 * @param {string} instanceId
 * @param {number} itemIndex
 * @returns {string}
 */
export function wrapItemMediaContent(media, contentHTML, instanceId = 'comp', itemIndex = 0) {
  if (!isItemMediaActive(media)) {
    return contentHTML;
  }

  const targetMedia = media && typeof media === 'object' && 'media' in media ? media.media : media;
  const normalized = normalizeItemMedia({ media: targetMedia });
  const mediaHTML = renderItemMediaElement(normalized, instanceId, itemIndex);
  const placement = normalized.placement;

  if (placement === 'above') {
    return `<div class="item-content-layout layout-media-above">${mediaHTML}<div class="item-text-slot">${contentHTML}</div></div>`;
  }
  if (placement === 'below') {
    return `<div class="item-content-layout layout-media-below"><div class="item-text-slot">${contentHTML}</div>${mediaHTML}</div>`;
  }
  if (placement === 'left') {
    return `<div class="item-content-layout layout-media-left">${mediaHTML}<div class="item-text-slot">${contentHTML}</div></div>`;
  }
  if (placement === 'right') {
    return `<div class="item-content-layout layout-media-right"><div class="item-text-slot">${contentHTML}</div>${mediaHTML}</div>`;
  }

  return `<div class="item-content-layout layout-media-above">${mediaHTML}<div class="item-text-slot">${contentHTML}</div></div>`;
}

/**
 * Returns shared CSS rules for item media attachments.
 * @returns {string}
 */
export function getItemMediaCSS() {
  return `
    .item-content-layout {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-4, 18px);
      width: 100%;
    }

    .item-content-layout.layout-media-above .item-media-slot,
    .item-content-layout.layout-media-below .item-media-slot {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
    }

    .item-content-layout.layout-media-left {
      display: grid;
      grid-template-columns: minmax(260px, 45%) minmax(0, 1fr);
      align-items: center;
      gap: var(--att-space-5, 24px);
      width: 100%;
    }

    .item-content-layout.layout-media-right {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 45%);
      align-items: center;
      gap: var(--att-space-5, 24px);
      width: 100%;
    }

    .item-media-slot {
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .item-media-figure {
      margin: 0 auto;
      padding: 0;
      width: 100%;
      border-radius: var(--att-radius-md, 8px);
      overflow: hidden;
      background-color: rgba(0, 0, 0, 0.03);
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .item-media-img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: 100%;
      object-fit: var(--item-media-fit, contain);
      object-position: center center;
    }

    .item-media-aspect-16-9 {
      aspect-ratio: 16 / 9;
    }
    .item-media-aspect-4-3 {
      aspect-ratio: 4 / 3;
    }
    .item-media-aspect-1-1 {
      aspect-ratio: 1 / 1;
    }
    .item-media-aspect-3-2 {
      aspect-ratio: 3 / 2;
    }
    .item-media-aspect-original {
      aspect-ratio: auto;
      height: auto;
    }
    .item-media-aspect-original .item-media-img {
      width: 100%;
      height: auto;
      max-height: 560px;
      object-fit: var(--item-media-fit, contain);
    }

    .item-media-caption {
      font-size: 11px;
      color: var(--text-muted, #666);
      padding: 6px 8px;
      line-height: 1.35;
      text-align: center;
      background-color: rgba(0, 0, 0, 0.02);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
    }

    .item-media-audio-shell {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .item-media-audio-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main, #111);
    }

    .item-media-audio-player {
      width: 100%;
      height: 40px;
      border-radius: 8px;
    }

    .item-media-video-shell {
      width: 100%;
      border-radius: var(--att-radius-md, 8px);
      overflow: hidden;
      background-color: #000;
      display: flex;
      flex-direction: column;
    }

    .item-media-video-player {
      width: 100%;
      max-height: 480px;
      display: block;
    }

    .item-media-transcript-drawer {
      margin-top: 6px;
      padding: 6px 10px;
      background-color: var(--bg-app, rgba(0, 0, 0, 0.03));
      border: 1px solid var(--border-color, #E5E7EB);
      border-radius: 6px;
      font-size: 12px;
    }

    .item-media-transcript-toggle {
      cursor: pointer;
      font-weight: 600;
      color: var(--primary, #0057B8);
      user-select: none;
    }

    .item-media-transcript-body {
      margin-top: 8px;
      line-height: 1.45;
      color: var(--text-main, #333);
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
    }

    @media (max-width: 640px) {
      .item-content-layout.layout-media-left,
      .item-content-layout.layout-media-right {
        display: flex;
        flex-direction: column;
      }
      .item-content-layout.layout-media-right .item-media-slot {
        order: -1;
      }
    }
  `;
}
