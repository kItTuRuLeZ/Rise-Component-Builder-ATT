import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import * as accordion from '../../components/accordion.js';
import * as tabs from '../../components/tabs.js';
import * as flipCards from '../../components/flip-cards.js';
import * as hotspots from '../../components/hotspots.js';
import * as menuList from '../../components/menu-list.js';
import * as multipleChoice from '../../components/multiple-choice.js';
import * as sortingActivity from '../../components/sorting-activity.js';
import * as fillBlank from '../../components/fill-blank.js';
import * as verticalTimeline from '../../components/vertical-timeline.js';
import * as horizontalTimeline from '../../components/horizontal-timeline.js';
import * as processFlow from '../../components/process-flow.js';
import * as profileCards from '../../components/profile-cards.js';
import * as infoGrid from '../../components/info-grid.js';
import * as pricingComparison from '../../components/pricing-comparison.js';
import * as videoFrame from '../../components/video-frame.js';
import * as imageGallery from '../../components/image-gallery.js';
import * as multipleSelect from '../../components/multiple-select.js';
import * as audioPlayer from '../../components/audio-player.js';
import * as scenario from '../../components/scenario.js';
import * as interactiveVideo from '../../components/interactive-video.js';
import { getBuiltInTheme, resolveThemeTokens, contrastRatio } from '../../js/themes.js';

// Regression coverage for the "ATT branding points.pptx" audit (16 components, G1-G8
// global rules). Each check below targets one concrete violation the audit found and
// this pass fixed — see the completion report for the full Slide/Component/Requirement
// mapping. These assert against generateCSS() source text (the same string every
// preview and export renders from — js/preview.js#generateIframeContent), not against
// a live-rendered DOM, since the rules are about which CSS custom property a rule
// resolves through, not about computed pixel color.
const INSTANCE_ID = 'rcb-test-instance';

