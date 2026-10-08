# Antigravity Implementation Prompt: Rise Component Builder – AT&T Audit Remediation

## Role

Act as a senior front-end engineer, interaction designer, accessibility specialist, and QA engineer. Audit and improve the existing **Rise Component Builder – AT&T** repository without replacing its architecture or breaking any existing component, project-storage, preview, preset, export, or completion-tracking behavior.

Live reference: https://kitturulez.github.io/Rise-Component-Builder-ATT/

Current audited build: `v2.2.0+20260910.1431`

## Primary objective

Bring the builder and all 26 components to production-ready quality by:

1. Ensuring every feature advertised on a component card is genuinely implemented.
2. Making important behavior visible and understandable in the editor.
3. Fixing text clipping, overflow, alignment, responsiveness, and content-quality problems.
4. Providing component-specific starter content and instructions.
5. Preserving Rise Code Block compatibility, accessibility, completion messaging, and existing saved-project compatibility.

Do not merely restyle the template gallery. Inspect the component schema, editor configuration, preview renderer, export pipeline, presets, completion logic, and tests for every component.

## Non-negotiable constraints

- Preserve the current AT&T design tokens and brand system.
- Preserve existing localStorage and IndexedDB data and schema compatibility.
- Do not rename or remove existing component IDs, fields, export formats, completion events, or public APIs without a backward-compatible migration.
- Do not add large frameworks or unnecessary dependencies.
- Do not insert external CDN dependencies into exported Rise blocks.
- Keep exported blocks self-contained and compatible with the existing CSP and iframe sandbox contract.
- Maintain keyboard operation, visible focus, screen-reader semantics, reduced-motion support, and 44 × 44 px minimum touch targets.
- Do not claim a feature is supported merely because text on a gallery card says so. It must exist in the editor/configuration and work in preview and exported output.
- Avoid cosmetic-only placeholders. Implement real behavior or revise the claim to accurately describe what exists.
- Keep all current tests passing and add regression coverage for every change.

## Phase 1: Establish a baseline

Before editing:

1. Read the architecture, component schema, export contract, compatibility results, known issues, and testing documentation.
2. Run the existing unit, integration, accessibility, export, and end-to-end suites.
3. Build the production version.
4. Record the existing component registry, schemas, defaults, presets and export output.
5. Capture baseline screenshots for all components at these preview widths:
   - Rise canvas/default: up to 740 px
   - Tablet: 768 px
   - Large mobile: 430 px
   - Mobile: 375 px
6. Do not continue if the baseline build or existing tests fail. Diagnose and document pre-existing failures first.

## Phase 2: Fix shared content and builder UI issues

### A. Component-specific instructional text

The same default instruction—“Click on the headers below to discover detailed insights.”—currently appears across unrelated components. Replace it with a component-specific default for every template.

Use concise, action-oriented guidance. At minimum, use or improve these examples:

- Accordion: “Select each heading to reveal its details.”
- Study Cards: “Select a card to reveal the reverse, then rate your confidence when Study Mode is enabled.”
- Horizontal Tabs: “Select each tab to explore the content.”
- Hotspots: “Select each marker to explore the image.”
- Comparison Slider: “Drag the divider or use the arrow keys to compare both views.”
- Interactive Gauge: “Adjust the value to explore how the performance level changes.”
- Button List: “Select a resource to open or download it.”
- Reference Explorer: “Select a reference item to reveal its details.”
- Multiple Choice: “Select the best answer, then submit your response.”
- Multiple Select: “Select all applicable answers, then submit your response.”
- Sorting Activity: “Assign each item to the correct category.”
- Fill in the Blank: “Enter the missing answer, then check your response.”
- Confidence Matrix: “Rate your confidence for each skill to view your profile.”
- Guided Vertical Timeline: “Explore each milestone in sequence.”
- Horizontal Timeline: “Use the controls to move through each milestone.”
- Guided Process: “Complete each step to continue through the process.”
- Scenario: “Choose a response to continue the conversation.”
- Profile Cards: “Select a profile to view more information.”
- Info Grid: “Review each card to explore the key information.”
- Comparison Matrix: “Compare the options and inspect their key differences.”
- Policy & Alert Cards: “Review each notice and acknowledge items when required.”
- Card Carousel: “Use the arrows or swipe to explore each card.”
- Learning Audio Player: “Play the audio and use the chapters or transcript to navigate.”
- Learning Video Player: “Play the video and use the chapters, captions or transcript to navigate.”
- Image Gallery: “Filter the gallery or select an image to view its details.”
- Interactive Video: “Play the video and respond when an interaction appears.”

