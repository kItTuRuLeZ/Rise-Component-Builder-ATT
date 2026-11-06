import { escapeAttribute, escapeHTML, escapeSrcdoc, generateHtmlFragment, registerLocalBlobURL, revokeLocalBlobURL, slugify } from './utilities.js';
import { blobToDataURL, isMediaReference, sanitizeAssetFilename, SMALL_IMAGE_INLINE_LIMIT } from './media.js';
import { getMediaRecord, mediaStore } from './media-storage.js';
import { createZip } from './zip.js';

// Many LMS hosts cap an uploaded course/package's size somewhere in this neighborhood —
// this is advisory, not enforced: the ZIP is still produced, the author is just told.
const LARGE_ZIP_WARNING_BYTES = 50 * 1024 * 1024;

// P04 (2026-08-14): a practical usability threshold, not a documented Rise limit — this
// project has no evidence Rise's own "Add code" editor enforces any specific paste-size
// cap, so the warning below is careful to say "can be slow to work with," never "Rise
// rejects this." Picked from general code-editor/textarea UX experience: pasting and
// scrolling through a plain-text block much past ~200 KB gets noticeably sluggish in most
// browsers' contenteditable/textarea implementations, independent of Rise specifically.
export const LARGE_PASTE_WARNING_BYTES = 200 * 1024;

/** Byte size of the compiled export (UTF-8), for display before download. */
export function getExportedFileSize(html) {
  return new Blob([html]).size;
}

export function formatExportedFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Returns a warning message string when `bytes` exceeds the practical paste-size
 * threshold, or null when it doesn't need one. Kept as a pure function (no DOM) so it's
 * directly unit-testable and reusable across every export format's size check.
 */
export function buildLargePasteWarning(bytes) {
  if (!Number.isFinite(bytes) || bytes <= LARGE_PASTE_WARNING_BYTES) return null;
  return `This code is large (${formatExportedFileSize(bytes)}). Pasting very large blocks into Rise's code editor can be slow to work with. If this component includes uploaded audio, video, or a large image, consider Web Package ZIP instead.`;
}

export function buildRiseEmbedSnippet(options = {}) {
  const src = options.url || 'https://your-server.com/path-to-component/index.html';
  const title = options.title || 'AT&T Interactive Block';
  const height = options.height || '560px';
  return `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" width="100%" height="${height}" style="border:none; border-radius:12px; width:100%; min-height:${height};" allow="autoplay" allowfullscreen sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-same-origin"></iframe>`;
}

export function buildExportPayload(fullHtml, options = {}) {
  return {
    iframe: `<iframe srcdoc="${escapeSrcdoc(fullHtml)}" width="100%" height="500px" style="border:none;" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>`,
    fragment: generateHtmlFragment(fullHtml),
    manifest: Array.isArray(options.manifest) ? options.manifest : [],
    warnings: Array.isArray(options.warnings) ? options.warnings : []
  };
}

/**
 * @param {object} config
 * @param {{ store?: any, inlineImageLimit?: number, mode?: 'inline'|'package' }} options
 */