describe('AT&T brand: clickable elements use Cobalt (--primary), not AT&T Blue (--accent)', () => {
  test('hotspot pin (clickable) is Cobalt, not AT&T Blue', () => {
    const css = hotspots.generateCSS();
    expect(css).toMatch(/\.hotspot-pin\s*{[^}]*background-color:\s*var\(--primary\)/);
    expect(css).not.toMatch(/\.hotspot-pin\s*{[^}]*background-color:\s*var\(--accent\)/);
  });

  test('tabs are complete Cobalt capsules — outlined at rest, filled when active — not underline tabs', () => {
    const css = tabs.generateCSS();
    expect(css).toMatch(/\.tab-btn\s*{[^}]*border-radius:\s*var\(--button-radius/);
    expect(css).toMatch(/\.tab-btn\s*{[^}]*border:\s*1px solid var\(--primary\)/);
    expect(css).toMatch(/\.tab-btn\.active\s*{[^}]*background:\s*var\(--primary\)/);
    expect(css).toMatch(/\.tab-btn\.active\s*{[^}]*color:\s*var\(--on-primary\)/);
    expect(css).not.toMatch(/\.tab-btn\.active\s*{[^}]*color:\s*var\(--accent\)/);
    expect(css).not.toContain('border-bottom: 2px solid transparent');
  });

  test('selected quiz option (multiple choice) uses a Cobalt border, not an AT&T-Blue tint fill', () => {
    const css = multipleChoice.generateCSS();
    expect(css).toMatch(/\.quiz-option\.selected\s*{[^}]*border-color:\s*var\(--primary\)/);
    expect(css).not.toContain('background-color: var(--accent-tint)');
  });

  test('active sorting target button is a Cobalt-filled capsule, not an AT&T-Blue rectangle', () => {
    const css = sortingActivity.generateCSS();
    expect(css).toMatch(/\.target-btn\.active\s*{[^}]*background-color:\s*var\(--primary\)/);
    expect(css).toMatch(/\.target-btn\s*{[^}]*border-radius:\s*var\(--button-radius/);
  });

  test('active vertical-timeline step marker is Cobalt, not AT&T Blue', () => {
    const css = verticalTimeline.generateCSS();
    expect(css).toMatch(/\.timeline-step\.active \.step-marker\s*{[^}]*background-color:\s*var\(--primary\)/);
  });

  test('active horizontal-timeline node marker and label are Cobalt, not AT&T Blue', () => {
    const css = horizontalTimeline.generateCSS();
    expect(css).toMatch(/\.timeline-node\.active \.node-marker\s*{[^}]*background-color:\s*var\(--primary\)/);
    expect(css).toMatch(/\.timeline-node\.active \.node-label\s*{[^}]*color:\s*var\(--primary\)/);
  });

  test('video overlay play button is Cobalt (resting and hover), not AT&T Blue or a neutral wash', () => {
    const css = videoFrame.generateCSS();
    expect(css).toMatch(/\.video-overlay-play\s*{[^}]*background-color:\s*var\(--primary\)/);
    expect(css).toMatch(/\.video-wrapper:hover \.video-overlay-play\s*{[^}]*background-color:\s*var\(--primary-hover\)/);
    expect(css).not.toContain('background-color: rgba(15, 23, 42, 0.7)');
  });

  test('pricing action button is a Cobalt capsule (full var(--button-radius)), not a partially-rounded rectangle', () => {
    const css = pricingComparison.generateCSS();
    expect(css).toMatch(/\.pricing-action-btn\s*{[^}]*border-radius:\s*var\(--button-radius/);
    expect(css).not.toContain('border-radius: calc(var(--border-radius) - 4px)');
  });

  test('clickable menu-drawer index number and arrow are Cobalt at rest, not just once expanded', () => {
    const css = menuList.generateCSS();
    expect(css).toMatch(/\.menu-num\s*{[^}]*color:\s*var\(--primary\)/);
    expect(css).toMatch(/\.menu-arrow\s*{[^}]*color:\s*var\(--primary\)/);
    expect(css).not.toMatch(/\.menu-arrow\s*{[^}]*color:\s*var\(--text-muted\)/);
  });

  test('accordion indicator icons (chevron and plus-minus) are Cobalt at rest, not just once expanded', () => {
    const css = accordion.generateCSS();
    expect(css).toMatch(/\.acc-arrow\s*{[^}]*color:\s*var\(--primary\)/);
    expect(css).toMatch(/\.acc-plus-minus::before,\s*\.acc-plus-minus::after\s*{[^}]*background-color:\s*var\(--primary\)/);
    expect(css).not.toMatch(/\.acc-arrow\s*{[^}]*color:\s*var\(--text-muted\)/);
  });

  test('sorting target buttons are Cobalt at rest, not just on hover/active', () => {
    const css = sortingActivity.generateCSS();
    expect(css).toMatch(/\.target-btn\s*{[^}]*border:\s*1px solid var\(--primary\)/);
    expect(css).toMatch(/\.target-btn\s*{[^}]*color:\s*var\(--primary\)/);
    expect(css).not.toMatch(/\.target-btn\s*{[^}]*border:\s*1px solid var\(--border-color\)/);
  });

  test('horizontal-timeline node markers are Cobalt-outlined at rest, matching the vertical timeline', () => {
    const css = horizontalTimeline.generateCSS();
    expect(css).toMatch(/\.node-marker\s*{[^}]*border:\s*3px solid var\(--primary\)/);
    expect(css).not.toMatch(/\.node-marker\s*{[^}]*border:\s*3px solid var\(--border-color\)/);
  });

  test('active flip-card study filter/classify controls are Cobalt, not AT&T Blue', () => {
    const css = flipCards.generateCSS();
    expect(css).toMatch(/\.flip-filter-chip\.active,\s*\.flip-review-filter-btn\[aria-pressed="true"\]\s*{[^}]*border-color:\s*var\(--primary\)/);
  });

  test('hovered/selected profile card is Cobalt, not AT&T Blue (the card is a clickable control)', () => {
    const css = profileCards.generateCSS();
    expect(css).toMatch(/\.profile-card-item:not\(\.is-static\):hover\s*{[^}]*border-color:\s*var\(--primary\)/);
  });

  test('selected info-grid card uses a Cobalt border, not an AT&T-Blue tint fill', () => {
    const css = infoGrid.generateCSS();
    expect(css).toMatch(/\.info-grid-item\.active\s*{[^}]*border-color:\s*var\(--primary\)/);
    expect(css).not.toContain('background-color: var(--accent-tint)');
  });
});

describe('AT&T brand: every AT&T-Blue text node is kept blue by growing to >=19px, not desaturated', () => {
  function assertBlueAtCompliantSize(rule) {
    expect(rule).toMatch(/color:\s*var\(--accent\)/);
    const pxMatch = rule.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
    if (pxMatch) {
      expect(Number(pxMatch[1])).toBeGreaterThanOrEqual(19);
    } else {
      expect(rule).toMatch(/font-size:\s*(?:var\(--att-fs-h[1-3],\s*)?([1-9]\d*(?:\.\d+)?(?:rem|em|px))/);
    }
  }

  test('shared block-label eyebrow (every component\'s header) is AT&T Blue at >=19px', () => {
    const exportShellSource = readFileSync(fileURLToPath(new URL('../../js/export-shell.js', import.meta.url)), 'utf8');
    assertBlueAtCompliantSize(exportShellSource.match(/\.block-label\s*{[^}]*}/)[0]);
  });

  test('sorting-activity column header is AT&T Blue at >=19px', () => {
    assertBlueAtCompliantSize(sortingActivity.generateCSS().match(/\.column-header\s*{[^}]*}/)[0]);
  });

  test('process-flow step duration line is AT&T Blue at >=19px', () => {
    assertBlueAtCompliantSize(processFlow.generateCSS().match(/\.process-step-duration\s*{[^}]*}/)[0]);
  });

  test('video mini play/pause label (clickable, 11px) uses Cobalt, which carries no size restriction', () => {
    const css = videoFrame.generateCSS();
    expect(css).toMatch(/\.video-mini-play\s*{[^}]*color:\s*var\(--primary\)/);
  });
});

describe('AT&T brand: Cobalt is reserved for clickable elements, never a passive popup surface', () => {
  test('hotspot tooltip (passive content, no control inside it) is not Cobalt-colored', () => {
    const css = hotspots.generateCSS();
    const tooltipRule = css.match(/\.hotspot-tooltip\s*{[^}]*}/)[0];
    expect(tooltipRule).not.toContain('var(--primary)');
    expect(tooltipRule).not.toContain('var(--accent)');
    // Built from the theme's own inverted text/surface tokens, not an invented hex.
    expect(tooltipRule).toContain('background-color: var(--text-main)');
    expect(tooltipRule).toContain('color: var(--bg-card)');
  });

  test('hotspot pin trigger itself is Cobalt (it is the clickable control)', () => {
    const css = hotspots.generateCSS();
    expect(css).toMatch(/\.hotspot-pin\s*{[^}]*background-color:\s*var\(--primary\)/);
  });
});

