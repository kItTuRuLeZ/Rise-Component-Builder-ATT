# Rise Component Builder

## Product purpose

Rise Component Builder is a browser-based internal authoring tool for creating configurable interactive eLearning blocks intended for embedding in Articulate Rise or another HTML-capable learning environment. It provides a component catalog, schema-driven content editing, styling controls, an isolated live preview, local project persistence, and self-contained HTML-oriented exports.

## Intended users

- Instructional designers and eLearning developers
- Learning experience and content-design teams
- Front-end developers preparing custom Rise blocks
- Subject-matter experts working from predefined interaction templates

The builder itself is desktop/large-screen internal tooling and is not expected to run on phone-sized viewports — responsiveness is a requirement of the exported component *output* (what learners see embedded in Rise), not of this authoring UI. See `docs/TESTING-STRATEGY.md` "E2E browser matrix and known flake" for the narrow-viewport builder-shell test this scoped out of coverage.

## Current features

- Searchable component catalog organized by category
- Favorites stored locally
- Schema-driven item editor supporting text, textarea, number, range, select, checkbox, radio, color, URL, image, audio, video, and rich-text fields
- Multiline block labels/categories and headlines with preserved preview/export line breaks
- Add, duplicate, delete, move, drag-reorder, and collapse item cards
- Inline field validation
- Component styling for colors, border radius, borders, shadows, icons, and font selection
- Versioned exported-component themes with seven built-in presets, custom theme CRUD, import/export, defaults, live thumbnails, and WCAG contrast reporting
- Per-component theme overrides for primary/accent/background/text colors, radius, shadow, and font with one-action reset
- Behavior and completion-tracking controls
- Responsive live preview inside a sandboxed `srcdoc` iframe
- Keyboard and screen-reader behavior for the primary generated interactions
- Light/dark application-shell mode
- Versioned local projects with New, Save, Save As, Open, Rename, Duplicate, Delete, JSON import/export, autosave, and draft restoration
- Persisted application settings and component favorites
- Toast notifications
- Defensive HTML, attribute, URL, rich-text, CSS, and inline-script sanitization
- Reusable browse/drag-and-drop media uploads with previews, replacement, removal, metadata, and external-URL fallback
- Optional per-item custom icon/image uploads for Flip Card faces, Information Grid cards, and Interactive Learning Audio artwork, with built-in fallbacks
- Visible image-upload guidance listing supported formats, limits, and schema-specific preferred dimensions
- IndexedDB storage for uploaded images, audio, video, posters, and WebVTT captions
- Media-aware standalone export validation and ZIP asset-manifest preparation
- An in-app export compatibility report (Confirmed/Preview/Fallback/Unsupported per export format), backed by `docs/RISE-COMPATIBILITY-MATRIX.md`, a manual Rise test checklist, and a results log — see `docs/COMPATIBILITY-RESULTS.md`. Moodle/SCORM are out of scope for this project (see "Scope" in the matrix); their checklist is kept for reference only.
- A completion adapter system (standalone/parent-message/no-op) sending Rise's own documented `{ type: 'complete' }` completion signal, with a configurable target-origin and duplicate-prevention — see `docs/COMPLETION-INTEGRATION.md`. Rise/LMS/xAPI completion consumption is explicitly unverified. SCORM completion is out of scope for this project.
- A schema-driven, component-specific export-preflight validation engine (Blocking/Warning/Recommendation severities) covering general content, knowledge-check, media, and hotspot rules, surfaced inline, via item-card badges, a consolidated Preflight panel, and an export gate that blocks only on genuine blocking failures — see `docs/VALIDATION-RULES.md`.
- WCAG 2.2 AA accessibility coverage for both the builder UI and every exported component — automated axe/keyboard test coverage, an embedded headline that is always an `<h2>` (avoids a forced second `<h1>` in a Rise lesson), builder-chrome contrast/reflow/target-size fixes, and an honest list of what remains manual-only — see `docs/ACCESSIBILITY-CONFORMANCE.md`.
- A security-hardening pass covering prototype-pollution key rejection on imported project JSON, a minimized iframe sandbox (removed the previously-included `allow-same-origin`, verified unnecessary), a global unexpected-error handler that logs full detail to the console while showing only a generic toast to authors, and a clean dependency audit — see `docs/SECURITY.md`.
- A productionized media pipeline: image-dimension limits with automatic downscale/compression, content-hash duplicate detection, always-visible local-vs-external and missing-asset indicators, a friendly IndexedDB storage-quota error, a real dependency-free ZIP writer/reader (`js/zip.js`) backing both a Web Package ZIP export and a portable project package, and an explicit per-export-mode table of which assets are embedded, packaged, referenced, or unsupported — see `docs/MEDIA-ASSET-PIPELINE.md`.