export async function prepareMediaExport(config, options = {}) {
  const store = options.store || mediaStore;
  const mode = options.mode === 'package' ? 'package' : 'inline';
  const inlineImageLimit = options.inlineImageLimit ?? SMALL_IMAGE_INLINE_LIMIT;
  const manifest = [];
  const assets = [];
  const warnings = [];
  const missing = [];
  const filenames = new Set();
  const resolvedMedia = new Map();

  const uniqueFilename = name => {
    const safe = sanitizeAssetFilename(name, 'asset');
    if (!filenames.has(safe)) { filenames.add(safe); return safe; }
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const extension = dot > 0 ? safe.slice(dot) : '';
    let counter = 2;
    while (filenames.has(`${stem}-${counter}${extension}`)) counter += 1;
    const unique = `${stem}-${counter}${extension}`;
    filenames.add(unique);
    return unique;
  };

  async function resolveMediaId(id, fallbackName = '') {
    if (!id || typeof id !== 'string' || !id.trim()) return '';
    if (resolvedMedia.has(id)) return resolvedMedia.get(id);
    const record = await getMediaRecord(id, store);
    if (!record?.blob) {
      const assetName = fallbackName || id;
      warnings.push(`Uploaded media “${assetName}” is missing from local storage and cannot be exported.`);
      missing.push(assetName);
      return '';
    }
    const filename = uniqueFilename(record.sanitizedName || record.name);
    const relativePath = `assets/${filename}`;
    const manifestEntry = { filename, sourceMediaId: record.id, mimeType: record.mimeType, relativePath };
    manifest.push(manifestEntry);
    assets.push({ ...manifestEntry, blob: record.blob });
    const canInline = mode === 'inline' && record.kind === 'image' && record.mimeType !== 'image/svg+xml' && record.size <= inlineImageLimit;
    if (canInline) {
      const dataUrl = await blobToDataURL(record.blob);
      resolvedMedia.set(id, dataUrl);
      return dataUrl;
    }
    if (mode === 'inline') {
      warnings.push(`“${record.name}” requires an external asset file at ${relativePath}; it cannot be safely included in a single HTML file.`);
    }
    resolvedMedia.set(id, relativePath);
    return relativePath;
  }

  const transform = async value => {
    if (!value) return value;
    if (isMediaReference(value)) {
      const id = value.mediaId || value.assetId;
      return resolveMediaId(id, value.name || value.fileName || id);
    }
    if (Array.isArray(value)) return Promise.all(value.map(transform));
    if (typeof value === 'object') {
      // 1. Handle item-media attachments (Accordion, Tabs, Flip Cards, Timeline, Process Flow)
      const isItemMedia = value.placement !== undefined || (value.type && ['image', 'audio', 'video', 'none'].includes(value.type) && (value.mediaId || value.src !== undefined || value.alt !== undefined || value.caption !== undefined));
      if (isItemMedia) {
        const mediaId = value.mediaId || (value.src && typeof value.src === 'object' ? (value.src.mediaId || value.src.assetId) : '');
        let resolvedSrc = value.src;
        if (mediaId) {
          resolvedSrc = await resolveMediaId(mediaId, value.fileName || value.name || mediaId);
        } else if (isMediaReference(value.src)) {
          resolvedSrc = await transform(value.src);
        }
        const posterMediaId = value.posterMediaId || (value.posterSrc && typeof value.posterSrc === 'object' ? (value.posterSrc.mediaId || value.posterSrc.assetId) : '');
        let resolvedPoster = value.posterSrc;
        if (posterMediaId) {
          resolvedPoster = await resolveMediaId(posterMediaId, 'poster');
        } else if (isMediaReference(value.posterSrc)) {
          resolvedPoster = await transform(value.posterSrc);
        }
        return {
          ...value,
          src: resolvedSrc || '',
          posterSrc: resolvedPoster || ''
        };
      }

      // 2. Handle Hotspots audio attachments
      if (value.audioMediaId && typeof value.audioMediaId === 'string') {
        const resolvedAudio = await resolveMediaId(value.audioMediaId, 'audio');
        const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await transform(v)]));
        const res = Object.fromEntries(entries);
        res.audioUrl = resolvedAudio || res.audioUrl || '';
        return res;
      }

      // 3. Handle standalone object with mediaId
      if (value.mediaId || value.assetId) {
        const id = value.mediaId || value.assetId;
        const resolved = await resolveMediaId(id, value.name || value.fileName || id);
        if (typeof value.src !== 'undefined') {
          const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await transform(v)]));
          const res = Object.fromEntries(entries);
          res.src = resolved || res.src || '';
          return res;
        }
      }

      const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await transform(entry)]));
      return Object.fromEntries(entries);
    }
    return value;
  };

  return { config: await transform(config), manifest, assets, warnings, missing };
}

export const transformMediaReferences = prepareMediaExport;

/**
 * Packages a compiled export into a real, standalone ZIP: `index.html` at the ZIP root.
 *
 * @param {{ html: string, assets: { relativePath: string, blob: Blob }[], manifest: any[], includeManifest?: boolean }} bundle
 * @returns {Promise<{ blob: Blob, size: number, warnings: string[] }>}
 */
export async function buildRiseProjectZip({ html, assets, manifest, includeManifest = true }) {
  /** @type {{ path: string, data: string|ArrayBuffer }[]} */
  const entries = [{ path: 'index.html', data: html }];
  for (const asset of assets) {
    entries.push({ path: asset.relativePath, data: await asset.blob.arrayBuffer() });
  }
  if (includeManifest) {
    entries.push({ path: 'assets/manifest.json', data: JSON.stringify({ schemaVersion: 1, assets: manifest }, null, 2) });
  }
  const blob = createZip(entries);
  const warnings = [];
  if (blob.size > LARGE_ZIP_WARNING_BYTES) {
    warnings.push(`This package is ${formatExportedFileSize(blob.size)} — some LMS hosts limit uploaded packages to around 50 MB. Consider using smaller media if your host rejects the upload.`);
  }
  return { blob, size: blob.size, warnings };
}

