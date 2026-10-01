// @ts-nocheck
import { readZip } from '../zip.js';

export const MANIFEST_FILENAME = 'rcb-ppt-manifest.json';
export const ENHANCEMENT_SIGNATURE = '<!-- RCB-POST-PUBLISH-TOOLS:START -->';

/**
 * INPUT CONTRACT
 * The Post-Publish tools modify a course that was *published from Articulate Rise*. Accepted:
 *   - `web`        a Rise-style Web export: a launch file at the ZIP root plus structure typical of
 *                  a Rise export (`lib/rise*`, `lib/main.*`, `scormcontent/`, or Rise/Articulate in
 *                  the launch page).
 *   - `scorm12` / `scorm2004`  an `imsmanifest.xml` whose `<resource href>` launch file exists.
 *   - `generic-web` a plain web page with a root index.html and no Rise markers. Accepted but
 *                  labelled distinctly: nothing Rise-specific (navigation, completion, LMS
 *                  communication) can be assumed to work.
 * A package may sit inside ONE wrapper folder (for example `content/index.html`, as produced when a
 * course folder is zipped, or by some Rise export routes). That folder is treated as the package
 * root, the files keep their paths, and a warning says so.
 * Rejected, with an explanation: this Builder's own course ZIP, archives whose HTML lives only in
 * several different nested folders, SCORM manifests pointing at a missing file, and anything
 * without a launch file.
 *
 * Detection is by file structure only. It has not been verified against a live Rise export in
 * this repository (none is bundled), so a `web` result means "looks like a Rise export".
 */

const norm = p => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

function rejected(entries, error, extra = {}) {
  return {
    valid: false,
    packageType: 'unknown',
    kind: 'unsupported',
    label: 'Unsupported package',
    launchHtmlPath: '',
    isPreviouslyEnhanced: false,
    previousConfig: null,
    warnings: [],
    entries,
    error,
    ...extra
  };
}

// Entries that are not part of the course itself: what a zip tool adds, and the two files this tool
// puts at the ZIP root of an enhanced package (so an enhanced package can be uploaded again).
const ENHANCER_ROOT_FILES = new Set([MANIFEST_FILENAME, 'rcb-ppt-enhancement-report.txt']);
const isJunkPath = p => /^__macosx\//i.test(p) || /(^|\/)(\.ds_store|thumbs\.db)$/i.test(p) || ENHANCER_ROOT_FILES.has(p);

/**
 * When nothing sits at the ZIP root and everything lives under exactly one top-level folder, that
 * folder is the package root. Returns its prefix ("content/"), or '' when the ZIP already has files
 * at the root (or several top-level folders, which is not a wrapper).
 */
function findWrapperPrefix(files) {
  const real = files.map(e => norm(e.path)).filter(p => !isJunkPath(p));
  if (!real.length || real.some(p => !p.includes('/'))) return '';
  const tops = new Set(real.map(p => p.split('/')[0]));
  return tops.size === 1 ? `${[...tops][0]}/` : '';
}

/** Builder course/component packages are an input mistake worth naming specifically. */
function looksLikeBuilderCourse(entries) {
  const byPath = new Map(entries.map(e => [norm(e.path).toLowerCase(), e]));
  if (byPath.has('project-backup.json')) return true;
  const manifest = byPath.get('manifest.json');
  if (!manifest) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(manifest.data));
    return Boolean(parsed && typeof parsed === 'object' && 'courseName' in parsed && Array.isArray(parsed.sections));
  } catch {
    return false;
  }
}

