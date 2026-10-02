// Single maintainable source for the version shown in the app header (P09,
// index.html's #app-version-tag, set from here by app.js#init). This project is
// deliberately framework/bundler-free (docs/ARCHITECTURE.md) and the live GitHub Pages
// site serves these source files directly, not a generated dist/, so this string is not
// injected by a bundler — it must be kept in sync with package.json's own "version"
// field by hand on each meaningful release.
//
// The suffix after "+" is semver build metadata (valid per the spec, ignored for version
// precedence/ordering) stamped with the push date/time — reinstated at explicit user
// request after P09 removed a separate hand-typed date tag; unlike that removed tag, this
// stays attached to the version string itself.
//
// It is also the single source of the production cache-busting token: scripts/
// stamp-cache-busting.mjs turns this suffix ("20260907.1630") into the ?v= query on
// index.html's asset URLs and generated import map (docs/ARCHITECTURE.md, "Cache-busting").
// So on each release: bump APP_VERSION here + package.json, then run `npm run stamp` (or
// `npm run build`) and commit the re-stamped index.html alongside.
export const APP_VERSION = '3.0.0+20261002.2141';

// The build-metadata suffix above is stamped as YYYYMMDD.HHmm — compact and sortable,
// but raw semver build metadata can't contain spaces or colons (semver.org #spec-item-10),
// so it can't just be "31st Aug 2026" directly. The header badge should still read
// naturally, so this parses that suffix back into a real Date for display via
// utilities.js's formatReadableDate() (app.js#init), leaving APP_VERSION itself untouched.
// Returns null if the suffix is missing or malformed, so the caller can fall back to
// showing the raw version string rather than "Invalid Date".
export function parseVersionBuildDate(version) {
  const match = /\+(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})$/.exec(version);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}
