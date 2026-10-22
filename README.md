# Rise Component Builder (AT&T Edition)

Rise Component Builder is a standalone browser-based authoring tool designed to create, preview, and export interactive eLearning components built specifically to **AT&T Brand Identity Standards** for Articulate Rise 360 and compatible HTML learning platforms.

---

## Core Product Philosophy

> *"Use native Rise when Rise already does the job well. Use this builder when the learning experience requires behavior that Rise cannot provide."*

---

## Next-Level Architecture & Features (v2.5.0)

### 0. Course Projects Dashboard & Multi-Component Workspace (Schema v3)
- **Projects Dashboard**: Centralized course management with search, filter chips (*All*, *Favorites*, *Recent*), sorting, and template creation (*Standard*, *Compliance*, *Microlearning*, *Blank*).
- **Multi-Module Workspace**: Organize courses into sections/modules containing multiple component instances.
- **Component Picker**: Browse and insert any of the 26 AT&T interactive components directly into course sections.
- **Course Tools**: Full Course Preview (with Desktop/Tablet/Mobile viewports), Shared Media Library (with usage reference tracking), and Course QA Readiness Auditor.
- **Structured Multi-Component Export**: Download structured ZIP packages containing all modules, HTML blocks, media assets, and course navigation.
- *Detailed Architecture*: See [`docs/PROJECT-DASHBOARD.md`](docs/PROJECT-DASHBOARD.md).

### 1. Strategic Component Tiers
Every component in the 26-archetype registry is categorized with an intentional strategic tier:
- **Tier 1: Signature Interactions (Flagship)**: Complex behaviors unavailable in native Rise (e.g. *Interactive Video*, *Confidence Matrix*, *Dial Gauge*, *Comparison Slider*, *Card Carousel*, *Callout Matrix*).
- **Tier 2: Enhanced Rise Equivalents**: Advanced supersets of native Rise blocks offering sequential locking, progress badges, search, and granular tracking (e.g. *Accordion*, *Tab Blocks*, *Vertical Timeline*, *Flip Cards*).
- **Tier 3: Specialized Media & Assessments**: Bespoke layouts for custom structured content (e.g. *Learning Audio Player*, *Learning Video Player*, *Sorting Activity*, *Fill in the Blank*).

### 2. Learning-Purpose Discovery Taxonomy
Filter and discover components by their instructional learning objective:
- `Explore` · `Compare` · `Practice` · `Reflect` · `Assess` · `Explain` · `Navigate` · `Media`

### 3. Component Details & Quick Inspection
Inspect rich component previews, capability breakdowns, native Rise comparison advice, accessibility ratings, and ready-to-use starter presets before entering the editor.

### 4. 4-Section Editor Information Architecture
- **Content**: Block titles, descriptions, and dynamic item cards with instant inline editing.
- **Interaction**: Sequencing, shuffle, retry limits, hints, search, and branching behavior.
- **Appearance**: AT&T Editorial headline styling with cyan rule, spacing density (`Compact`, `Standard`, `Spacious`), and context bands.
- **Completion**: Plain-language exploration criteria, Rise iframe postMessage integration guidance, and host gating rules.

### 5. Standardized Item Authoring & Bounded History
- **Item Actions**: Reorder (Up/Down / `Alt+Up`/`Alt+Down`), Duplicate (`Alt+D`), Delete (`Alt+Delete`), and live item count badges.
- **Undo / Redo Manager**: 50-step bounded history stack with `Ctrl+Z` (Undo), `Ctrl+Y` / `Ctrl+Shift+Z` (Redo), and debounced input coalescing.

### 6. Authentic Workplace Starter Presets
Production-ready workplace scenarios (Cybersecurity Incident Response, CSAT Target Milestone, CPNI Customer Privacy Guidelines, SLA Uptime Compliance, 5-Step Operational Coaching Framework) that instantly populate components with realistic domain content.

### 7. Rise Canvas & 4-Pillars AT&T Preflight Widget
- **Rise Canvas**: Simulated 960px Rise 360 block container with multi-viewport testing (`Desktop`, `Tablet 768px`, `Mobile 430px`, `Mobile 375px`, `Full Popout`).
- **4-Pillars Preflight**: Real-time compliance verification across *Brand & Typography*, *WCAG 2.1 AA Accessibility*, *Rise 360 Compatibility*, and *Media Budgets*.

---

## Brand Compliance Standards

All component templates, stylesheets, and export generators strictly adhere to the official **AT&T Brand Standards** specified in [`design/ATT-Rise-Design-Standards.md`](design/ATT-Rise-Design-Standards.md).

### 1. Color System & Design Tokens
- Sourced directly from `design/att-tokens.css`.
- **AT&T Blue (`#009FDB`)** is the primary brand color.
- **Cobalt (`#00388F`)** is reserved for actionable CTA buttons and interactive emphasis.
- **Neutrals**: Surface White (`#FFFFFF`), Sunken Neutral (`#F3F4F5`), Border Grey 2 (`#DCDFE3`), Border Strong Grey 3 (`#BDC2C7`), Text Black (`#000000`).

### 2. Typography
- Standardized on the official **AT&T Aleck Sans** font family (`var(--att-font-sans)`).
- **Five self-hosted WOFF2 cuts** embedded directly into exported HTML (Regular 400, Italic 400, Medium 500, Bold 700, Bold Italic 700).
- **16px body floor**: All learner-facing body copy maintains a 16px minimum floor with `1.5` line-height.

### 3. Curvature & Geometry
- Outer block shells: `--att-radius-xl` (32px)
- Content cards & accordion rows: `--att-radius-lg` (20px)
- Buttons & form controls: `--att-radius-md` (12px)
- Badges & progress tracks: `--att-radius-pill` / `--att-radius-sm` (8px)

### 4. Iconography
- Standardized on the official **AT&T Functional SVG Icon Library**.

### 5. Interaction States & Accessibility
- **Focus visible**: 3px solid `--att-cobalt` (`#00388F`) outline with 2px offset.
- **Touch targets**: 44×44px minimum touch target size.
- **Motion**: Zeroed out under `@media (prefers-reduced-motion: reduce)`.
- **WCAG AA Compliance**: High-contrast text/surface pairs with contrast ratios >= 4.5:1.

---

## Tooling & Verification Commands

- **Development server**: `npm run dev`
- **Unit & Integration tests**: `npm test`
- **Brand Compliance Linter**: `npm run lint:brand`
- **TypeScript type checking**: `npm run typecheck`
- **Code Coverage report**: `npm run test:coverage`
- **Cache-busting stamper**: `npm run stamp`
- **Full validation pipeline**: `npm run validate`
- **Capture brand visual snapshots**: `npm run snapshots:brand`
- **Generate export fixtures**: `npm run fixtures:exports`