## Supported component types

- Responsive Accordion
- 3D Flip Cards
- Horizontal Tabs
- Interactive Hotspots
- Quick Link Buttons
- Secondary Menu Drawer
- Multiple Choice Check
- Sorting Activity
- Fill in the Blank
- Vertical Timeline
- Horizontal Timeline
- Process Flow
- Branching Scenario
- Profile Cards
- Information Grid
- Comparison Cards
- Interactive Learning Audio
- Video Player
- Image Gallery
- Interactive Video
- AI Scenario Generator placeholder
- AI Quiz Generator placeholder

## Technology stack

- Vanilla HTML5
- Vanilla CSS
- Native JavaScript ES modules
- Browser `localStorage` for projects, drafts, favorites, settings, custom themes, default component theme, and application UI theme
- Browser IndexedDB for uploaded media Blobs
- Browser Blob/Object URL APIs for downloads
- Sandboxed iframe `srcdoc` for previews and embed output
- Vitest with jsdom for unit and integration tests
- Playwright Chromium and axe-core for browser and automated accessibility tests
- Google Fonts loaded from the web for the builder and generated previews

There is no application framework, production bundler, backend, or external database. npm is used only for pinned test tooling and CI commands.

## Current export options

- Self-contained iframe snippet using `srcdoc`
- Paste-friendly HTML fragment containing style, markup, and script
- Downloadable standalone HTML document
- Versioned project JSON download and import
- Versioned theme JSON download and import
- Web Package ZIP: a real, deterministic ZIP archive (`index.html` at the root + `assets/`) for components using uploaded media that can't travel through the single-file/paste formats — see `docs/MEDIA-ASSET-PIPELINE.md`
- Portable project package (`.rise-project.zip`): a saved project's uploaded media travels with it (not just IndexedDB references), importable in a different browser/profile
- SCORM packaging is out of scope for this project (deliberate decision, `docs/RISE-COMPATIBILITY-MATRIX.md` "Scope", 2026-08-12) — no package is produced, and it is not a selectable export format in Settings

## Known limitations

- Only five component generators are separated into `components/`; remaining generators are coupled to `js/preview.js`.
- Theme values are centralized, but some legacy component layout values remain in the shared preview stylesheet rather than being represented as design tokens.
- Default content for remaining legacy components is coupled to `app.js`.
- Media is local to the current browser profile and is not included in the plain project JSON export — use the portable project package export for that.
- Single-file HTML export embeds only small raster images; SVG, large images, audio, video, and captions require the Web Package ZIP instead (now implemented).
- SCORM export is out of scope for this project (see above) — no package is produced, and none is planned.
- AI generation is a local timed simulation, not a connected AI service.
- Several generated examples depend on external media and Google Fonts being available online.
- The application is a local browser MVP and has no collaboration, authentication, server sync, or deployment workflow.
- Chromium is the initial automated browser target; Firefox, WebKit, Rise, and assistive-technology verification remain manual. Moodle is out of scope for this project.

See `docs/KNOWN-ISSUES.md` for confirmed implementation details, `docs/ARCHITECTURE.md` for module boundaries, `docs/COMPONENT-SCHEMA.md` for the data model, `docs/EXPORT-CONTRACT.md` for how preview and export stay in sync, `docs/SECURITY.md` for the sanitization/threat model, `docs/TESTING-STRATEGY.md` for the test/lint/typecheck/build pipeline, `docs/RISE-COMPATIBILITY-MATRIX.md` (with `docs/RISE-TEST-CHECKLIST.md`, `docs/MOODLE-SCORM-TEST-CHECKLIST.md`, and `docs/COMPATIBILITY-RESULTS.md`) for Rise/LMS/browser compatibility classification, `docs/COMPLETION-INTEGRATION.md` for exactly what "completion" does and does not mean, `docs/VALIDATION-RULES.md` for the full export-preflight rule catalog, `docs/ACCESSIBILITY-CONFORMANCE.md` for WCAG 2.2 AA conformance status, automated coverage, and required manual testing, and `docs/MEDIA-ASSET-PIPELINE.md` for the full media upload/validation/export pipeline.

## MVP objectives

- Preserve a simple framework-free authoring workflow.
- Provide reusable, configurable eLearning interactions.
- Keep generated components isolated from the builder UI.
- Maintain safe interpolation of author-provided content.
- Provide WCAG-oriented generated output and authoring validation.
- Persist projects reliably in the browser.
- Produce portable HTML-oriented output.
- Maintain durable local media storage without putting binary files in localStorage.