export async function buildStorylineWebObjectZip({ html, assets = [], manifest = [], title = 'Interactive Interaction' }) {
  const entries = [{ path: 'index.html', data: html }];
  for (const asset of assets) {
    if (asset?.blob) {
      entries.push({ path: asset.relativePath, data: await asset.blob.arrayBuffer() });
    }
  }
  const manifestData = JSON.stringify({
    schemaVersion: 1,
    format: 'articulate-storyline-web-object',
    title,
    exportedAt: new Date().toISOString(),
    assets: manifest
  }, null, 2);
  entries.push({ path: 'storyline-manifest.json', data: manifestData });
  entries.push({ path: 'assets/storyline-manifest.json', data: manifestData });
  const blob = createZip(entries);
  return { blob, size: blob.size };
}

export async function buildCoursePackZip({ courseTitle = 'AT&T Course Interactions Pack', components = [] }) {
  const entries = [];
  const manifestItems = [];

  for (const item of components) {
    const slug = slugify(item.name || item.id || 'component');
    entries.push({ path: `components/${slug}/index.html`, data: item.html });
    if (Array.isArray(item.assets)) {
      for (const asset of item.assets) {
        if (asset?.blob) {
          entries.push({ path: `components/${slug}/${asset.relativePath}`, data: await asset.blob.arrayBuffer() });
        }
      }
    }
    manifestItems.push({
      id: item.id,
      name: item.name,
      category: item.category || 'Interactive',
      path: `components/${slug}/index.html`
    });
  }

  const catalogHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(courseTitle)} — Interactive Component Pack</title>
  <style>
    :root {
      --primary: #00388F;
      --att-blue: #009FDB;
      --bg: #F3F4F5;
      --card-bg: #FFFFFF;
      --text: #000000;
      --text-muted: #4B5563;
      --border: #DCDFE3;
      --radius: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--att-font-sans, sans-serif);
      background-color: var(--bg);
      color: var(--text);
      padding: 40px 20px;
      line-height: 1.5;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .header {
      background: var(--card-bg);
      padding: 32px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background-color: var(--att-blue);
      color: #FFFFFF;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 8px;
    }
    p.desc {
      color: var(--text-muted);
      font-size: 1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      transition: all 180ms ease;
    }
    .card:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 16px rgba(0, 56, 143, 0.12);
      transform: translateY(-2px);
    }
    .card-cat {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .card-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text);
    }
    .btn-launch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      border-radius: 999px;
      background-color: var(--primary);
      color: #FFFFFF;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 700;
      transition: background-color 150ms ease;
    }
    .btn-launch:hover {
      background-color: var(--primary-hover);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">Course Component Pack</span>
      <h1>${escapeHTML(courseTitle)}</h1>
      <p class="desc">Interactive eLearning interaction package generated by the AT&amp;T Rise Component Builder. Select any component below to launch or preview.</p>
    </div>
    <div class="grid">
      ${manifestItems.map(item => `
        <div class="card">
          <div>
            <span class="card-cat">${escapeHTML(item.category)}</span>
            <h2 class="card-title">${escapeHTML(item.name)}</h2>
          </div>
          <a class="btn-launch" href="${escapeAttribute(item.path)}" target="_blank" rel="noopener">Launch Interaction &rarr;</a>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

  entries.push({ path: 'index.html', data: catalogHtml });
  entries.push({ path: 'course-index.html', data: catalogHtml });
  entries.push({
    path: 'course-manifest.json',
    data: JSON.stringify({
      title: courseTitle,
      exportedAt: new Date().toISOString(),
      components: manifestItems
    }, null, 2)
  });

  const blob = createZip(entries);
  return { blob, size: blob.size, count: components.length };
}

export function downloadZipFile(title, blob) {
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title || 'rise-component')}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function downloadStorylineWebObjectZip(title, blob) {
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title || 'storyline-web-object')}.storyline.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function downloadCoursePackZip(courseTitle, blob) {
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(courseTitle || 'course-pack')}.course-pack.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function downloadHtml(title, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title || 'rise-component')}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function downloadProjectJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(project.name || 'rise-project')}.rise.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}

export function downloadAssetManifest(title, manifest) {
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, assets: manifest }, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = registerLocalBlobURL(URL.createObjectURL(blob));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title || 'rise-component')}.assets.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  revokeLocalBlobURL(url);
}
