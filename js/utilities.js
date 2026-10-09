export function pluralize(count, singular, plural = `${singular}s`) {
  const n = typeof count === 'number' ? count : (Array.isArray(count) ? count.length : Number(count) || 0);
  return `${n} ${n === 1 ? singular : plural}`;
}

export function toRgba(color, alpha, fallback) {
  const value = (color || '').trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  const longHex = /^#([0-9a-f]{6})$/i.exec(value);
  let hex = longHex ? longHex[1] : null;
  if (!hex && shortHex) hex = shortHex[1].split('').map(char => char + char).join('');
  if (!hex) return fallback || `rgba(31, 41, 55, ${alpha})`;
  const number = parseInt(hex, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

export function slugify(value, fallback = 'rise-component') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

export async function copyTextToClipboard(value, options = {}) {
  const text = String(value ?? '');
  if (!text) throw new Error('There is no code to copy.');

  const navigatorObject = options.navigatorObject ?? globalThis.navigator;
  const documentObject = options.documentObject ?? globalThis.document;

  if (navigatorObject?.clipboard?.writeText) {
    try {
      await navigatorObject.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API access can be denied outside HTTPS/localhost. Keep the
      // current click gesture active and try the broadly supported fallback.
    }
  }

  if (!documentObject?.body || typeof documentObject.execCommand !== 'function') {
    throw new Error('Clipboard access is unavailable in this browser.');
  }

  const activeElement = documentObject.activeElement;
  const textarea = documentObject.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  documentObject.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = documentObject.execCommand('copy');
  } finally {
    textarea.remove();
    activeElement?.focus?.();
  }

  if (!copied) throw new Error('The browser could not copy the code. Select the code and copy it manually.');
  return true;
}

// Numbers a schema item for display. Most schemas number flatly ("Tab 1", "Tab 2").
// A schema with `pairLabels` (e.g. flip-cards' ['Front', 'Back']) numbers by pair
// instead, so items that combine N-at-a-time into one output unit read as
// "Card Face 1 (Front)"/"Card Face 1 (Back)" rather than a flat, unrelated-looking
// 1/2/3/4 that gives no hint which entries belong together. A schema with `roleLabels`
// (e.g. scenario's ['Prompt', 'Choice']) marks item 0 as playing a different role than
// every item after it, which is otherwise invisible since every item shares the same
// fields regardless of role — see components/scenario.js#generateHTML.
export function formatItemLabel(schema, index) {
  if (schema.roleLabels) {
    const role = index === 0 ? schema.roleLabels[0] : `${schema.roleLabels[1]} ${index}`;
    return `${schema.itemLabel} ${index + 1} (${role})`;
  }
  if (!schema.pairLabels) return `${schema.itemLabel} ${index + 1}`;
  const pairSize = schema.pairLabels.length;
  return `${schema.itemLabel} ${Math.floor(index / pairSize) + 1} (${schema.pairLabels[index % pairSize]})`;
}

export function generateHtmlFragment(fullHtml) {
  const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const styleBlock = styleMatch ? `<style>\n${styleMatch[1].trim()}\n</style>` : '';
  const bodyBlock = bodyMatch ? bodyMatch[1].trim() : fullHtml;
  return [styleBlock, bodyBlock].filter(Boolean).join('\n\n');
}

export function escapeSrcdoc(html) {
  return escapeAttribute(html);
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const escapeHtml = escapeHTML;

export function escapeAttribute(value) {
  return escapeHTML(value)
    .replace(/`/g, '&#96;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;');
}

export function escapeJavaScriptString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/"/g, '\\u0022')
    .replace(/'/g, '\\u0027')
    .replace(/`/g, '\\u0060')
    .replace(/\$/g, '\\u0024')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026');
}

const localBlobURLs = new Set();

export function registerLocalBlobURL(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) localBlobURLs.add(url);
  return url;
}

export function revokeLocalBlobURL(url) {
  localBlobURLs.delete(url);
  URL.revokeObjectURL(url);
}

export function sanitizeURL(value, options = {}) {
  const { allowDataImage = false, allowBlob = false, allowRelative = false, allowMailto = true, allowTel = true, fallback = '' } = options;
  const input = String(value ?? '').trim();
  if (!input) return fallback;
  const schemeEnd = input.indexOf(':');
  if (schemeEnd < 1) return allowRelative && (/^(?:\.\/|\/)?assets\/[^<>"'`\r\n\t]+$/i.test(input) || input.startsWith('./') || input.startsWith('/')) ? input : fallback;
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters that could hide a scheme, e.g. a NUL byte inside "javascript:"
  const normalizedScheme = input.slice(0, schemeEnd).replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();

  if (normalizedScheme === 'javascript' || normalizedScheme === 'vbscript') return fallback;
  if (normalizedScheme === 'data') {
    if (!allowDataImage) return fallback;
    return /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(input) ? input : fallback;
  }
  if (normalizedScheme === 'blob') return allowBlob && localBlobURLs.has(input) ? input : fallback;
  if (allowMailto && normalizedScheme === 'mailto') {
    return /^mailto:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(input) ? input : fallback;
  }
  if (allowTel && normalizedScheme === 'tel') {
    return /^tel:[+0-9()\-.\s]+$/i.test(input) ? input : fallback;
  }
  if (!['http', 'https'].includes(normalizedScheme)) return fallback;

  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function decodeEntities(value) {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function sanitizeInlineStyle(styleText) {
  if (!styleText || typeof styleText !== 'string') return '';
  const declarations = styleText.split(';');
  const safeStyles = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();

    // Check dangerous patterns in value
    if (!val || /[<>"'`\\]/.test(val) || /(?:javascript|expression|url|behavior|@import|-moz-|-webkit-)/i.test(val)) {
      continue;
    }

    if (prop === 'color' || prop === 'background-color' || prop === 'background') {
      if (/^(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|transparent|[a-z]+)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'font-size') {
      if (/^(?:[0-9]+(?:\.[0-9]+)?(?:px|pt|em|rem|%)|small|medium|large|x-large|xx-large|smaller|larger)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'line-height') {
      if (/^(?:[0-9]+(?:\.[0-9]+)?(?:px|pt|em|rem|%)?|normal|inherit|initial)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'letter-spacing') {
      if (/^(?:-?[0-9]+(?:\.[0-9]+)?(?:px|pt|em|rem)|normal|inherit)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'font-weight') {
      if (/^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'font-style') {
      if (/^(?:normal|italic|oblique)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'text-decoration') {
      if (/^(?:none|underline|line-through|overline)(?:\s+(?:solid|double|dotted|dashed|wavy))?(?:\s+(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|[a-z]+))?$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'text-align') {
      if (/^(?:left|right|center|justify)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'text-transform') {
      if (/^(?:none|capitalize|uppercase|lowercase|inherit)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    } else if (prop === 'list-style-type') {
      if (/^(?:disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/i.test(val)) {
        safeStyles.push(`${prop}: ${val}`);
      }
    }
  }

  return safeStyles.join('; ');
}

// An attribute string is hostile when it carries an event handler, an id or a name. Only attribute names
// count: the text inside a quoted value (a link such as ".../page?id=5" or "?online=1") is not an attribute.
function hasHostileAttributeName(attrString) {
  const namesOnly = String(attrString).replace(/(["'])[\s\S]*?\1/g, '""');
  return /(?:\bon\w+\s*=|\bid\s*=|\bname\s*=)/i.test(namesOnly);
}

export function sanitizeRichText(value) {
  const input = String(value ?? '');
  const allowedSimpleTags = new Set([
    'p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'span', 'mark', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'small', 'sub', 'sup', 'hr'
  ]);
  const tagPattern = /<[^>]*>/g;
  let output = '';
  let cursor = 0;

  for (const match of input.matchAll(tagPattern)) {
    output += escapeHTML(decodeEntities(input.slice(cursor, match.index)));
    const tag = match[0];

    // 1. Closing tags
    const closeMatch = /^<\s*\/\s*([a-z0-9]+)\s*>$/i.exec(tag);
    if (closeMatch) {
      const closeName = closeMatch[1].toLowerCase();
      if (allowedSimpleTags.has(closeName)) {
        output += `</${closeName}>`;
      } else if (closeName === 'a') {
        output += '</a>';
      } else if (closeName === 'font') {
        output += '</span>';
      } else {
        output += escapeHTML(decodeEntities(tag));
      }
      cursor = match.index + tag.length;
      continue;
    }

    // 2. <font color="..."> legacy tag support
    const fontMatch = /^<\s*font\b([^>]*)>$/i.exec(tag);
    if (fontMatch) {
      const colorMatch = /\bcolor\s*=\s*(["'])([\s\S]*?)\1/i.exec(fontMatch[1]);
      if (colorMatch) {
        const colorVal = decodeEntities(colorMatch[2]);
        const safeColor = sanitizeCSSColor(colorVal, '') || (/^(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|[a-z]+)$/i.test(colorVal) ? colorVal : '');
        output += safeColor ? `<span style="color: ${escapeAttribute(safeColor)}">` : '<span>';
      } else {
        output += '<span>';
      }
      cursor = match.index + tag.length;
      continue;
    }

    // 3. Anchor <a> tags
    const anchorMatch = /^<\s*a\b([^>]*)>$/i.exec(tag);
    if (anchorMatch) {
      const attrString = anchorMatch[1];
      const hasHostileAttr = hasHostileAttributeName(attrString);
      if (hasHostileAttr) {
        output += escapeHTML(decodeEntities(tag));
      } else {
        const hrefMatch = /\bhref\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrString);
        const rawHref = hrefMatch ? decodeEntities(hrefMatch[2]) : '';
        const href = rawHref ? sanitizeURL(rawHref, { allowRelative: true }) : '';

        if (href) {
          const isTargetBlank = /\btarget\s*=\s*(["'])_blank\1/i.test(attrString);
          const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrString);
          const safeStyle = styleMatch ? sanitizeInlineStyle(decodeEntities(styleMatch[2])) : '';
          const targetAttr = isTargetBlank ? ' target="_blank" rel="noopener noreferrer"' : '';
          const styleAttr = safeStyle ? ` style="${escapeAttribute(safeStyle)}"` : '';
          output += `<a href="${escapeAttribute(href)}"${targetAttr}${styleAttr}>`;
        } else {
          output += '&lt;a&gt;';
        }
      }
      cursor = match.index + tag.length;
      continue;
    }

    // 4. Allowed element opening tags (e.g. p, span, div, li, strong, etc.)
    const openMatch = /^<\s*([a-z0-9]+)\b([^>]*)\/?>$/i.exec(tag);
    if (openMatch) {
      const tagName = openMatch[1].toLowerCase();
      if (allowedSimpleTags.has(tagName)) {
        const attrString = openMatch[2] || '';
        const hasHostileAttr = hasHostileAttributeName(attrString) || /(?:\bjavascript:|\bvbscript:)/i.test(attrString);
        if (hasHostileAttr) {
          output += escapeHTML(decodeEntities(tag));
        } else if (tagName === 'br') {
          output += '<br>';
        } else if (tagName === 'hr') {
          output += '<hr>';
        } else {
          const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrString);
          const safeStyle = styleMatch ? sanitizeInlineStyle(decodeEntities(styleMatch[2])) : '';
          output += safeStyle ? `<${tagName} style="${escapeAttribute(safeStyle)}">` : `<${tagName}>`;
        }
        cursor = match.index + tag.length;
        continue;
      }
    }

    // 5. Any disallowed / unrecognized tag (e.g. <script>, <img onerror...>, <iframe>)
    output += escapeHTML(decodeEntities(tag));
    cursor = match.index + tag.length;
  }
  output += escapeHTML(decodeEntities(input.slice(cursor)));

  // If an <li> contains <span style="...">, propagate matching styling to the <li> so the bullet inherits it
  output = output.replace(/<li>\s*<span\s+style="([^"]+)">([\s\S]*?)<\/span>\s*<\/li>/gi, (match, styleAttr, innerContent) => {
    return `<li style="${styleAttr}"><span style="${styleAttr}">${innerContent}</span></li>`;
  });

  // A rich-text editor that has been cleared leaves "<br>" or "<p><br></p>" behind. That is not
  // content: treat it as empty so optional fields collapse and "a || fallback" works.
  return isRichTextEmpty(output) ? '' : output;
}

/**
 * Visible text of a rich-text value: tags removed, entities decoded, whitespace collapsed.
 * Escaped markup the author typed ("&lt;b&gt;") stays as the literal text they typed.
 * @param {unknown} value
 */
export function richTextToPlain(value) {
  const withoutTags = String(value ?? '')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withoutTags).replace(/[\s\u00a0]+/g, ' ').trim();
}

/**
 * True when a rich-text value shows nothing: no visible text and no divider.
 * @param {unknown} value
 */
export function isRichTextEmpty(value) {
  const html = String(value ?? '');
  return !/<hr\b/i.test(html) && richTextToPlain(html) === '';
}

/**
 * Renders a value from a single-line editor inside running markup (a heading, a button label, a badge).
 * Those editors store sanitised HTML, so the value must not be escaped a second time: that printed the
 * author's bold/italic as "<b>" and a typed "&" as "&amp;". Block wrappers and line breaks are flattened
 * to keep it on one line, and an empty value uses `fallback` (which is escaped, as plain text).
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function richInline(value, fallback = '') {
  const clean = sanitizeRichText(value);
  if (!clean) return escapeHTML(fallback);
  return clean
    .replace(/<\/(?:p|div|h[1-6]|blockquote|pre)>/gi, ' ')
    .replace(/<(?:p|div|h[1-6]|blockquote|pre)(?:\s[^>]*)?>/gi, '')
    .replace(/<\/?(?:ul|ol|li)(?:\s[^>]*)?>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A heading or label in sentence case: the first word capitalised, later words lower case, acronyms (AT&T, KPI) left alone.
 * @param {unknown} text
 */
export function toSentenceCase(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  return words.map((word, index) => {
    if (/^[A-Z0-9&]{2,}$/.test(word)) return word;
    if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    return word.toLowerCase();
  }).join(' ');
}

export function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function normalizeDelimitedLines(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<\/?(?:div|p|br|tr|li|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function sanitizeCSSColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toUpperCase() : fallback;
}

// Rise embeds a block inside a page that already has its own h1, so the wrapping
// headline defaults to h2 rather than forcing an h1 into the host document's outline.
export const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export const DEFAULT_HEADING_LEVEL = 'h2';

export function normalizeHeadingLevel(value) {
  return HEADING_LEVELS.includes(value) ? value : DEFAULT_HEADING_LEVEL;
}

export function sanitizeCSSNumber(value, { minimum = 0, maximum = 100, fallback = 0 } = {}) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

// Formats a byte count into a compact human string, extending up to TB so a
// browser's storage quota estimate (which can legitimately run into the
// hundreds of GB on a large disk) never falls through to a raw, unrounded byte
// count (P10 requirement 5, "very large values").
// "31st Aug 2026, 10:51 AM" instead of toLocaleString()'s locale-dependent
// "8/31/2026, 10:51:27 AM" — an ordinal day reads unambiguously regardless of
// the viewer's locale (no day/month-order guessing), and dropping seconds
// keeps it scannable in a compact project-list row.
function ordinalSuffix(day) {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}

export function formatReadableDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}${ordinalSuffix(day)} ${month} ${year}, ${time}`;
}

export function formatStorageBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

// Turns a navigator.storage.estimate() result (or its absence/failure) into
// display-ready state. Kept separate from formatStorageBytes and free of DOM
// access so every fallback branch (unsupported API, denied/zero estimate, and
// the normal case) is unit-testable without mocking navigator.storage (P10
// requirement 7). The percentage is always the primary label — never a raw
// byte count like "0 B of 10 GB" — and every quantity is explicitly marked as
// an approximation, since navigator.storage.estimate() itself is documented
// as an estimate, not an exact figure (P10 requirement 4).
/**
 * @param {{ supported?: boolean, usage?: number, quota?: number, failed?: boolean }} [estimate]
 */
export function describeStorageUsage({ supported, usage, quota, failed } = {}) {
  if (!supported || failed || !Number.isFinite(quota) || quota <= 0) {
    return {
      percent: 0,
      label: 'Usage unavailable',
      tooltip: 'Your browser did not report a storage estimate.'
    };
  }
  const safeUsage = Number.isFinite(usage) && usage > 0 ? usage : 0;
  const percent = Math.min(100, Math.round((safeUsage / quota) * 100));
  return {
    percent,
    label: `~${percent}% used`,
    tooltip: `Estimate: ${formatStorageBytes(safeUsage)} of ${formatStorageBytes(quota)} used (approximate, as reported by your browser)`
  };
}

export function sanitizePreviewConfig(config, componentId) {
  const result = structuredClone(config);
  result.colorPrimary = sanitizeCSSColor(config.colorPrimary, '#00388F');
  result.colorAccent = sanitizeCSSColor(config.colorAccent, '#009FDB');
  result.colorBg = sanitizeCSSColor(config.colorBg, '#FFFFFF');
  result.colorText = sanitizeCSSColor(config.colorText, '#000000');
  result.borderRadius = String(sanitizeCSSNumber(config.borderRadius, { minimum: 0, maximum: 100, fallback: 12 }));
  result.shadowDepth = ['none', 'soft', 'medium', 'premium'].includes(config.shadowDepth) ? config.shadowDepth : 'soft';
  result.iconStyle = ['chevron', 'plus-minus', 'arrow'].includes(config.iconStyle) ? config.iconStyle : 'chevron';
  result.blockHeadingLevel = normalizeHeadingLevel(config.blockHeadingLevel);
  result.headerStyle = ['minimal', 'editorial'].includes(config.headerStyle) ? config.headerStyle : 'minimal';
  result.headerCyanRule = Boolean(config.headerCyanRule);
  result.spacingDensity = ['compact', 'standard', 'spacious'].includes(config.spacingDensity)
    ? config.spacingDensity
    : (config.spacingDensity === 'comfortable' ? 'standard' : 'standard');
  result.contextBandEnabled = Boolean(config.contextBandEnabled);
  result.contextBandText = sanitizeRichText(config.contextBandText || '');
  result.contextBandAlignment = ['left', 'center'].includes(config.contextBandAlignment) ? config.contextBandAlignment : 'left';
  result.accordionMulti = Boolean(config.accordionMulti);
  result.accordionAnimation = Boolean(config.accordionAnimation);
  result.trackCompletion = Boolean(config.trackCompletion);

  const contentURLTypes = {
    'button-list': {},
    'audio-player': { allowBlob: true, allowRelative: true },
    'video-frame': { allowBlob: true, allowRelative: true },
    'image-gallery': { allowDataImage: true, allowBlob: true, allowRelative: true }
  };
  result.items = (Array.isArray(config.items) ? config.items : []).map(item => {
    const safeItem = { ...item };
    // A category is only a grouping/filter label. Its single-line editor stores HTML (and "<br>" once cleared),
    // which must not become a group named "<br>" or leak markup into a filter chip and its data attribute.
    if (item.category !== undefined) safeItem.category = richTextToPlain(item.category);
    if (contentURLTypes[componentId]) safeItem.content = sanitizeURL(item.content, contentURLTypes[componentId]);
    else safeItem.content = sanitizeRichText(item.content);
    if (componentId === 'multiple-choice' || componentId === 'multiple-select') safeItem.label = sanitizeRichText(item.label);
    if (componentId === 'fill-blank') safeItem.title = sanitizeRichText(item.title);
    if (item.image !== undefined) safeItem.image = sanitizeURL(item.image, { allowDataImage: true, allowBlob: true, allowRelative: true });
    if (item.beforeImage !== undefined) safeItem.beforeImage = sanitizeURL(item.beforeImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
    if (item.afterImage !== undefined) safeItem.afterImage = sanitizeURL(item.afterImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
    if (item.iconImage !== undefined) safeItem.iconImage = sanitizeURL(item.iconImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
    if (item.posterImage !== undefined) safeItem.posterImage = sanitizeURL(item.posterImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
    if (item.beforeLabel !== undefined) safeItem.beforeLabel = sanitizeRichText(item.beforeLabel);
    if (item.afterLabel !== undefined) safeItem.afterLabel = sanitizeRichText(item.afterLabel);
    if (item.beforeAltText !== undefined) safeItem.beforeAltText = String(item.beforeAltText || '');
    if (item.afterAltText !== undefined) safeItem.afterAltText = String(item.afterAltText || '');
    if (item.actionUrl !== undefined) safeItem.actionUrl = sanitizeURL(item.actionUrl);
    if (item.captionsUrl !== undefined) safeItem.captionsUrl = sanitizeURL(item.captionsUrl, { allowBlob: true, allowRelative: true });
    if (item.transcript !== undefined) safeItem.transcript = sanitizeRichText(item.transcript);
    if (item.audioDescription !== undefined) safeItem.audioDescription = sanitizeRichText(item.audioDescription);
    if (item.altText !== undefined) safeItem.altText = String(item.altText || '');
    if (item.iconAltText !== undefined) safeItem.iconAltText = String(item.iconAltText || '');
    if (item.posterAltText !== undefined) safeItem.posterAltText = String(item.posterAltText || '');
    if (item.caption !== undefined) safeItem.caption = String(item.caption || '');
    if (item.decorative !== undefined) safeItem.decorative = Boolean(item.decorative);
    if (item.iconDecorative !== undefined) safeItem.iconDecorative = Boolean(item.iconDecorative);
    if (item.posterDecorative !== undefined) safeItem.posterDecorative = Boolean(item.posterDecorative);
    if (item.imageCrop !== undefined) safeItem.imageCrop = item.imageCrop === 'square' ? 'square' : 'circle';
    if (item.imageFit !== undefined) safeItem.imageFit = item.imageFit === 'contain' ? 'contain' : 'cover';
    if (item.iconFit !== undefined) safeItem.iconFit = item.iconFit === 'cover' ? 'cover' : 'contain';
    if (item.x !== undefined) safeItem.x = String(sanitizeCSSNumber(item.x, { minimum: 0, maximum: 100, fallback: 50 }));
    if (item.y !== undefined) safeItem.y = String(sanitizeCSSNumber(item.y, { minimum: 0, maximum: 100, fallback: 50 }));
    if (item.accentColor !== undefined) safeItem.accentColor = sanitizeCSSColor(item.accentColor, '#009FDB');
    if (item.durationMinutes !== undefined) safeItem.durationMinutes = sanitizeCSSNumber(item.durationMinutes, { minimum: 0, maximum: 999, fallback: 0 });
    // interactive-video's body/question are richtext fields rendered client-side via
    // innerHTML (components/interactive-video.js's generateJS, not generateHTML), so —
    // unlike that component's plain-text marker fields, escaped once at their own point of
    // client-side insertion instead — these two must be sanitized here: sanitizeRichText is
    // a compile-time-only function, unavailable inside the exported script itself.
    if (item.body !== undefined) safeItem.body = sanitizeRichText(item.body);
    if (item.question !== undefined) safeItem.question = sanitizeRichText(item.question);
    if (item.media && typeof item.media === 'object') {
      const safeMedia = { ...item.media };
      if (typeof safeMedia.src === 'string') {
        safeMedia.src = sanitizeURL(safeMedia.src, { allowDataImage: true, allowBlob: true, allowRelative: true });
      }
      if (typeof safeMedia.posterSrc === 'string') {
        safeMedia.posterSrc = sanitizeURL(safeMedia.posterSrc, { allowDataImage: true, allowBlob: true, allowRelative: true });
      }
      if (typeof safeMedia.captionsSrc === 'string') {
        safeMedia.captionsSrc = sanitizeURL(safeMedia.captionsSrc, { allowBlob: true, allowRelative: true });
      }
      if (safeMedia.alt !== undefined) safeMedia.alt = String(safeMedia.alt || '');
      if (safeMedia.caption !== undefined) safeMedia.caption = String(safeMedia.caption || '');
      if (safeMedia.transcript !== undefined) safeMedia.transcript = sanitizeRichText(safeMedia.transcript);
      if (safeMedia.audioDescription !== undefined) safeMedia.audioDescription = sanitizeRichText(safeMedia.audioDescription);
      safeItem.media = safeMedia;
    }
    return safeItem;
  });
  if (config.aspectRatio !== undefined) {
    result.aspectRatio = ['16/9', '4/3', '3/2', '1/1', '3/4', '9/16', '2/1'].includes(config.aspectRatio) ? config.aspectRatio : '16/9';
  }
  if (config.imageFit !== undefined) {
    result.imageFit = config.imageFit === 'contain' ? 'contain' : 'cover';
  }
  if (config.stageBgColor !== undefined) {
    result.stageBgColor = sanitizeCSSColor(config.stageBgColor, '#FFFFFF');
  }
  result.backgroundImage = sanitizeURL(result.backgroundImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
  result.backgroundAltText = String(result.backgroundAltText || '');
  result.backgroundDecorative = Boolean(result.backgroundDecorative);
  result.backgroundFit = result.backgroundFit === 'cover' ? 'cover' : 'contain';
  result.backgroundFocalX = String(sanitizeCSSNumber(result.backgroundFocalX, { minimum: 0, maximum: 100, fallback: 50 }));
  result.backgroundFocalY = String(sanitizeCSSNumber(result.backgroundFocalY, { minimum: 0, maximum: 100, fallback: 50 }));
  // Shared across every component (js/editor-schemas.js's sharedComponentFields) — a
  // purely decorative block background, unrelated to any component-specific image field.
  result.blockBackgroundImage = sanitizeURL(result.blockBackgroundImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
  if (componentId === 'interactive-video') {
    result.title = String(config.title ?? '');
    result.introduction = sanitizeRichText(config.introduction);
    result.videoMediaId = sanitizeURL(config.videoMediaId, { allowBlob: true, allowRelative: true });
    result.videoUrl = sanitizeURL(config.videoUrl, { allowRelative: true });
    result.posterImage = sanitizeURL(config.posterImage, { allowDataImage: true, allowBlob: true, allowRelative: true });
    result.posterAltText = String(config.posterAltText || '');
    result.posterDecorative = Boolean(config.posterDecorative);
    result.captionsUrl = sanitizeURL(config.captionsUrl, { allowBlob: true, allowRelative: true });
    result.captionsLabel = String(config.captionsLabel || '');
    result.transcript = sanitizeRichText(config.transcript);
  }
  return result;
}