/** First `<resource href="…">` in an imsmanifest.xml, without query/fragment; '' when absent. */
function manifestLaunchHref(manifestText) {
  const match = /<resource\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(manifestText);
  if (!match) return '';
  let href = match[1].trim();
  try { href = decodeURIComponent(href); } catch { /* keep as written */ }
  return norm(href.split(/[?#]/)[0]);
}

/**
 * Inspects an uploaded ZIP file and returns package metadata.
 * @param {Blob|File} zipBlob
 * @returns {Promise<{
 *   valid: boolean,
 *   packageType: 'web'|'generic-web'|'scorm12'|'scorm2004'|'unknown',
 *   kind: 'rise-web'|'generic-web'|'scorm12'|'scorm2004'|'unsupported',
 *   label: string,
 *   launchHtmlPath: string,
 *   isPreviouslyEnhanced: boolean,
 *   previousConfig: any|null,
 *   warnings: string[],
 *   entries: { path: string, data: Uint8Array, isDirectory: boolean }[],
 *   error?: string
 * }>}
 */
export async function detectRisePackage(zipBlob) {
  try {
    const entries = await readZip(zipBlob);
    const allFiles = entries.filter(e => !e.isDirectory);
    // Everything below is decided on paths relative to the package root; `prefix` is put back
    // wherever a path is reported or used to rewrite the ZIP, so the enhanced file keeps its layout.
    const prefix = findWrapperPrefix(allFiles);
    const files = prefix
      ? allFiles.filter(e => norm(e.path).startsWith(prefix)).map(e => ({ ...e, path: norm(e.path).slice(prefix.length) }))
      : allFiles;
    const byPath = new Map(files.map(e => [norm(e.path).toLowerCase(), e]));
    const paths = [...byPath.keys()];
    const warnings = [];
    if (prefix) {
      warnings.push(`All of this package's files are inside one folder, “${prefix.slice(0, -1)}”, so that folder is treated as the package root. The enhanced ZIP keeps the same layout; if your LMS or host expects the files at the top of the ZIP, re-zip the folder's contents.`);
    }

    // Previous enhancement manifest
    let isPreviouslyEnhanced = false;
    let previousConfig = null;
    const enhancement = files.find(e => e.path.endsWith(MANIFEST_FILENAME));
    if (enhancement) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(enhancement.data));
        if (parsed && parsed.enhancement === 'Rise Post-Publish Tools') {
          isPreviouslyEnhanced = true;
          previousConfig = parsed.config || null;
        }
      } catch {
        // Ignore JSON parse errors in malformed manifests
      }
    }

    if (looksLikeBuilderCourse(files)) {
      return rejected(entries,
        'This is a Rise Component Builder course package (one folder per interactive component), not a published Rise course. Post-Publish tools enhance a Web or SCORM export downloaded from Articulate Rise: publish your course in Rise, export it, and upload that ZIP.',
        { kind: 'builder-course', label: 'Builder course package' });
    }

    // --- SCORM: the launch file comes from the manifest, not from guessing ---
    const manifestEntry = byPath.get('imsmanifest.xml');
    if (manifestEntry) {
      const manifestText = new TextDecoder().decode(manifestEntry.data);
      // 27 September 2026 functional audit, section 4: `adlcp:scormtype`/`adlcp:scormType`
      // marks a resource as a "sco" and is part of the Content Packaging extension BOTH SCORM
      // versions share — it appears in nearly every valid manifest of either version, so its
      // mere presence can't tell 1.2 and 2004 apart, and using it here would misclassify most
      // real SCORM 1.2 packages as 2004. The genuinely 2004-exclusive signals are its Content
      // Aggregation Model version ("CAM 1.3", vs 1.2's "CAM 1.2") and its Simple Sequencing &
      // Navigation extensions (adlseq/adlnav/imsss namespaces), which don't exist in 1.2 at all.
      // Not verified against a real Rise-exported SCORM manifest of either version (see the
      // file-level comment above — no real Rise export is bundled with this repo).
      const is2004 = manifestText.includes('CAM 1.3')
        || manifestText.includes('2004')
        || /xmlns:adlseq\b|xmlns:adlnav\b|xmlns:imsss\b/i.test(manifestText);
      const packageType = is2004 ? 'scorm2004' : 'scorm12';
      const href = manifestLaunchHref(manifestText);
      let launch = '';
      if (href) {
        const hit = byPath.get(href.toLowerCase());
        if (!hit) {
          return rejected(entries,
            `imsmanifest.xml says the course launches from “${href}”, but that file is not in the package. The ZIP may be incomplete or re-zipped with an extra folder; re-export it from Rise.`,
            { kind: packageType, label: 'SCORM package with a missing launch file' });
        }
        launch = prefix + hit.path;
      } else {
        const guess = ['scormcontent/index.html', 'index_lms.html', 'index.html'].map(p => byPath.get(p)).find(Boolean);
        if (!guess) {
          return rejected(entries,
            'imsmanifest.xml does not name a launch file and none of the usual Rise launch pages (scormcontent/index.html, index_lms.html, index.html) is present.',
            { kind: packageType, label: 'SCORM package without a launch file' });
        }
        launch = prefix + guess.path;
        warnings.push('imsmanifest.xml does not name a launch resource, so the launch page was inferred from the file layout. Confirm it is the page your LMS actually opens.');
      }
      return {
        valid: true,
        packageType,
        kind: packageType,
        label: is2004 ? 'SCORM 2004 package' : 'SCORM 1.2 package',
        launchHtmlPath: launch,
        isPreviouslyEnhanced,
        previousConfig,
        warnings,
        entries
      };
    }

    // --- Web: the launch page must sit at the package root ---
    const rootLaunch = byPath.get('index.html') || byPath.get('index.htm');
    if (!rootLaunch) {
      const nested = paths.filter(p => /(^|\/)index\.html?$/.test(p));
      return rejected(entries, nested.length
        ? `No launch file at the root of this ZIP (index.html is only inside subfolders such as “${nested[0]}”). A Rise Web export has index.html at the top level; if you zipped a folder, zip its contents instead.`
        : 'The uploaded file does not look like a Rise 360 Web or SCORM export: there is no imsmanifest.xml and no index.html at the package root.');
    }

    const launchText = new TextDecoder().decode(rootLaunch.data);
    const riseStructure = paths.some(p => p.startsWith('lib/rise') || p.startsWith('lib/main.') || p.startsWith('scormcontent/'));
    const riseContent = /articulate|rise[\s-]?360|\brise\b/i.test(launchText);
    if (riseStructure || riseContent) {
      return {
        valid: true,
        packageType: 'web',
        kind: 'rise-web',
        label: 'Rise Web export (identified from its file structure)',
        launchHtmlPath: prefix + rootLaunch.path,
        isPreviouslyEnhanced,
        previousConfig,
        warnings,
        entries
      };
    }

    warnings.push('This package has a root index.html but none of the file structure of a Rise export. It will be treated as a generic web page: the tools can be added, but Rise navigation, completion tracking and LMS communication cannot be assumed to work.');
    return {
      valid: true,
      packageType: 'generic-web',
      kind: 'generic-web',
      label: 'Generic web page (not identified as a Rise export)',
      launchHtmlPath: prefix + rootLaunch.path,
      isPreviouslyEnhanced,
      previousConfig,
      warnings,
      entries
    };
  } catch (err) {
    return rejected([], `Failed to inspect package: ${err.message}`);
  }
}