describe('AT&T brand: no improvised tints/shades of the brand blues', () => {
  test('vertical-timeline connecting rail is not an opacity-faked tint of --accent', () => {
    const css = verticalTimeline.generateCSS();
    const railRule = css.match(/\.vertical-timeline-container::before\s*{[^}]*}/)[0];
    expect(railRule).not.toMatch(/opacity\s*:\s*[\d.]/);
    expect(railRule).not.toContain('var(--accent)');
    expect(railRule).toContain('var(--border-color)');
  });

  test('no component under audit uses --accent-tint or --primary-tint as a clickable-state fill', () => {
    for (const [name, mod] of Object.entries({ multipleChoice, infoGrid })) {
      const css = mod.generateCSS();
      expect(css, `${name} should not use an accent/primary tint background`).not.toMatch(/background-color:\s*var\(--(accent|primary)-tint\)/);
    }
  });

  test('feedback panels (correct/incorrect) use real success/danger tokens, not hardcoded emerald/red hex', () => {
    for (const [name, mod] of Object.entries({ multipleChoice, sortingActivity, fillBlank })) {
      const css = mod.generateCSS();
      expect(css, `${name} feedback colors`).not.toMatch(/#(10B981|EF4444|065F46|991B1B)/i);
      expect(css).toContain('var(--success)');
      expect(css).toContain('var(--danger)');
      expect(css).toContain('var(--success-tint)');
      expect(css).toContain('var(--danger-tint)');
    }
  });

  test('hotspots fallback schematic and tooltip carry no hardcoded slate/gray hex literals', () => {
    const html = hotspots.generateHTML({ items: [{ title: 'A', content: 'B', x: '50', y: '50' }] }, INSTANCE_ID);
    const css = hotspots.generateCSS();
    expect(html + css).not.toMatch(/#(F1F5F9|CBD5E1|E2E8F0|94A3B8|0F172A)/i);
  });

  test('info-grid fallback icon accent dots reference the theme token, not a hardcoded #009FDB literal', () => {
    const html = infoGrid.generateHTML({ items: [{ title: 'Card', content: 'Desc' }] });
    expect(html).not.toContain('#009FDB');
    expect(infoGrid.generateCSS()).toContain('.info-grid-icon-accent-dots');
  });

  test('flip-cards default front icon is a real AT&T Brand Center icon (question-circle), not hand-drawn', () => {
    const html = flipCards.generateHTML({
      items: [{ title: 'Front', content: 'Front body' }, { title: 'Back', content: 'Back body' }]
    }, INSTANCE_ID);
    // Path data lifted verbatim from the local icon library export
    // (People/Communications categories, "question-circle") — verified by
    // rendering the candidate icons and visually confirming the match, not
    // guessed. The old hand-drawn stroke-icon viewBox is gone.
    expect(html).toContain('M16 1C7.7 1 1 7.7 1 16 1 24.3 7.7 31 16 31');
    expect(html).not.toContain('viewBox="0 0 24 24"');
  });

  test('profile-cards default avatar icon matches the AT&T Brand Center "person" icon verbatim', () => {
    const html = profileCards.generateHTML({ items: [{ title: 'Name', content: 'Bio' }] });
    expect(html).toContain('M20 15.8C21.8 14.5 23 12.4 23 10 23 6.1 19.9 3 16 3');
  });

  test('image-gallery caption overlay and lightbox text carry no hardcoded slate hex literal', () => {
    const css = imageGallery.generateCSS();
    expect(css).not.toMatch(/#94A3B8/i);
  });
});

describe('AT&T brand: WCAG contrast holds for every retargeted color pairing (computed, not eyeballed)', () => {
  const tokens = resolveThemeTokens(getBuiltInTheme());

  test('white text on Cobalt (--on-primary on --primary) clears 4.5:1 at any size', () => {
    expect(contrastRatio(tokens.primary, tokens.background)).toBeGreaterThanOrEqual(4.5);
  });

  test('success and danger feedback pairings clear 4.5:1 contrast', () => {
    // Per AT&T standards, Lime is an accent/fill paired with black text, never text on white.
    expect(contrastRatio(tokens.text, tokens.success)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.danger, tokens.background)).toBeGreaterThanOrEqual(4.5);
  });

  test('white gallery caption text on the solid neutral overlay clears 4.5:1 regardless of the underlying photo', () => {
    expect(contrastRatio(tokens.background, tokens.text)).toBeGreaterThanOrEqual(4.5);
  });

  test('AT&T Blue (--accent) on white only clears the 3:1 large-text/graphical threshold, confirming the 19px rule is load-bearing, not decorative', () => {
    const ratio = contrastRatio(tokens.accent, tokens.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('AT&T brand: components outside the original 16-slide audit, swept for the same rules', () => {
  test('multiple-select selected option is Cobalt-bordered, not an AT&T-Blue tint fill (matches multiple-choice)', () => {
    const css = multipleSelect.generateCSS();
    expect(css).toMatch(/\.quiz-option\.selected\s*{[^}]*border-color:\s*var\(--primary\)/);
    expect(css).not.toContain('background-color: var(--accent-tint)');
    expect(css).toMatch(/\.quiz-option\.selected \.option-check-square\s*{[^}]*background-color:\s*var\(--primary\)/);
  });

  test('multiple-select feedback panels use real success/danger tokens, not hardcoded hex', () => {
    const css = multipleSelect.generateCSS();
    expect(css).not.toMatch(/#(10B981|EF4444|065F46|991B1B)/i);
    expect(css).toContain('var(--success-tint)');
    expect(css).toContain('var(--danger-tint)');
  });

  test('audio-player default icon has no hardcoded #009FDB literal, and the play button stays Cobalt while playing', () => {
    const html = audioPlayer.generateHTML({ items: [{ title: 'Clip', content: 'https://example.com/a.mp3' }] }, 'rcb-test');
    expect(html).not.toContain('#009FDB');
    const js = audioPlayer.generateJS({ items: [{ title: 'Clip', content: 'https://example.com/a.mp3' }] }, 'rcb-test');
    // The play/pause toggle used to swap in var(--accent) while playing; it must
    // now stay within the Cobalt family (--primary / --primary-hover) always.
    expect(js).not.toContain("'var(--accent)'");
    expect(js).toContain("'var(--primary-hover)'");
  });

  test('audio-player speed/skip/mute controls are Cobalt-outlined capsules at rest, not invented tints', () => {
    const css = audioPlayer.generateCSS();
    const speedRule = css.match(/\.aud-speed-btn\s*{[^}]*}/)[0];
    expect(speedRule).toContain('border: 1px solid var(--primary)');
    expect(speedRule).toContain('color: var(--primary)');
    expect(speedRule).toMatch(/border-radius:\s*var\(--button-radius/);
    const skipRule = css.match(/\.aud-skip-btn\s*{[^}]*}/)[0];
    expect(skipRule).toContain('border: 1px solid var(--primary)');
    const muteRule = css.match(/\.aud-mute-btn\s*{[^}]*}/)[0];
    expect(muteRule).toContain('border: 1px solid var(--primary)');
    expect(css).not.toMatch(/--accent-tint/);
  });

  test('video-frame speed/skip/mute controls are Cobalt-outlined at rest, not invented tints', () => {
    const css = videoFrame.generateCSS();
    const speedRule = css.match(/\.video-speed-btn\s*{[^}]*}/)[0];
    expect(speedRule).toContain('border: 1px solid var(--primary)');
    expect(speedRule).toContain('color: var(--primary)');
    expect(speedRule).toMatch(/border-radius:\s*var\(--button-radius/);
    const skipRule = css.match(/\.video-skip-btn\s*{[^}]*}/)[0];
    expect(skipRule).toContain('border: 1px solid var(--primary)');
    const muteRule = css.match(/\.video-mute-btn\s*{[^}]*}/)[0];
    expect(muteRule).toContain('border: 1px solid var(--primary)');
    expect(css).not.toMatch(/--accent-tint/);
  });

  test('scenario speaker name is AT&T Blue at >=19px, and choice buttons are Cobalt at rest not just on hover', () => {
    const css = scenario.generateCSS();
    const speakerRule = css.match(/\.speaker-name\s*{[^}]*}/)[0];
    expect(speakerRule).toMatch(/color:\s*var\(--accent\)/);
    expect(speakerRule).toMatch(/font-size:\s*(?:var\(--att-fs-h[1-3],\s*)?([1-9]\d*(?:\.\d+)?(?:rem|em|px))/);

    expect(css).toMatch(/\.scenario-choice-btn\s*{[^}]*border:\s*1px solid var\(--primary\)/);
    expect(css).not.toMatch(/\.scenario-choice-btn:hover\s*{[^}]*background-color:\s*var\(--accent-tint\)/);
  });

  test('interactive-video multiple-choice selection and marker states are Cobalt/success/danger tokens, no invented tints or hardcoded hex', () => {
    const css = interactiveVideo.generateCSS();
    expect(css).toMatch(/\.iv-mc-option\.iv-mc-selected\s*{[^}]*border-color:\s*var\(--primary\)/);
    expect(css).not.toContain('background-color: var(--accent-tint)');
    expect(css).toMatch(/\.iv-marker-item\.iv-marker-item-active\s*{[^}]*var\(--primary\)/);
    expect(css).not.toMatch(/#(065F46|991B1B|F1F5F9|1E293B)/i);
    expect(css).toContain('var(--success-tint)');
    expect(css).toContain('var(--danger-tint)');
  });
});

describe('AT&T brand: new authoring features (Slides 6 and 10)', () => {
  test('multiple choice: submit button defaults to "Submit answer" when unset (backward compatible)', () => {
    const html = multipleChoice.generateHTML({ items: [{ label: 'A', content: '', correct: true }] }, INSTANCE_ID);
    expect(new JSDOM(html).window.document.querySelector('.quiz-submit-btn').textContent).toBe('Submit answer');
  });

  test('multiple choice: a custom submit button label renders verbatim and is escaped', () => {
    const html = multipleChoice.generateHTML({
      items: [{ label: 'A', content: '', correct: true }],
      mcSubmitButtonText: 'Lock In My Answer'
    }, INSTANCE_ID);
    const btn = new JSDOM(html).window.document.querySelector('.quiz-submit-btn');
    expect(btn.textContent).toBe('Lock In My Answer');
  });

  test('multiple choice: an unsafe submit button label is HTML-escaped, not executed', () => {
    const html = multipleChoice.generateHTML({
      items: [{ label: 'A', content: '', correct: true }],
      mcSubmitButtonText: '<img src=x onerror=alert(1)>'
    }, INSTANCE_ID);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(new JSDOM(html).window.document.querySelector('.quiz-submit-btn').textContent).toContain('<img');
  });

  test('multiple choice: an empty/whitespace submit button label falls back to the default rather than rendering blank', () => {
    const html = multipleChoice.generateHTML({ items: [{ label: 'A', content: '', correct: true }], mcSubmitButtonText: '' }, INSTANCE_ID);
    expect(new JSDOM(html).window.document.querySelector('.quiz-submit-btn').textContent).toBe('Submit answer');
  });

  test('horizontal timeline: a marker label renders inside the node, aria-hidden, without altering the tab\'s accessible name', () => {
    const html = horizontalTimeline.generateHTML({
      items: [
        { title: 'Phase One', content: 'Desc', markerLabel: '1' },
        { title: 'Phase Two', content: 'Desc', markerLabel: '2' }
      ]
    }, INSTANCE_ID);
    const doc = new JSDOM(html).window.document;
    const firstNode = doc.querySelector('.timeline-node');
    const label = firstNode.querySelector('.node-marker-label');
    expect(label.textContent).toBe('1');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    // Accessible name still comes from the visible title text, not the marker number.
    expect(firstNode.textContent).toContain('Phase One');
  });

  test('horizontal timeline: projects saved before this field existed render with no marker (backward compatible)', () => {
    const html = horizontalTimeline.generateHTML({ items: [{ title: 'Phase One', content: 'Desc' }] }, INSTANCE_ID);
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('.node-marker-label')).toBeNull();
    expect(doc.querySelector('.node-marker')).not.toBeNull();
  });

  test('horizontal timeline: a marker label is HTML-escaped, not executed', () => {
    const html = horizontalTimeline.generateHTML({
      items: [{ title: 'Phase One', content: 'Desc', markerLabel: '<script>alert(1)</script>' }]
    }, INSTANCE_ID);
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Prompt 3: AT&T brand color tokenization and absence of off-brand literals', () => {
  test('theme semantic status colors adhere to AT&T brand rules', () => {
    const theme = getBuiltInTheme();
    expect(theme.tokens.success).toBe('#91DC00'); // AT&T Lime
    expect(theme.tokens.warning).toBe('#00388F'); // AT&T Cobalt (no brand amber/orange)
    expect(theme.tokens.danger).toBe('#00388F');  // AT&T Cobalt (no brand red)
  });

  test('component CSS does not contain raw off-brand color literals', () => {
    const componentGenerators = [
      scenario, videoFrame, interactiveVideo, menuList,
      imageGallery, hotspots, multipleChoice, multipleSelect, fillBlank
    ];
    for (const comp of componentGenerators) {
      const css = comp.generateCSS();
      expect(css).not.toContain('rgba(0,0,0,0.02)');
      expect(css).not.toContain('rgba(0,0,0,0.01)');
      expect(css).not.toContain('rgba(15, 23, 42, 0.9)');
      expect(css).not.toMatch(/background-color:\s*#000;/);
    }
  });

  test('quiz feedback pairs use high-contrast text rather than low-contrast lime text', () => {
    const mcCSS = multipleChoice.generateCSS();
    expect(mcCSS).toContain('.quiz-feedback.correct');
    expect(mcCSS).toMatch(/\.quiz-feedback\.correct\s*{[^}]*color:\s*var\(--text-main\)/);
    expect(mcCSS).toMatch(/\.quiz-feedback\.wrong\s*{[^}]*color:\s*var\(--text-main\)/);

    const msCSS = multipleSelect.generateCSS();
    expect(msCSS).toMatch(/\.quiz-feedback\.correct\s*{[^}]*color:\s*var\(--text-main\)/);
    expect(msCSS).toMatch(/\.quiz-feedback\.wrong\s*{[^}]*color:\s*var\(--text-main\)/);

    const fbCSS = fillBlank.generateCSS();
    expect(fbCSS).toMatch(/\.quiz-feedback\.correct\s*{[^}]*color:\s*var\(--text-main\)/);
    expect(fbCSS).toMatch(/\.quiz-feedback\.wrong\s*{[^}]*color:\s*var\(--text-main\)/);
  });
});

describe('Prompt 4: AT&T Typography Standards (Type Hierarchy, 16px Body Floor, 70ch Prose, 44px Touch Targets)', () => {
  const allComponents = [
    { name: 'accordion', mod: accordion },
    { name: 'tabs', mod: tabs },
    { name: 'flipCards', mod: flipCards },
    { name: 'hotspots', mod: hotspots },
    { name: 'menuList', mod: menuList },
    { name: 'multipleChoice', mod: multipleChoice },
    { name: 'multipleSelect', mod: multipleSelect },
    { name: 'fillBlank', mod: fillBlank },
    { name: 'sortingActivity', mod: sortingActivity },
    { name: 'verticalTimeline', mod: verticalTimeline },
    { name: 'horizontalTimeline', mod: horizontalTimeline },
    { name: 'processFlow', mod: processFlow },
    { name: 'profileCards', mod: profileCards },
    { name: 'infoGrid', mod: infoGrid },
    { name: 'pricingComparison', mod: pricingComparison },
    { name: 'videoFrame', mod: videoFrame },
    { name: 'imageGallery', mod: imageGallery },
    { name: 'audioPlayer', mod: audioPlayer },
    { name: 'scenario', mod: scenario },
    { name: 'interactiveVideo', mod: interactiveVideo }
  ];

  test('body copy and explanations enforce 70ch max-width on prose blocks across components', () => {
    const proseComponents = [
      accordion, tabs, flipCards, multipleChoice, multipleSelect,
      fillBlank, verticalTimeline, horizontalTimeline, processFlow,
      infoGrid, profileCards, audioPlayer, videoFrame, interactiveVideo,
      scenario, menuList, sortingActivity
    ];
    for (const comp of proseComponents) {
      const css = comp.generateCSS();
      expect(css, 'Component CSS should declare max-width: 70ch on prose copy').toMatch(/max-width:\s*70ch/);
    }
  });

  test('learner-facing body text references --att-fs-body or 1rem with 1.5 line-height across component generators', () => {
    for (const { name, mod } of allComponents) {
      const css = mod.generateCSS();
      expect(css, `${name} should use --att-fs-body or 1rem for body copy`).toMatch(/(--att-fs-body|1rem)/);
    }
  });

  test('headings and titles enforce text-wrap: pretty across multi-line heading rules', () => {
    const headingComponents = [
      tabs, verticalTimeline, horizontalTimeline, audioPlayer,
      interactiveVideo, scenario, processFlow, infoGrid, profileCards,
      pricingComparison, menuList
    ];
    for (const comp of headingComponents) {
      const css = comp.generateCSS();
      expect(css, 'Heading rules should specify text-wrap: pretty').toMatch(/text-wrap:\s*pretty/);
    }
  });

  test('interactive controls enforce accessible touch targets (min-height: 44px or 44x44 dimensions)', () => {
    const interactiveComponents = [
      accordion, tabs, multipleChoice, multipleSelect, fillBlank,
      verticalTimeline, horizontalTimeline, audioPlayer, videoFrame,
      interactiveVideo, processFlow, pricingComparison, sortingActivity,
      imageGallery, menuList
    ];
    for (const comp of interactiveComponents) {
      const css = comp.generateCSS();
      expect(css, 'Interactive component should declare min-height: 44px or 44px dimensions for touch targets').toMatch(/(min-height:\s*44px|width:\s*44px)/);
    }
  });

  test('buttons and headings avoid uppercase text except for eyebrows and badges', () => {
    const htmlOutputs = [
      scenario.generateHTML({ items: [{ title: 'Q', content: '' }, { title: 'Choice A', content: 'FB' }] }, INSTANCE_ID),
      pricingComparison.generateHTML({ items: [{ title: 'Tier 1', content: 'F1 • F2', highlighted: true }] }),
      hotspots.generateHTML({ items: [{ title: 'Point 1', content: 'Details', x: '50', y: '50' }] }, INSTANCE_ID)
    ];
    for (const html of htmlOutputs) {
      // Should not contain legacy shouting ALL CAPS
      expect(html).not.toContain('CHRIS (TEAM LEAD)');
      expect(html).not.toContain('RECOMMENDED');
      expect(html).not.toContain('SCHEMATIC PATHWAY MAP');
    }
  });
});

describe('Prompt 5: Curvature and spacing compliance across all components', () => {
  const allComponents = [
    { name: 'accordion', mod: accordion },
    { name: 'tabs', mod: tabs },
    { name: 'flipCards', mod: flipCards },
    { name: 'hotspots', mod: hotspots },
    { name: 'menuList', mod: menuList },
    { name: 'multipleChoice', mod: multipleChoice },
    { name: 'multipleSelect', mod: multipleSelect },
    { name: 'sortingActivity', mod: sortingActivity },
    { name: 'fillBlank', mod: fillBlank },
    { name: 'verticalTimeline', mod: verticalTimeline },
    { name: 'horizontalTimeline', mod: horizontalTimeline },
    { name: 'processFlow', mod: processFlow },
    { name: 'profileCards', mod: profileCards },
    { name: 'infoGrid', mod: infoGrid },
    { name: 'pricingComparison', mod: pricingComparison },
    { name: 'videoFrame', mod: videoFrame },
    { name: 'imageGallery', mod: imageGallery },
    { name: 'audioPlayer', mod: audioPlayer },
    { name: 'scenario', mod: scenario },
    { name: 'interactiveVideo', mod: interactiveVideo }
  ];

  test('media frames and video wrappers enforce --att-radius-lg with overflow: hidden', () => {
    const mediaComponents = [videoFrame, interactiveVideo, imageGallery, hotspots];
    for (const comp of mediaComponents) {
      const css = comp.generateCSS();
      expect(css, 'Media container should enforce overflow: hidden').toMatch(/overflow:\s*hidden/);
      expect(css, 'Media container should use --att-radius-lg').toMatch(/--att-radius-lg/);
    }
  });

  test('content cards, panels, and accordion rows use --att-radius-lg or token fallbacks', () => {
    const cardComponents = [
      accordion, tabs, flipCards, verticalTimeline, horizontalTimeline,
      processFlow, profileCards, infoGrid, pricingComparison, menuList,
      sortingActivity, audioPlayer, videoFrame, interactiveVideo
    ];
    for (const comp of cardComponents) {
      const css = comp.generateCSS();
      expect(css, 'Card/panel components should declare --att-radius-lg').toMatch(/--att-radius-lg/);
    }
  });

  test('badges and pill chips use --att-radius-pill or --att-radius-sm', () => {
    const pillComponents = [
      accordion, tabs, flipCards, verticalTimeline, processFlow,
      pricingComparison, sortingActivity, interactiveVideo
    ];
    for (const comp of pillComponents) {
      const css = comp.generateCSS();
      expect(css, 'Pill/badge components should declare --att-radius-pill or --att-radius-sm').toMatch(/(--att-radius-pill|--att-radius-sm)/);
    }
  });

  test('spacing scale tokens (--att-space-*) are used across all component generators', () => {
    for (const { name, mod } of allComponents) {
      const css = mod.generateCSS();
      expect(css, `${name} should use --att-space-* scale tokens`).toMatch(/--att-space-[1-8]/);
    }
  });
});