Store these defaults in the relevant component definitions/presets rather than adding conditional text in the renderer.

### B. Header and toolbar responsiveness

At common laptop widths, the Aptara branding, wrapped “Component Builder” title, version badge, project name, and action controls feel crowded.

Implement a responsive header that:

- Keeps the product title readable without awkward wrapping.
- Prevents the version badge from colliding with adjacent content.
- Truncates a long project name with an ellipsis and exposes the full name by accessible tooltip/title.
- Retains clear access to New, Open, Save, Duplicate, Undo, Redo and Export.
- Moves secondary controls into a sensible overflow menu only when necessary.
- Works at 100%, 125%, 150% and 200% browser zoom.
- Does not hide required controls from keyboard users.

### C. Classification system

Separate the current overlapping labels into two dimensions:

1. **Relationship to Rise**
   - Rise First
   - Enhanced Rise
   - No Rise Equivalent

2. **Product maturity/value**
   - Standard
   - Strong Custom
   - Flagship
   - Beta

Ensure gallery cards, filters, tooltips and details use the same vocabulary. Migrate existing metadata without breaking component IDs or filters.

### D. Replace generic Interaction panels

Many components display a generic “Standard Interaction” message despite advertising specialized behavior. Replace it with a component-specific feature summary and, where useful, real configuration controls.

Every Interaction tab must explain:

- What the learner can do.
- Which behaviors are fixed.
- Which behaviors are configurable.
- Keyboard and touch behavior.
- What is tracked.
- What causes completion.
- Any limitations in Rise or the current export format.

Do not duplicate the Completion tab verbatim.

### E. Content-length guidance

Replace the generic recommendation of approximately 4,000 characters with field- and component-specific guidance.

- Use soft warnings, not destructive truncation.
- Show a live character counter for constrained fields.
- Warn when content is likely to create excessive height, card imbalance, tooltip overflow or mobile usability problems.
- Never silently cut learner-authored text.
- Ensure pasted long words and URLs wrap safely using appropriate CSS such as `overflow-wrap: anywhere` where required.

## Phase 3: Component feature remediation

### 1. Accordion

Verify and retain:

- Multiple-open mode.
- Smooth transitions.
- Sequential locking.
- N-of-M progress.
- Visited badges.
- Learner-facing Expand All and Collapse All.
- Search across title and body.
- Reset behavior.

Test conflicting settings, including Guided Mode with Expand All disabled. Ensure search results do not leave inaccessible hidden focus targets.

### 2. Study Cards

Verify:

- Explore and Study modes.
- Accessible card flipping.
- Know/Needs Review classification.
- Category filtering.
- Shuffle.
- End-of-set summary.
- Restart.
- Completion/mastery tracking.

Prevent long front/back text from clipping. Cards may grow vertically or use an intentional accessible scrolling region; never conceal text behind a fixed-height flip surface.

### 3. Horizontal Tabs

Verify:

- Horizontal and vertical orientation.
- Numbered tabs.
- Sequential progression.
- Progress and visited states.
- Reset.
- Side-by-side comparison.
- Automatic mobile fallback below 480 px.
- Optional auto-advance without stealing focus.

Long tab labels must wrap or become a horizontally scrollable tab list with clear affordances. Do not shrink labels below an accessible reading size.

### 4. Hotspots

Verify:

- Marker placement and editing.
- Tooltip/popover content.
- Image alternative text.
- Keyboard marker navigation.
- Zoom controls.
- Explored-marker progress and completion.
- Mobile tooltip positioning within the viewport.

Keep the “Rise First” recommendation for ordinary diagrams. Clearly state why the custom version is justified.

### 5. Comparison Slider

Verify:

