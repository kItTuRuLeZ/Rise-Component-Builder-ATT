const field = (id, label, type, options = {}) => ({ id, label, type, ...options });

const contentFields = [
  field('title', 'Item Title', 'text', { required: true, default: 'New Item' }),
  field('content', 'Item Content', 'richtext', { required: true, default: 'Add content here.' })
];

// Applies to every component (merged into componentFields by getEditorSchema below) —
// a purely decorative background behind the block wrapper, unrelated to any
// component-specific image field (e.g. hotspots' own interactive background).
const sharedComponentFields = [
  field('blockBackgroundImage', 'Block Background Image (Optional)', 'image', {
    required: false, default: '', preferredDimensions: '1600 × 900 px or larger',
    contextLabel: 'Block Background'
  })
];

const visualIconFields = [
  field('iconImage', 'Custom Icon or Image (Optional)', 'image', { required: false, default: '', preferredDimensions: '256 × 256 px (square)' }),
  field('iconAltText', 'Icon or Image Alternative Text', 'textarea', {
    required: false, default: '', warningWhen: 'iconImage', warningUnless: 'iconDecorative',
    warningMessage: 'Add alternative text or mark the custom icon or image decorative.'
  }),
  field('iconDecorative', 'Custom Icon or Image Is Decorative', 'checkbox', { default: false }),
  field('iconFit', 'Custom Icon or Image Fit', 'select', {
    default: 'contain', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }]
  })
];