- Horizontal and vertical split.
- Mouse drag.
- Touch drag.
- Arrow-key control.
- Initial position.
- Before/After badges.
- Correct alternative text strategy.
- Completion triggered only after meaningful interaction.

Ensure badges and the handle never extend beyond the image at 375 px.

### 6. Interactive Gauge

Add a component-specific Interaction section. Expose or document:

- Minimum, maximum, step and initial value.
- Operational tiers and thresholds.
- Target zone.
- Contextual feedback per range.
- Keyboard increment/decrement behavior.
- Completion conditions.

Ensure tick labels, needle, value labels and contextual copy do not overlap at narrow widths.

### 7. Button List

Verify:

- Resource grouping.
- External links versus downloads.
- Optional metadata such as file type and size.
- Icons and button styles.
- Safe external-link treatment.
- Link-click completion tracking.

Do not claim download metadata if the editor does not let the author provide it.

### 8. Reference Explorer

Verify:

- Expand/collapse behavior.
- Glossary/reference navigation.
- Search or filtering if advertised anywhere.
- Deep-link handling if supported.
- Item-exploration completion.

Long titles and reference content must remain readable on mobile.

### 9. Multiple Choice

Retain and test:

- Confidence-before-answer.
- Optional required confidence rating.
- Custom confidence labels.
- Retry limits.
- Hints after incorrect attempts.
- Final answer reveal.
- Final explanation.
- Try Again.
- Pass/fail and confidence tracking.

Test every attempt-count edge case and prevent duplicate submissions.

### 10. Multiple Select

Make the advertised partial-credit and remediation behavior explicit.

- Add a scoring-mode control: all-or-nothing or partial credit.
- Define penalties, minimum score and rounding behavior.
- Allow remediation/general feedback.
- Explain scoring accessibly after submission.
- Ensure completion rules match the chosen scoring mode.

If partial credit is not actually supported, remove that claim from the gallery card.

### 11. Sorting Activity

Verify or implement:

- Multiple categories/columns.
- Mouse, touch and keyboard operation.
- A non-drag alternative such as a category selector.
- Explanations after placement or submission.
- Score/accuracy summary.
- Retry/reset.
- 100%-correct completion behavior.

Cards and category columns must stack cleanly at 430 and 375 px.

### 12. Fill in the Blank

Expose and test:

- Multiple accepted answers and synonyms.
- Case and punctuation normalization.
- Fuzzy-matching toggle and tolerance.
- Staged clues/hints.
- Inline feedback.
- Retry limits.
- Correct-answer completion.

Never accept an incorrect answer because the fuzzy threshold is too permissive. Add unit tests around borderline matches.

### 13. Confidence Matrix

Verify:

- Four-level competency rating.
- Completion state for every row.
- Overall score calculation.
- Strengths and growth-area analysis.
- Reset.
- Keyboard and screen-reader interaction.

At mobile widths, avoid a compressed desktop matrix. Convert it into stacked skill-rating cards if necessary.

### 14. Guided Vertical Timeline

Retain and test:

- Categories and filters.
- Two-stream comparison.
- Collapsible details.
- Chronological locking.
- Progress.
- Reset.

Make the two-stream layout collapse into a clearly labeled single stream on mobile.

### 15. Horizontal Timeline

Verify:

- Milestone navigation.
- Images/media.
- Keyboard navigation.
- Visited tracking.
- All-milestones completion.

Prevent timeline nodes, navigation arrows and milestone labels from clipping. Provide a stacked mobile alternative when horizontal space is insufficient.

### 16. Guided Process

Replace the generic Interaction panel with explicit controls or documentation for:

- Progressive reveal.
- Gated versus free navigation.
- Step completion badges.
- Previous/Next behavior.
- Summary review.
- Restart/reset.

The editor and preview must clearly prove the feature claims made on the gallery card.

### 17. Scenario

Expose and validate:

- Choice-to-node branching.
- Ending states.
- Cumulative score rules.
- Feedback per choice.
- Review dialogue/path.
- Restart.
- Unreachable-node and circular-branch validation.

Add a preflight error for missing destinations, dead ends or unreachable nodes. If complex branching is not supported, narrow the gallery claim.

### 18. Profile Cards

Verify:

- Responsive persona grid.
- Profile modal/dialog.
- Focus trapping and focus return.
- Escape-to-close.
- Image alt text.
- Profile-view tracking.

Long names, roles and biographies must not clip.

### 19. Info Grid

Expose or clearly document:

- Column count.
- Icon/image behavior.
- Card alignment.
- Equal-height versus content-height layout.
- Mobile stacking.
- Optional exploration tracking.

Avoid excessive card height caused by forcing every card to match the longest item unless equal height is intentionally selected.

### 20. Comparison Matrix

Verify:

- Configurable options and features.
- Recommended/highlighted option.
- Info tooltips.
- CTA behavior.
- Option-inspection tracking.
- Accessible mobile comparison.

Do not force a miniature multi-column table at 375 px. Use stacked options with repeated feature labels or a controlled horizontal-scrolling region with clear cues.

### 21. Policy & Alert Cards

Expose:

- Alert type/tone.
- Severity.
- Required versus optional acknowledgment.
- Acknowledgment label.
- Completion condition.
- Reset behavior.

Ensure meaning is not communicated by color alone. Use icons, text labels and suitable ARIA semantics.

### 22. Card Carousel

Verify:

- Previous/Next buttons.
- Dot navigation.
- Touch swipe.
- Keyboard navigation.
- Category badges.
- Rich media.
- Slide announcements.
- All-slides-viewed completion.

Keep only the current slide in the intended reading/focus order. Prevent badge and navigation overlap at narrow widths.

### 23. Learning Audio Player

Provide a dependable bundled or repository-hosted starter audio asset and transcript so the preview proves:

- Playback.
- Seek controls.
- Chapter navigation.
- Synchronized transcript highlighting.
- Resume position.
- Progress/listen threshold.
- Key takeaways.
- Playback-rate behavior if supported.

Make transcript rows keyboard operable and allow users to jump to their timestamps. Handle unavailable media gracefully.

### 24. Learning Video Player

Provide a dependable starter video, captions and transcript. Verify:

- Custom overlay controls.
- Chapters.
- Captions.
- Audio-description track or clearly documented alternative.
- Synchronized transcript.
- Resume position.
- Watch-percentage completion.
- Full-screen behavior where allowed by the Rise iframe sandbox.

Do not advertise audio description unless the author can supply/configure it and exported playback supports it.

### 25. Image Gallery

Verify:

- Category filters.
- Captions and detailed descriptions.
- Modal/lightbox navigation.
- Previous/Next controls.
- Focus trap and focus return.
- Escape-to-close.
- Exploration tracking.

Ensure portrait, landscape and unusually long captions do not cause clipping.

### 26. Interactive Video

This is a flagship Beta component and its default demonstration must work.

Fix the starter preset so it no longer displays an unsupported-video state or “No transcript has been supplied.” Include a reliable sample video and transcript that demonstrate:

- Information markers.
- Multiple-choice markers.
- Automatic pause at markers.
- Explicit Submit for questions.
- Manual and automatic resume modes.
- Marker list.
- N-of-M progress.
- Restart.
- Progress persistence.
- All three video completion-rule options.

Validate marker timestamps against media duration and show preflight errors for out-of-range or duplicate/conflicting markers.

## Phase 4: Responsive overflow and alignment system

Add a reusable automated preview audit that runs for every component and starter preset at 740, 768, 430 and 375 px.

Detect and report:

- Root-level horizontal overflow.
- Elements extending outside the preview viewport.
- `scrollWidth` greater than `clientWidth` where overflow is not intentional.
- Fixed-height regions hiding text.
- Text overlapping icons, badges, images or controls.
- Controls below the minimum touch-target size.
- Modals, tooltips and popovers extending off-screen.
- Long unbroken strings and URLs.
- Focus indicators clipped by overflow containers.
- Media controls wrapping incorrectly.
- Hidden content that remains keyboard-focusable.

Allow intentional scrolling only for documented regions such as a scrollable tab list or comparison table. The preflight result must distinguish intentional scrolling from defects.

Also test:

- 200% browser zoom.
- Increased text spacing.
- Reduced motion.
- Very long headings and labels.
- Empty optional fields.
- Maximum reasonable item counts.
- One-item/minimum configurations.
- Right-to-left readiness where the architecture already supports it; do not introduce RTL claims otherwise.