export const editorSchemas = {
  accordion: {
    itemLabel: 'Accordion Section', minItems: 1, supportsItemMedia: true,
    itemFields: [field('title', 'Section Title', 'text', { required: true, default: 'New Section', maxLength: 120 }), field('content', 'Section Content', 'richtext', { required: true, default: 'Add section content.' })]
  },
  'tab-blocks': {
    itemLabel: 'Tab', minItems: 2, supportsItemMedia: true,
    componentLabel: 'Tab Presentation & Auto-Advance',
    componentFields: [
      field('tabsAutoAdvance', 'Enable Auto-Advancing Step Mode', 'checkbox', { default: false }),
      field('tabsAutoAdvanceDelay', 'Auto-Advance Step Delay (seconds)', 'number', { required: false, default: 5, min: 1, max: 60, step: 1 })
    ],
    itemFields: [
      field('title', 'Tab Label', 'text', { required: true, default: 'New Tab', maxLength: 40 }),
      field('content', 'Tab Content', 'richtext', { required: true, default: 'Add tab content.' }),
      ...visualIconFields
    ]
  },
  'flip-cards': {
    // Items pair up two-at-a-time into one flip card each (index 0+1 = card 1's
    // front+back, 2+3 = card 2's, ...) — see components/flip-cards.js#generateHTML.
    // pairLabels makes that pairing visible in the editor's item headings instead of
    // a flat "Card Face 1, 2, 3, 4" that gives no hint two entries make one card.
    itemLabel: 'Card Face', minItems: 2, pairLabels: ['Front', 'Back'], supportsItemMedia: true,
    // Images only: a card is one big button, so audio/video controls inside it would flip the card.
    itemMediaTypes: ['image'],
    itemFields: [
      field('title', 'Face Title', 'text', { required: true, default: 'Card Face' }),
      field('content', 'Face Content', 'richtext', { required: true, default: 'Add card content.' }),
      ...visualIconFields,
      // Only read from the front face (components/flip-cards.js) — shown on both
      // faces here since itemFields apply uniformly to every item in the pair, same
      // as the icon fields above.
      field('category', 'Category / Tag (Optional — front face only, used for Study mode filtering)', 'text', { required: false, default: '', maxLength: 40 })
    ]
  },
  hotspots: {
    itemLabel: 'Hotspot Marker', minItems: 1, maxItems: 16,
    componentLabel: 'Exploration Settings & Map Background',
    componentFields: [
      field('title', 'Header Title (Optional)', 'text', { required: false, default: 'Interactive Facility & Infrastructure Explorer' }),
      field('content', 'Description / Instructions (Optional)', 'richtext', { required: false, default: 'Select the highlighted markers or use the zoom controls to inspect network components and operational zones.' }),
      field('calloutMode', 'Callout Presentation Mode', 'select', {
        default: 'tooltip',
        options: [
          { value: 'tooltip', label: 'Floating Tooltip (Popover pinned to marker)' },
          { value: 'drawer', label: 'Docked Side Drawer (Slide-out panel from right)' },
          { value: 'modal', label: 'Centered Detail Modal (Focused dialog with backdrop)' }
        ]
      }),
      field('showProgress', 'Show Exploration Progress Counter HUD', 'checkbox', { default: true }),
      field('enableZoomPan', 'Enable Interactive Zoom & Pan Controls', 'checkbox', { default: true }),
      field('autoplayAudio', 'Auto-play Narration Audio on Marker Click', 'checkbox', { default: false }),
      field('backgroundImage', 'Background Map / Schematic Image (Optional)', 'image', { required: false, default: '', preferredDimensions: '1600 × 900 px (16:9)' }),
      field('backgroundAltText', 'Background Alternative Text', 'textarea', { required: false, default: '', warningWhen: 'backgroundImage', warningUnless: 'backgroundDecorative', warningMessage: 'Add alternative text or mark the background decorative.' }),
      field('backgroundDecorative', 'Background Image Is Decorative', 'checkbox', { default: false }),
      field('backgroundFit', 'Background Image Fit', 'select', { default: 'contain', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }] }),
      field('backgroundFocalX', 'Horizontal Focal Point', 'range', { default: 50, min: 0, max: 100, step: 1, suffix: '%' }),
      field('backgroundFocalY', 'Vertical Focal Point', 'range', { default: 50, min: 0, max: 100, step: 1, suffix: '%' })
    ],
    itemFields: [
      field('title', 'Hotspot Title', 'text', { required: true, default: 'New Hotspot' }),
      field('content', 'Hotspot Content & Insights', 'richtext', { required: true, default: 'Add hotspot content and technical specifications here.' }),
      field('markerType', 'Marker Style', 'select', {
        default: 'icon',
        options: [
          { value: 'number', label: 'Numbered (1, 2, 3...)' },
          { value: 'letter', label: 'Lettered (A, B, C...)' },
          { value: 'icon', label: 'AT&T Vector Icon' }
        ]
      }),
      field('iconName', 'Marker Vector Icon (When style is Icon)', 'select', {
        default: 'info',
        options: [
          { value: 'info', label: 'Information (Circle)' },
          { value: 'help', label: 'Help / Question' },
          { value: 'alert', label: 'Alert / Warning' },
          { value: 'search', label: 'Search / Inspect' },
          { value: 'star', label: 'Star / Featured' },
          { value: 'fiber', label: 'Fiber / Optical' },
          { value: 'cloud', label: 'Cloud / Edge' },
          { value: 'shield', label: 'Shield / Security' },
          { value: 'ethernet', label: 'Hardware / Ethernet Port' },
          { value: 'play', label: 'Play / Video' },
          { value: 'check', label: 'Check / Verified' },
          { value: 'hotspot', label: 'Hotspot / Sensor' },
          { value: 'network', label: 'Network / Tower' },
          { value: 'wifi', label: 'Wireless / WiFi' }
        ]
      }),
      field('audioSourceType', 'Audio Narration Source', 'select', {
        default: 'url',
        options: [
          { value: 'upload', label: 'Uploaded Audio File' },
          { value: 'url', label: 'External Audio URL' }
        ]
      }),
      field('audioMediaId', 'Upload Audio Clip (Optional)', 'audio', { required: false, default: '' }),
      field('audioUrl', 'External Audio URL (Optional — direct .mp3 / .wav / .m4a link)', 'url', { required: false, default: '' }),
      field('audioTranscript', 'Audio Transcript (Optional)', 'textarea', { required: false, default: '' }),
      field('x', 'Horizontal Position (%)', 'range', { required: true, default: 50, min: 0, max: 100, step: 1, suffix: '%' }),
      field('y', 'Vertical Position (%)', 'range', { required: true, default: 50, min: 0, max: 100, step: 1, suffix: '%' })
    ]
  },
  'button-list': {
    itemLabel: 'Link Button', minItems: 1,
    componentLabel: 'Resource Directory Settings',
    componentFields: [
      field('searchable', 'Enable Searchable Link Directory', 'checkbox', { default: false })
    ],
    itemFields: [
      field('title', 'Button Label', 'text', { required: true, default: 'New Resource' }),
      field('content', 'Destination URL', 'url', { required: true, default: 'https://' }),
      field('category', 'Resource Category (Optional)', 'text', { required: false, default: '', maxLength: 40 }),
      field('fileType', 'File Type (e.g., PDF, DOCX, ZIP)', 'text', { required: false, default: '', maxLength: 10 }),
      field('fileSize', 'File Size (e.g., 2.4 MB)', 'text', { required: false, default: '', maxLength: 15 }),
      field('styleVariant', 'Button Style Variant', 'select', {
        default: 'primary',
        options: [
          { value: 'primary', label: 'Primary Brand (Filled Cobalt)' },
          { value: 'secondary', label: 'Secondary (Card Surface)' },
          { value: 'outline', label: 'Outline (Cobalt Border)' }
        ]
      })
    ]
  },
  'menu-list': {
    itemLabel: 'Reference Drawer', minItems: 1,
    componentLabel: 'Glossary & Reference Explorer Settings',
    componentFields: [
      field('searchable', 'Enable In-Block Search & Filter', 'checkbox', { default: false }),
      field('indexingMode', 'Indexing & Navigation Mode', 'select', {
        default: 'none',
        options: [
          { value: 'none', label: 'Standard Drawer List' },
          { value: 'alphabetical', label: 'Alphabetical Index (A–Z Jump Chips)' },
          { value: 'category', label: 'Category Filter Chips' }
        ]
      }),
      field('showQuickJump', 'Show Quick-Jump Navigation Bar', 'checkbox', { default: false })
    ],
    itemFields: [
      field('title', 'Topic or Term Name', 'text', { required: true, default: 'New Topic' }),
      field('content', 'Definition & Detailed Content', 'richtext', { required: true, default: 'Add detailed definition or sub-lesson content here.' }),
      field('category', 'Category Tag (Optional)', 'text', { required: false, default: '', maxLength: 40 }),
      field('badge', 'Highlight Badge (Optional, e.g. Core, Policy, New)', 'text', { required: false, default: '', maxLength: 20 })
    ]
  },
  'multiple-choice': {
    itemLabel: 'Answer Option', minItems: 2,
    componentFields: [
      field('mcSubmitButtonText', 'Submit Button Text', 'text', { required: false, default: 'Submit Answer', maxLength: 40 })
    ],
    itemFields: [
      field('label', 'Answer Option', 'richtext', { required: true, default: 'New option' }),
      field('content', 'Answer Feedback', 'textarea', { required: false, default: 'Add feedback for this option.' }),
      field('correct', 'Correct Answer', 'radio', { default: false, groupAcrossItems: true, requiredOne: true })
    ]
  },
  'multiple-select': {
    itemLabel: 'Answer Option', minItems: 2,
    componentLabel: 'Evaluation & Retry Settings',
    componentFields: [
      field('msPartialScoring', 'Enable Partial Credit Scoring', 'checkbox', { default: false }),
      field('msMaxAttempts', 'Maximum Attempts', 'number', { required: false, default: 1, min: 1, max: 10, step: 1 }),
      field('msAllowReset', 'Allow Retry / Try Again Action', 'checkbox', { default: false }),
      field('msFinalExplanation', 'Final Explanation (Displayed once completed)', 'richtext', { required: false, default: '' }),
      field('msSubmitButtonText', 'Submit Button Text', 'text', { required: false, default: 'Submit Answer', maxLength: 40 })
    ],
    itemFields: [
      field('label', 'Answer Option', 'richtext', { required: true, default: 'New option' }),
      field('content', 'Option Feedback', 'textarea', { required: false, default: 'Add feedback for this option.' }),
      field('remediation', 'Specific Remediation Hint (Shown on submission)', 'textarea', { required: false, default: '' }),
      field('correct', 'Correct Answer', 'checkbox', { default: false })
    ]
  },
  'sorting-activity': {
    itemLabel: 'Sortable Item', minItems: 2,
    componentLabel: 'Activity Feedback & Rules',
    componentFields: [
      field('instantFeedback', 'Enable Instant Matching Feedback on Drop', 'checkbox', { default: false }),
      field('showMistakes', 'Show Mistakes Counter HUD', 'checkbox', { default: true }),
      field('allowReset', 'Show Reset Activity Button', 'checkbox', { default: true })
    ],
    itemFields: [
      field('title', 'Item Label', 'text', { required: true, default: 'New Sortable Item' }),
      field('content', 'Item Description (Optional)', 'textarea', { required: false, default: '' }),
      field('category', 'Correct Category', 'select', { required: true, default: 'Design', options: ['Design', 'Logic'] }),
      field('explanation', 'Placement Explanation (Revealed when sorted)', 'textarea', { required: false, default: '' })
    ]
  },
  'fill-blank': {
    itemLabel: 'Blank Statement', minItems: 1,
    componentLabel: 'Validation & Clue Settings',
    componentFields: [
      field('fuzzyMatch', 'Enable 1-Character Fuzzy Typo Tolerance', 'checkbox', { default: true }),
      field('instantValidation', 'Enable Live Validation as Learner Types', 'checkbox', { default: false })
    ],
    itemFields: [
      field('title', 'Sentence with [blank]', 'richtext', { required: true, default: 'Enter a sentence containing [blank].', pattern: '\\[blank\\]', patternMessage: 'Include at least one [blank] token.' }),
      // One blank: the accepted answers, comma-separated for synonyms. Several blanks: one line per blank, in order.
      field('content', 'Accepted Answers (comma-separated for synonyms; one line per blank if the sentence has several)', 'textarea', { required: true, default: 'answer, alternative' }),
      field('hint', 'Progressive Clue / Hint (Optional)', 'textarea', { required: false, default: '' })
    ]
  },
  'vertical-timeline': {
    itemLabel: 'Timeline Event', minItems: 2, supportsItemMedia: true,
    componentLabel: 'Timeline Layout & Options',
    componentFields: [
      field('timelineCategoriesEnabled', 'Enable Category Badges & Filters', 'checkbox', { default: false }),
      field('timelineCompareMode', 'Enable 2-Column Stream Comparison (Requires 2+ categories)', 'checkbox', { default: false }),
      field('timelineCollapsibleDetails', 'Collapsible Step Accordion Details', 'checkbox', { default: false }),
      field('timelineShowProgress', 'Show Explored Progress Counter', 'checkbox', { default: false }),
      field('timelineChronologicalReveal', 'Chronological Step Reveal Locking', 'checkbox', { default: false }),
      field('timelineShowVisitedBadge', 'Show Visited Checkmark Badges', 'checkbox', { default: false }),
      field('timelineAllowReset', 'Show Reset Timeline Button', 'checkbox', { default: false })
    ],
    itemFields: [
      ...contentFields,
      field('category', 'Category / Stream (Optional)', 'text', { required: false, default: '', maxLength: 40 })
    ]
  },
  'horizontal-timeline': {
    itemLabel: 'Timeline Milestone', minItems: 2, supportsItemMedia: true,
    itemFields: [
      ...contentFields,
      field('markerLabel', 'Marker Number or Label (Optional)', 'text', { required: false, default: '', maxLength: 4 }),
      field('image', 'Milestone Image (Optional)', 'image', { required: false, default: '', preferredDimensions: '800 × 600 px' }),
      field('imageAlt', 'Image Alternative Text', 'textarea', { required: false, default: '' })
    ]
  },
  'process-flow': {
    itemLabel: 'Process Step', minItems: 2, supportsItemMedia: true,
    componentLabel: 'Workflow Navigation & Rules',
    componentFields: [
      field('processClickableNav', 'Allow Direct Clicking on Steps & Breadcrumbs', 'checkbox', { default: true }),
      field('processShowCompletionBadges', 'Show Step Completion Checkmark Badges', 'checkbox', { default: false }),
      field('processShowSummary', 'Show Final Summary Review Screen', 'checkbox', { default: false })
    ],
    itemFields: [
      ...contentFields,
      field('durationMinutes', 'Estimated Duration (min)', 'number', { required: false, default: 5, min: 0, max: 999, step: 1 }),
      field('branches', 'Branch Choices (Optional, e.g. "Path A:2, Path B:3")', 'text', { required: false, default: '' })
    ]
  },
  scenario: {
    itemLabel: 'Scenario Entry', minItems: 2, roleLabels: ['Prompt', 'Choice'],
    componentLabel: 'Scenario Scoring & Logs',
    componentFields: [
      field('scenarioShowMeter', 'Show Decision Impact Score Meter', 'checkbox', { default: false }),
      field('scenarioShowHistory', 'Show Dialogue History Review Log', 'checkbox', { default: false }),
      field('scenarioAllowReset', 'Show Restart Scenario Button', 'checkbox', { default: true })
    ],
    itemFields: [
      field('title', 'Scene or Choice Label', 'text', { required: true, default: 'New Scenario Entry' }),
      field('speaker', 'Speaker Name (Prompt only)', 'text', { required: false, default: 'Chris (Team Lead)' }),
      field('emotion', 'Emotion State', 'select', { default: 'neutral', options: ['neutral', 'happy', 'thinking', 'concerned'] }),
      field('points', 'Decision Score Delta (+/- points)', 'number', { required: false, default: 0, step: 5 }),
      field('content', 'Dialogue or Feedback', 'richtext', { required: true, default: 'Add scenario content.' })
    ]
  },
  'profile-cards': {
    itemLabel: 'Profile', minItems: 1,
    componentLabel: 'Profile Presentation',
    componentFields: [
      field('profileEnableModal', 'Enable Modal Bio Detail View', 'checkbox', { default: true })
    ],
    itemFields: [
      field('title', 'Name', 'text', { required: true, default: 'New Profile' }),
      field('roleTag', 'Role Tag / Department (Optional)', 'text', { required: false, default: 'Specialist', maxLength: 50 }),
      field('content', 'Role and Biography', 'richtext', { required: true, default: 'Add role and biography.' }),
      field('quote', 'Pull Quote / Highlight (Optional)', 'textarea', { required: false, default: '' }),
      field('contactUrl', 'Contact URL or Email (Optional)', 'text', { required: false, default: '' }),
      field('contactLabel', 'Contact Button Label (Optional)', 'text', { required: false, default: 'Connect', maxLength: 30 }),
      field('image', 'Profile Image', 'image', { required: false, default: '', preferredDimensions: '800 × 800 px (square)' }),
      field('altText', 'Profile Image Alternative Text', 'textarea', { default: '', warningWhen: 'image', warningUnless: 'decorative', warningMessage: 'Add alternative text or mark the profile image decorative.' }),
      field('decorative', 'Profile Image Is Decorative', 'checkbox', { default: false }),
      field('imageCrop', 'Profile Image Presentation', 'select', { default: 'circle', options: [{ value: 'circle', label: 'Circular' }, { value: 'square', label: 'Square' }] })
    ]
  },
  'info-grid': {
    itemLabel: 'Information Card', minItems: 1,
    itemFields: [
      field('subtitle', 'Subtitle / Eyebrow (Optional)', 'text', { required: false, default: '', maxLength: 40 }),
      field('badgeLabel', 'Badge Tag (Optional)', 'text', { required: false, default: '', maxLength: 30 }),
      field('title', 'Card Title', 'text', { required: true, default: 'Feature Key' }),
      field('metricValue', 'Metric Callout Value (Optional)', 'text', { required: false, default: '', maxLength: 20 }),
      field('metricLabel', 'Metric Callout Label (Optional)', 'text', { required: false, default: '', maxLength: 30 }),
      field('content', 'Card Description', 'richtext', { required: true, default: 'Description layout parameters.' }),
      ...visualIconFields,
      field('accentColor', 'Card Accent Color', 'color', { required: false, default: '#009FDB' })
    ]
  },
  'pricing-comparison': {
    itemLabel: 'Comparison Option', minItems: 2,
    componentLabel: 'Comparison Layout',
    componentFields: [
      field('pricingMatrixMode', 'Display as Matrix Table Checklist', 'checkbox', { default: false })
    ],
    itemFields: [
      field('title', 'Option Title', 'text', { required: true, default: 'Service Plan' }),
      field('content', 'Features (separate with • , add tooltips with [info: text])', 'richtext', { required: true, default: 'Feature 1 • Feature 2 [info: Tooltip details]' }),
      field('highlighted', 'Highlight This Option', 'checkbox', { default: false }),
      field('actionUrl', 'Action URL', 'url', { required: false, default: '' })
    ]
  },
  'audio-player': {
    itemLabel: 'Audio Track', minItems: 1, maxItems: 1,
    componentLabel: 'Presentation, Chapters, Transcript & Progress',
    componentFields: [
      field('presentationMode', 'Presentation Mode', 'select', {
        default: 'learning',
        options: [
          { value: 'compact', label: 'Compact — short clips or pronunciations' },
          { value: 'learning', label: 'Learning (default) — chapters, transcript, progress' },
          { value: 'podcast', label: 'Podcast — longer audio, full episode layout' }
        ]
      }),
      field('chapters', 'Chapters (Optional) — one per line: MM:SS or HH:MM:SS | Title | Description (optional)', 'textarea', { required: false, default: '' }),
      field('transcriptSegments', 'Synchronized Transcript (Optional) — one per line: MM:SS | Speaker (optional, may be blank) | Segment text. Takes priority over the plain Transcript below when both are set.', 'textarea', { required: false, default: '' }),
      field('progressPersistence', 'Remember Playback Position on This Device (local progress only — does not set Rise/LMS completion)', 'checkbox', { default: true }),
      field('takeaways', 'Key Takeaways (Optional) — one per line', 'textarea', { required: false, default: '' }),
      field('takeawaysVisibility', 'Key Takeaways Visibility', 'select', {
        default: 'always',
        options: [
          { value: 'always', label: 'Always visible' },
          { value: 'afterCompletion', label: 'Reveal after audio completion' }
        ]
      })
    ],
    itemFields: [
      field('title', 'Audio Title', 'text', { required: true, default: 'New Audio Track' }),
      field('seriesLabel', 'Series / Eyebrow Label (Optional — shown above the title in Podcast mode)', 'text', { required: false, default: '', maxLength: 60 }),
      field('description', 'Description (Optional — shown in Learning and Podcast modes)', 'textarea', { required: false, default: '' }),
      field('content', 'Audio Source', 'audio', { required: true, default: '' }),
      ...visualIconFields,
      field('transcript', 'Plain Transcript (Optional — shown as a fallback when no Synchronized Transcript is set above)', 'richtext', { required: false, default: '', warningWhen: 'content', warningUnlessAny: ['transcript'], warningMessage: 'Instructional audio should include a transcript.' })
    ]
  },
  'video-frame': {
    itemLabel: 'Video', minItems: 1, maxItems: 1,
    componentLabel: 'Chapters, Transcript & Progress',
    componentFields: [
      field('chapters', 'Chapters (Optional) — one per line: MM:SS or HH:MM:SS | Title | Description (optional)', 'textarea', { required: false, default: '' }),
      field('transcriptSegments', 'Synchronized Transcript (Optional) — one per line: MM:SS | Speaker (optional, may be blank) | Segment text. Takes priority over the plain Video Transcript below when both are set.', 'textarea', { required: false, default: '' }),
      field('progressPersistence', 'Remember Playback Position on This Device (local progress only — does not set Rise/LMS completion)', 'checkbox', { default: true }),
      field('takeaways', 'Key Takeaways (Optional) — one per line', 'textarea', { required: false, default: '' }),
      field('takeawaysVisibility', 'Key Takeaways Visibility', 'select', {
        default: 'always',
        options: [
          { value: 'always', label: 'Always visible' },
          { value: 'afterCompletion', label: 'Reveal after video completion' }
        ]
      })
    ],
    itemFields: [
      field('title', 'Accessible Video Title', 'text', { required: true, default: 'New Video' }),
      field('content', 'Video Source', 'video', { required: true, default: '' }),
      field('posterImage', 'Poster Image', 'image', { required: false, default: '', preferredDimensions: '1280 × 720 px (16:9)' }),
      field('posterAltText', 'Poster Alternative Text', 'textarea', { default: '', warningWhen: 'posterImage', warningUnless: 'posterDecorative', warningMessage: 'Add poster alternative text or mark it decorative.' }),
      field('posterDecorative', 'Poster Is Decorative', 'checkbox', { default: false }),
      field('captionsUrl', 'Captions (WebVTT)', 'url', { required: false, default: '', uploadKind: 'captions', warningWhen: 'content', warningUnlessAny: ['captionsUrl', 'transcript'], warningMessage: 'Provide captions or a transcript for this video.' }),
      field('transcript', 'Plain Video Transcript (Optional — fallback shown when no Synchronized Transcript is set above)', 'richtext', { required: false, default: '', warningWhen: 'content', warningUnlessAny: ['captionsUrl', 'transcript'], warningMessage: 'Provide captions or a transcript for this video.' }),
      field('audioDescription', 'Audio Description or Visual Transcript', 'richtext', { required: false, default: '' })
    ]
  },
  'image-gallery': {
    itemLabel: 'Gallery Image', minItems: 1,
    componentLabel: 'Gallery Presentation',
    componentFields: [
      field('galleryLayout', 'Gallery Layout Mode', 'select', {
        default: 'grid',
        options: [
          { value: 'grid', label: 'Uniform Grid' },
          { value: 'masonry', label: 'Pinterest Masonry' }
        ]
      })
    ],
    itemFields: [
      field('content', 'Image Source', 'image', { required: true, default: '', multiple: true, preferredDimensions: '1600 × 1200 px (4:3)' }),
      field('title', 'Image Title', 'text', { required: true, default: 'New Image' }),
      field('category', 'Category Tag (Optional)', 'text', { required: false, default: '', maxLength: 40 }),
      field('caption', 'Image Caption', 'textarea', { required: false, default: '' }),
      field('altText', 'Alternative Text', 'textarea', { required: false, default: '', warningWhen: 'content', warningUnless: 'decorative', warningMessage: 'Add alternative text or mark this image decorative.' }),
      field('decorative', 'Image Is Decorative', 'checkbox', { default: false }),
      field('imageFit', 'Image Fit', 'select', { default: 'cover', options: [{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }] })
    ]
  },
  'interactive-video': {
    itemLabel: 'Interaction Marker', minItems: 0, componentLabel: 'Video Details',
    componentFields: [
      field('title', 'Video Block Title', 'text', { required: true, default: 'Interactive Video', maxLength: 120 }),
      field('introduction', 'Introduction (Optional)', 'richtext', { required: false, default: '' }),
      field('videoSourceType', 'Video Source', 'select', {
        default: 'url', options: [{ value: 'upload', label: 'Uploaded video' }, { value: 'url', label: 'External direct video URL' }]
      }),
      field('videoMediaId', 'Upload Video', 'video', { required: false, default: '' }),
      field('videoUrl', 'External Video URL (direct .mp4/.webm file, not a YouTube/Vimeo page)', 'url', { required: false, default: 'https://www.w3schools.com/html/mov_bbb.mp4' }),
      field('posterImage', 'Poster Image (Optional)', 'image', { required: false, default: '', preferredDimensions: '1280 × 720 px (16:9)' }),
      field('posterAltText', 'Poster Alternative Text', 'textarea', {
        required: false, default: '', warningWhen: 'posterImage', warningUnless: 'posterDecorative',
        warningMessage: 'Add poster alternative text or mark it decorative.'
      }),
      field('posterDecorative', 'Poster Is Decorative', 'checkbox', { default: false }),
      field('captionsUrl', 'Captions (WebVTT)', 'url', { required: false, default: '', uploadKind: 'captions' }),
      field('captionsLabel', 'Captions Label', 'text', { required: false, default: 'English', maxLength: 40 }),
      field('transcript', 'Transcript (Optional)', 'richtext', { required: false, default: '' })
    ],
    itemFields: [
      field('type', 'Interaction Type', 'select', {
        required: true, default: 'information', options: [{ value: 'information', label: 'Information' }, { value: 'multipleChoice', label: 'Multiple Choice' }]
      }),
      field('timestamp', 'Timestamp (seconds)', 'number', { required: true, default: 0, min: 0, step: 1 }),
      field('title', 'Marker Title', 'text', { required: true, default: 'New Marker', maxLength: 80 }),
      field('required', 'Required (learner must complete this to finish the video)', 'checkbox', { default: false }),
      field('pauseVideo', 'Pause Video At This Marker', 'checkbox', { default: true }),
      field('continueButtonLabel', 'Continue Button Label', 'text', { required: false, default: 'Continue', maxLength: 30 }),
      field('body', 'Information Body (Information type only)', 'richtext', { required: false, default: '' }),
      field('question', 'Question (Multiple Choice type only)', 'richtext', { required: false, default: '' }),
      field('answer1Label', 'Answer 1 (Multiple Choice type only)', 'text', { required: false, default: '', maxLength: 200 }),
      field('answer2Label', 'Answer 2 (Multiple Choice type only)', 'text', { required: false, default: '', maxLength: 200 }),
      field('answer3Label', 'Answer 3 (Multiple Choice type only, optional)', 'text', { required: false, default: '', maxLength: 200 }),
      field('answer4Label', 'Answer 4 (Multiple Choice type only, optional)', 'text', { required: false, default: '', maxLength: 200 }),
      field('correctAnswerIndex', 'Correct Answer (Multiple Choice type only)', 'select', { default: '1', options: ['1', '2', '3', '4'] }),
      field('answer1Feedback', 'Feedback for Answer 1 (Optional)', 'textarea', { required: false, default: '' }),
      field('answer2Feedback', 'Feedback for Answer 2 (Optional)', 'textarea', { required: false, default: '' }),
      field('answer3Feedback', 'Feedback for Answer 3 (Optional)', 'textarea', { required: false, default: '' }),
      field('answer4Feedback', 'Feedback for Answer 4 (Optional)', 'textarea', { required: false, default: '' }),
      field('generalCorrectFeedback', 'General Correct Feedback (Multiple Choice type only)', 'textarea', { required: false, default: '' }),
      field('generalIncorrectFeedback', 'General Incorrect Feedback (Multiple Choice type only)', 'textarea', { required: false, default: '' }),
      field('hint', 'Hint (Multiple Choice type only, optional)', 'textarea', { required: false, default: '' }),
      field('maxAttempts', 'Maximum Attempts (Multiple Choice type only)', 'number', { required: false, default: 1, min: 1, max: 5, step: 1 }),
      field('showCorrectAfterFinal', 'Reveal Correct Answer After Final Attempt (Multiple Choice type only)', 'checkbox', { default: false })
    ]
  },
  'comparison-slider': {
    itemLabel: 'Comparison Slide', minItems: 1, maxItems: 1,
    componentLabel: 'Presentation & Instructions',
    componentFields: [
      field('title', 'Header Title', 'text', { required: false, default: '5G Infrastructure Modernization' }),
      field('content', 'Description / Instructions', 'richtext', { required: false, default: 'Drag the slider handle or use the arrow keys to compare network capabilities before and after fiber modernization.' }),
      field('orientation', 'Split Orientation', 'select', {
        default: 'horizontal',
        options: [
          { value: 'horizontal', label: 'Horizontal Split (Left / Right)' },
          { value: 'vertical', label: 'Vertical Split (Top / Bottom)' }
        ]
      }),
      field('aspectRatio', 'Frame Aspect Ratio', 'select', {
        default: '16/9',
        options: [
          { value: '16/9', label: '16:9 (Widescreen Landscape)' },
          { value: '4/3', label: '4:3 (Standard Landscape)' },
          { value: '3/2', label: '3:2 (Classic Photo)' },
          { value: '1/1', label: '1:1 (Square)' },
          { value: '3/4', label: '3:4 (Standard Portrait)' },
          { value: '9/16', label: '9:16 (Tall / Mobile Portrait)' },
          { value: '2/1', label: '2:1 (Ultra-Wide)' }
        ]
      }),
      field('imageFit', 'Image Fit & Scaling', 'select', {
        default: 'cover',
        options: [
          { value: 'cover', label: 'Cover (Fill frame, crop excess)' },
          { value: 'contain', label: 'Contain (Fit entire image, no crop)' }
        ]
      }),
      field('stageBgColor', 'Image Background Fill Color', 'color', {
        required: false,
        default: '#FFFFFF'
      }),
      field('initialPosition', 'Initial Slider Position (%)', 'range', { default: 50, min: 0, max: 100, step: 1, suffix: '%' }),
      field('showLabels', 'Show Floating Before/After Badges', 'checkbox', { default: true })
    ],
    itemFields: [
      field('beforeLabel', 'Before Label', 'text', { required: true, default: 'Before (Legacy Copper)' }),
      field('afterLabel', 'After Label', 'text', { required: true, default: 'After (Fiber Optic 5G)' }),
      field('beforeImage', 'Before Image', 'image', { required: false, default: '', preferredDimensions: '1600 × 900 px (16:9)' }),
      field('beforeAltText', 'Before Image Alternative Text', 'textarea', { default: '' }),
      field('afterImage', 'After Image', 'image', { required: false, default: '', preferredDimensions: '1600 × 900 px (16:9)' }),
      field('afterAltText', 'After Image Alternative Text', 'textarea', { default: '' }),
      field('imageFit', 'Item Image Fit (Override)', 'select', {
        default: 'cover',
        options: [
          { value: 'cover', label: 'Cover (Fill frame)' },
          { value: 'contain', label: 'Contain (Fit entire image)' }
        ]
      })
    ]
  },
  'dial-gauge': {
    itemLabel: 'Operating Tier', minItems: 1, maxItems: 6,
    componentLabel: 'Gauge Settings & Scale',
    componentFields: [
      field('title', 'Header Title', 'text', { required: false, default: '5G Network Throughput & Latency Explorer' }),
      field('content', 'Description / Instructions', 'richtext', { required: false, default: 'Adjust the metric dial or select a scenario below to explore operational characteristics across network operating tiers.' }),
      field('unit', 'Metric Unit', 'text', { required: false, default: 'Mbps', maxLength: 15 }),
      field('minValue', 'Minimum Scale Value', 'number', { required: true, default: 0, step: 1 }),
      field('maxValue', 'Maximum Scale Value', 'number', { required: true, default: 1000, step: 1 }),
      field('initialValue', 'Initial Value', 'number', { required: true, default: 450, step: 1 }),
      field('step', 'Step Increment', 'number', { required: false, default: 10, min: 1, step: 1 })
    ],
    itemFields: [
      field('title', 'Tier Title', 'text', { required: true, default: 'New Operating Tier', maxLength: 80 }),
      field('rangeMin', 'Range Minimum', 'number', { required: true, default: 0, step: 1 }),
      field('rangeMax', 'Range Maximum', 'number', { required: true, default: 100, step: 1 }),
      field('badgeLabel', 'Badge Label', 'text', { required: false, default: 'Standard Tier', maxLength: 30 }),
      field('content', 'Tier Insight & Impact Details', 'richtext', { required: true, default: 'Add tier performance and operational insights here.' })
    ]
  },
  'callout-box': {
    itemLabel: 'Callout Notice', minItems: 1, maxItems: 8,
    componentLabel: 'Matrix Layout & Options',
    componentFields: [
      field('title', 'Header Title', 'text', { required: false, default: 'Security & Operational Directives' }),
      field('content', 'Description / Instructions', 'richtext', { required: false, default: 'Review the critical operational standards and security compliance guidelines before initiating network maintenance.' }),
      field('layout', 'Matrix Layout', 'select', {
        default: 'grid-2',
        options: [
          { value: 'grid-2', label: '2-Column Grid' },
          { value: 'grid-3', label: '3-Column Grid' },
          { value: 'stacked', label: 'Stacked Banners' }
        ]
      }),
      field('requireAcknowledgment', 'Require Learner Acknowledgment', 'checkbox', { default: true })
    ],
    itemFields: [
      field('title', 'Notice Title', 'text', { required: true, default: 'New Callout Title', maxLength: 100 }),
      field('tone', 'Callout Tone / Icon Style', 'select', {
        default: 'info',
        options: [
          { value: 'info', label: 'Information (AT&T Blue)' },
          { value: 'primary', label: 'Brand Directive (Cobalt)' },
          { value: 'warning', label: 'Safety / Caution (Warning)' },
          { value: 'tip', label: 'Pro Tip (AT&T Green)' },
          { value: 'security', label: 'Security / Compliance (Shield)' }
        ]
      }),
      field('badgeLabel', 'Badge Tag (Optional)', 'text', { required: false, default: '', maxLength: 30 }),
      field('content', 'Notice Description', 'richtext', { required: true, default: 'Add callout notice details here.' })
    ]
  },
  'card-carousel': {
    itemLabel: 'Carousel Card', minItems: 1, maxItems: 10,
    componentLabel: 'Carousel Settings & Controls',
    componentFields: [
      field('title', 'Header Title', 'text', { required: false, default: '5G Enterprise Solutions Portfolio' }),
      field('content', 'Description / Instructions', 'richtext', { required: false, default: 'Explore how AT&T 5G and dedicated cellular infrastructure empower modern enterprise operations.' }),
      field('cardsPerView', 'Visible Cards Density', 'select', {
        default: '1',
        options: [
          { value: '1', label: '1 Card (Single - Default)' },
          { value: '2', label: '2 Cards (Dual View)' },
          { value: '3', label: '3 Cards (Triple View)' }
        ]
      }),
      field('showPaginationDots', 'Show Pagination Dot Pills', 'checkbox', { default: true }),
      field('loop', 'Loop Carousel Continuously', 'checkbox', { default: false })
    ],
    itemFields: [
      field('title', 'Card Title', 'text', { required: true, default: 'New Card Title', maxLength: 100 }),
      field('category', 'Category Tag (Optional)', 'text', { required: false, default: '', maxLength: 40 }),
      field('image', 'Featured Image (Optional)', 'image', { required: false, default: '', preferredDimensions: '800 × 450 px (16:9)' }),
      field('altText', 'Image Alternative Text', 'textarea', { default: '' }),
      field('content', 'Card Content & Details', 'richtext', { required: true, default: 'Add card content here.' }),
      field('buttonLabel', 'Action Button Label (Optional)', 'text', { required: false, default: '', maxLength: 30 }),
      field('buttonUrl', 'Action Button URL (Optional)', 'url', { required: false, default: '' })
    ]
  },
  'confidence-matrix': {
    itemLabel: 'Skill Competency', minItems: 1, maxItems: 12,
    componentLabel: 'Self-Assessment Settings',
    componentFields: [
      field('title', 'Header Title', 'text', { required: false, default: 'Engineering & Cloud Architecture Self-Assessment' }),
      field('content', 'Description / Instructions', 'richtext', { required: false, default: 'Evaluate your technical proficiency and execution confidence across core enterprise domains to identify strengths and personalized growth pathways.' }),
      field('showBreakdown', 'Show Diagnostic Strengths & Growth Panel', 'checkbox', { default: true })
    ],
    itemFields: [
      field('title', 'Competency Title', 'text', { required: true, default: 'New Competency Title', maxLength: 100 }),
      field('category', 'Domain Category (Optional)', 'text', { required: false, default: 'General', maxLength: 40 }),
      field('content', 'Competency Criteria & Expectations', 'richtext', { required: true, default: 'Add detailed competency expectations and execution criteria here.' })
    ]
  }
};

export function getEditorSchema(componentId) {
  const schema = editorSchemas[componentId] || { itemLabel: 'Item', minItems: 1, itemFields: contentFields };
  return {
    ...schema,
    componentLabel: schema.componentLabel || 'Block Background',
    componentFields: [...sharedComponentFields, ...(schema.componentFields || [])]
  };
}

export function createDefaultItem(schema) {
  return Object.fromEntries(schema.itemFields.map(itemField => [itemField.id, structuredClone(itemField.default ?? '')]));
}