## Phase 5: Preflight improvements

Extend Preflight to provide component-specific errors, warnings and recommendations.

Examples:

- Missing media, transcript, captions or alternative text.
- A completion mode that cannot be satisfied.
- Sequential mode with contradictory controls.
- A scenario choice with no destination.
- Interactive Video marker outside the media duration.
- Study Mode enabled without complete front/back card pairs.
- Comparison Slider missing either image.
- Hotspot outside image bounds.
- Duplicate IDs.
- Empty accessible labels.
- Excessively long constrained content.
- Mobile overflow detected.

Each message must identify the affected item and, when possible, take the author to the relevant editor section.

## Phase 6: Testing requirements

Add or update tests for:

1. All 26 components instantiate with valid defaults.
2. Every advertised configurable feature maps to a schema field and renderer behavior.
3. Existing saved projects migrate without data loss.
4. Every export format includes the same expected interaction behavior.
5. Completion events fire once, at the correct time, with stable payloads.
6. Reset/restart clears only intended state.
7. Keyboard-only completion of every interaction.
8. Screen-reader names, roles, states and announcements.
9. Focus management for modals, popovers, cards and branching interactions.
10. Mobile overflow at 375 and 430 px.
11. Tablet and Rise-canvas layouts.
12. Reduced-motion behavior.
13. Long-content stress cases.
14. Missing/failed media states.
15. Touch/pointer logic for sliders and carousels.
16. Partial-credit calculations.
17. Fuzzy-answer boundaries.
18. Scenario graph validation.
19. Interactive Video marker and completion rules.

Use visual regression screenshots for every component at desktop and mobile. Mask only genuinely nondeterministic content; do not mask layout regions merely to make tests pass.

## Required documentation updates

Update the relevant project documentation, including:

- Component schema/reference.
- Export contract if behavior changes.
- Compatibility results.
- Known issues.
- Rise test checklist.
- Accessibility notes.
- Component feature matrix.
- Saved-project migration notes, if applicable.

Create a component feature matrix with these columns:

| Component | Advertised feature | Editor control/schema | Preview implementation | Export implementation | Automated test | Status |
|---|---|---|---|---|---|---|

No row may be marked complete without traceable implementation and a passing test.

## Required execution order

Implement in this order:

1. Baseline tests and screenshots.
2. Shared instructional-text fix.
3. Shared overflow/preflight infrastructure.
4. Header responsiveness.
5. Classification cleanup.
6. Generic Interaction-tab replacement.
7. Highest-value component gaps:
   - Interactive Video
   - Learning Audio Player
   - Learning Video Player
   - Guided Process
   - Scenario
   - Multiple Select
   - Sorting Activity
   - Fill in the Blank
   - Interactive Gauge
8. Remaining component-specific responsive fixes.
9. Full regression and export verification.
10. Documentation and final audit report.

Commit in small, logical batches. Do not combine all modifications into one large commit.

## Definition of done

The work is complete only when:

- All 26 component cards accurately describe the shipped behavior.
- Every advertised feature is implemented or the claim has been corrected.
- Every component has appropriate default instructional text.
- The Interactive Video starter preset renders working media and transcript content.
- The audio and video player presets demonstrate their defining features.
- No unintended horizontal overflow or clipped text is present at 740, 768, 430 or 375 px.
- Long-content stress tests pass without silent truncation.
- All interactions are keyboard operable.
- All modal/popover focus behavior is correct.
- Completion and reset behavior are verified.
- Exported Rise blocks retain the same behavior as the local preview.
- Existing projects continue to open correctly.
- Production build and all automated tests pass.
- Documentation and the feature matrix are updated.

## Final response format

When finished, report:

1. Summary of changes.
2. Component-by-component status table for all 26 components.
3. Files changed.
4. Tests added or updated.
5. Commands run and results.
6. Before/after screenshots or visual-regression references.
7. Any remaining limitations requiring validation inside an actual Rise 360 Code Block.
8. Commit hashes in implementation order.

Do not state that the task is complete if tests, the production build, exported-block checks or the 375 px responsive audit are failing.
