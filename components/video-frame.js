import { getEditorSchema } from '../js/editor-schemas.js';
import { isEmpty } from '../js/field-validation.js';
import { escapeAttribute, escapeHTML, normalizeDelimitedLines, richTextToPlain } from '../js/utilities.js';
import { getAttIconSvg } from '../js/att-icons.js';

export const id = 'video-frame';
export const name = 'Custom Video Embed';
export const category = 'media';
export const defaultConfig = {
  chapters: '',
  transcriptSegments: '',
  progressPersistence: true,
  takeaways: '',
  takeawaysVisibility: 'always',
  items: [
    { title: 'Rise Builder Workspace Walkthrough', content: 'https://www.w3schools.com/html/mov_bbb.mp4' }
  ]
};
export const editorSchema = getEditorSchema(id);

// How far Replay/Forward move the playhead, and the completion threshold — named
// constants, matching components/audio-player.js's own VID_*/AUD_* convention. Chapters,
// synchronized transcript, resume/progress, and takeaways here are the same
// passive-consumption feature set already shipped for Interactive Learning Audio
// (docs/AUDIO-PLAYER.md) — deliberately navigation-only (click-to-seek), never a
// pause-and-quiz gate, since that richer required-checkpoint interaction model already
// belongs to Interactive Video (docs/INTERACTIVE-VIDEO.md).
const VID_SKIP_SECONDS = 10;
const VID_COMPLETION_THRESHOLD = 0.9;
const VID_COMPLETION_TAIL_SECONDS = 3;
const VID_RESUME_MIN_SECONDS = 10;

// Replay/Forward, volume/mute, and transcript glyphs from AT&T Icon Library
const skipBackIcon = getAttIconSvg('step-back-15', { width: 16, height: 16, ariaHidden: true });
const skipForwardIcon = getAttIconSvg('step-forward-15', { width: 16, height: 16, ariaHidden: true });
const volumeOnIcon = getAttIconSvg('volume-3', { className: 'video-volume-on-svg', width: 14, height: 14, ariaHidden: true });
const volumeOffIcon = getAttIconSvg('volume-off', { className: 'video-volume-off-svg', width: 14, height: 14, ariaHidden: true, style: 'display:none;' });
const transcriptIcon = getAttIconSvg('text', { width: 14, height: 14, ariaHidden: true });
const chevronIcon = getAttIconSvg('chevron-down', { className: 'video-chapter-chevron', width: 16, height: 16, ariaHidden: true });
const chaptersIcon = getAttIconSvg('list', { width: 14, height: 14, ariaHidden: true });
const takeawaysIcon = getAttIconSvg('star-filled', { width: 14, height: 14, ariaHidden: true });

// "3:24" / "03:24" / "1:03:24" -> seconds. Returns null (never throws) for anything else —
// duplicated from components/audio-player.js's own identical parser rather than imported,
// since neither component imports the other and the function is small/pure.
export function parseTimestampToSeconds(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const parts = text.split(':').map(part => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.length === 3
    ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers[0] * 60 + numbers[1];
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function formatSecondsLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
}

// Chapters/transcript segments/takeaways: same delimited-text parsers as
// components/audio-player.js — see js/editor-schemas.js's video-frame comment for why.
export function parseChapters(raw) {
  const normalized = normalizeDelimitedLines(raw);
  const chapters = normalized.split('\n').reduce((list, line) => {
    if (!line.trim()) return list;
    const parts = line.split('|');
    const timestamp = parseTimestampToSeconds(parts[0]);
    const title = (parts[1] || '').trim();
    const description = (parts[2] || '').trim();
    if (timestamp === null || !title) return list;
    list.push({ timestamp, title, description });
    return list;
  }, []);
  return chapters.sort((a, b) => a.timestamp - b.timestamp);
}

export function parseTranscriptSegments(raw) {
  const normalized = normalizeDelimitedLines(raw);
  const segments = normalized.split('\n').reduce((list, line) => {
    if (!line.trim()) return list;
    const parts = line.split('|');
    const timestamp = parseTimestampToSeconds(parts[0]);
    if (timestamp === null) return list;
    const speaker = parts.length >= 3 ? (parts[1] || '').trim() : '';
    const text = (parts.length >= 3 ? parts.slice(2).join('|') : (parts[1] || '')).trim();
    if (!text) return list;
    list.push({ timestamp, speaker, text });
    return list;
  }, []);
  return segments.sort((a, b) => a.timestamp - b.timestamp);
}

export function parseTakeaways(raw) {
  const normalized = normalizeDelimitedLines(raw);
  return normalized.split('\n').map(line => line.trim()).filter(Boolean);
}

export function generateHTML(config, instanceId) {
  const item = config.items[0] || {};
  const src = item.content || '';
  const title = item.title || 'Instructional video';
  const captionsUrl = item.captionsUrl || '';
  const audioDescription = item.audioDescription || '';
  const plainTranscript = item.transcript || '';
  const poster = item.posterImage || 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800';
  // <video poster> has no native alt-text mechanism (unlike <img>), so a meaningful
  // poster's description is exposed via aria-describedby on the video itself instead —
  // only when the author both supplied posterAltText and didn't mark it decorative.
  const posterAltText = item.posterAltText || '';
  const posterDecorative = item.posterDecorative === true;
  const describePoster = !posterDecorative && posterAltText;

  const chapters = parseChapters(config.chapters);
  const segments = parseTranscriptSegments(config.transcriptSegments);
  const takeaways = parseTakeaways(config.takeaways);
  const progressPersistence = config.progressPersistence !== false;
  const takeawaysVisibility = config.takeawaysVisibility === 'afterCompletion' ? 'afterCompletion' : 'always';
  // isEmpty(), not a bare truthy check: a richtext field's "empty" value from the
  // contentEditable editor is often not the literal string '' but a visually-empty
  // fragment like '<p></p>' or '<br>' — see components/audio-player.js's identical fix.
  const hasTranscript = Boolean(segments.length) || !isEmpty(plainTranscript);

  const currentChapterBlock = chapters.length
    ? `<p class="video-current-chapter" id="${instanceId}-current-chapter" aria-live="off">${escapeHTML(chapters[0].title)}</p>`
    : '';

  const resumeBlock = progressPersistence
    ? `<div class="video-resume-prompt" id="${instanceId}-resume-prompt" hidden>
        <span class="video-resume-text" id="${instanceId}-resume-text"></span>
        <button type="button" class="video-resume-btn" id="${instanceId}-resume-btn">Resume</button>
        <button type="button" class="video-restart-choice-btn" id="${instanceId}-restart-choice-btn">Start Over</button>
      </div>`
    : '';

  const chapterNavBlock = chapters.length
    ? `<nav class="video-chapter-nav" aria-label="Chapters">
        <button type="button" class="video-chapter-toggle" id="${instanceId}-chapter-toggle" aria-expanded="true" aria-controls="${instanceId}-chapter-list">
          <span class="video-chapter-toggle-label">${chaptersIcon}<span class="video-section-heading">Chapters</span></span>
          ${chevronIcon}
        </button>
        <ul class="video-chapter-list" id="${instanceId}-chapter-list">
          ${chapters.map((chapter, i) => `
            <li>
              <button type="button" class="video-chapter-item" data-idx="${i}" data-time="${chapter.timestamp}" aria-label="Jump to chapter: ${escapeAttribute(richTextToPlain(chapter.title))}, ${escapeAttribute(formatSecondsLabel(chapter.timestamp))}">
                <span class="video-chapter-time">${escapeHTML(formatSecondsLabel(chapter.timestamp))}</span>
                <span class="video-chapter-title">${escapeHTML(chapter.title)}</span>
                ${chapter.description ? `<span class="video-chapter-desc">${escapeHTML(chapter.description)}</span>` : ''}
              </button>
            </li>`).join('')}
        </ul>
      </nav>`
    : '';

  const progressStatusBlock = `<div class="video-progress-status">
      <p class="video-progress-text" id="${instanceId}-progress-text">Not started</p>
    </div>`;

  const transcriptBlock = hasTranscript
    ? `<div class="video-transcript-section">
        <button type="button" class="video-transcript-toggle" id="${instanceId}-transcript-toggle" aria-expanded="false" aria-controls="${instanceId}-transcript-panel">
          ${transcriptIcon}<span>Show Transcript</span>
        </button>
        <div class="video-transcript-panel" id="${instanceId}-transcript-panel" hidden>
          ${segments.length ? `
            <div class="video-transcript-search-row">
              <label class="sr-only" for="${instanceId}-transcript-search">Search transcript</label>
              <input type="search" class="video-transcript-search" id="${instanceId}-transcript-search" placeholder="Search transcript">
            </div>
            <p class="video-transcript-search-status" id="${instanceId}-transcript-search-status" role="status" aria-live="polite"></p>
            <div class="video-transcript-segments" id="${instanceId}-transcript-segments">
              ${segments.map((segment, i) => `
                <button type="button" class="video-transcript-segment" data-idx="${i}" data-time="${segment.timestamp}">
                  <span class="video-segment-time">${escapeHTML(formatSecondsLabel(segment.timestamp))}</span>
                  ${segment.speaker ? `<span class="video-segment-speaker">${escapeHTML(segment.speaker)}:</span>` : ''}
                  <span class="video-segment-text">${escapeHTML(segment.text)}</span>
                </button>`).join('')}
            </div>
            <p class="video-transcript-no-results" id="${instanceId}-transcript-no-results" hidden>No matching transcript lines.</p>
          ` : `<div class="video-transcript-plain">${plainTranscript}</div>`}
        </div>
      </div>`
    : '<p class="media-alternative-note sr-only">No transcript has been supplied for this video.</p>';

  const takeawaysBlock = takeaways.length
    ? `<div class="video-takeaways-panel">
        <h4 class="video-section-heading video-takeaways-heading">${takeawaysIcon}<span>Key Takeaways</span></h4>
        ${takeawaysVisibility === 'afterCompletion' ? `<p class="video-takeaways-locked-msg" id="${instanceId}-takeaways-locked">Complete the video to reveal key takeaways.</p>` : ''}
        <ul class="video-takeaways-list" id="${instanceId}-takeaways-list" ${takeawaysVisibility === 'afterCompletion' ? 'hidden' : ''}>
          ${takeaways.map(takeaway => `<li>${escapeHTML(takeaway)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  return `
    <div class="video-player-block" id="${instanceId}-root"
      data-chapters="${escapeAttribute(JSON.stringify(chapters))}"
      data-segments="${escapeAttribute(JSON.stringify(segments))}"
      data-progress-persistence="${progressPersistence ? '1' : '0'}"
      data-takeaways-visibility="${takeawaysVisibility}"
      data-takeaways-count="${takeaways.length}">
      <div class="video-wrapper">
        <video id="${instanceId}-html5-video-element" poster="${escapeAttribute(poster)}" width="100%" height="auto" controls aria-label="${escapeAttribute(richTextToPlain(title))}" ${describePoster ? `aria-describedby="${instanceId}-poster-desc"` : ''}>
          <source src="${escapeAttribute(src)}" type="video/mp4">
          ${captionsUrl ? `<track kind="captions" src="${escapeAttribute(captionsUrl)}" srclang="en" label="English" default>` : ''}
        </video>
        <button type="button" class="video-overlay-play" aria-label="Play video">
          ${getAttIconSvg('play', { width: 32, height: 32, ariaHidden: true })}
        </button>
      </div>
      ${describePoster ? `<span id="${instanceId}-poster-desc" class="sr-only">${escapeHTML(posterAltText)}</span>` : ''}

      ${currentChapterBlock}
      <p class="video-status-region sr-only" id="${instanceId}-status" role="status" aria-live="polite"></p>
      ${resumeBlock}

      <div class="video-control-strip">
        <button type="button" class="video-skip-btn video-skip-back-btn" id="${instanceId}-skip-back" aria-label="Replay ${VID_SKIP_SECONDS} seconds" disabled>${skipBackIcon}</button>
        <button type="button" class="video-mini-play" id="${instanceId}-mini-play" aria-label="Play video" aria-pressed="false">
          ${getAttIconSvg('play', { className: 'video-play-svg', width: 14, height: 14, ariaHidden: true })}
          ${getAttIconSvg('pause', { className: 'video-pause-svg', width: 14, height: 14, ariaHidden: true, style: 'display:none;' })}
        </button>
        <button type="button" class="video-skip-btn video-skip-forward-btn" id="${instanceId}-skip-forward" aria-label="Forward ${VID_SKIP_SECONDS} seconds" disabled>${skipForwardIcon}</button>
        <div class="video-scrub-wrap">
          <div class="video-timeline-scrub" id="${instanceId}-scrub" role="slider" tabindex="0" aria-label="Video position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 percent">
            <div class="video-fill" id="${instanceId}-scrub-fill" style="width: 0%;"></div>
          </div>
          <div class="video-chapter-markers" id="${instanceId}-chapter-markers"></div>
        </div>
        <span class="video-timer" id="${instanceId}-timer" aria-live="off">0:00 / 0:00</span>
        <button type="button" class="video-speed-btn" id="${instanceId}-speed-btn" aria-label="Playback speed: 1x">1x</button>
        <button type="button" class="video-mute-btn" id="${instanceId}-mute-btn" aria-label="Mute video" aria-pressed="false">
          ${volumeOnIcon}
          ${volumeOffIcon}
        </button>
      </div>

      ${chapterNavBlock}
      ${progressStatusBlock}

      ${audioDescription ? `<details class="media-transcript"><summary>Visual description</summary><div>${audioDescription}</div></details>` : '<p class="media-alternative-note sr-only">No visual description has been supplied for this video.</p>'}

      ${transcriptBlock}
      ${takeawaysBlock}
    </div>
  `;
}

export function generateCSS() {
  return `
    .video-player-block {
      background-color: var(--bg-card);
      border: var(--border-style);
      border-radius: var(--att-radius-lg, var(--border-radius, 20px));
      box-shadow: var(--shadow-style);
      padding: var(--att-space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--att-space-3, 12px);
    }
    .video-wrapper {
      position: relative;
      width: 100%;
      border-radius: var(--att-radius-lg, 20px);
      overflow: hidden;
      background-color: var(--att-black, #000000);
    }
    .video-wrapper video {
      display: block;
    }
    .video-overlay-play {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 60px;
      height: 60px;
      border-radius: 50%;
      /* White icon on Cobalt Blue (--primary): the brand's clickable treatment,
         not a neutral dark wash or AT&T Blue. */
      background-color: var(--primary);
      color: var(--on-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      padding: 0;
      font: inherit;
      border: 0;
    }
    .video-wrapper:hover .video-overlay-play {
      background-color: var(--primary-hover);
    }
    .video-current-chapter {
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      color: var(--text-muted);
    }
    .video-status-region { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .video-resume-prompt {
      display: flex;
      align-items: center;
      gap: var(--att-space-2, 8px);
      flex-wrap: wrap;
      background-color: var(--bg-body);
      border-radius: var(--att-radius-md, 12px);
      padding: 8px 10px;
      font-size: var(--att-fs-body-sm, 0.875rem);
    }
    .video-resume-text { color: var(--text-main); margin-right: auto; }
    .video-resume-btn,
    .video-restart-choice-btn {
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      padding: 6px 12px;
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .video-resume-btn { background-color: var(--primary); color: var(--on-primary); }
    .video-resume-btn:hover { background-color: var(--primary-hover); border-color: var(--primary-hover); }
    .video-restart-choice-btn:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
    .video-control-strip {
      display: flex;
      align-items: center;
      gap: var(--att-space-3, 10px);
      padding: 4px;
      flex-wrap: wrap;
      row-gap: 8px;
    }
    /* Replay/Forward are secondary to the main play control — small and outlined,
       Cobalt-outlined at rest like sorting-activity's .target-btn, since these are
       clickable at all times, matching components/audio-player.js's own convention. */
    .video-skip-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
      padding: 0;
    }
    .video-overlay-play:active {
      transform: translate(-50%, -50%) scale(0.98);
    }
    .video-overlay-play:focus-visible, .video-skip-btn:focus-visible, .video-mini-play:focus-visible, .video-control-btn:focus-visible, .video-rate-btn:focus-visible, .video-resume-btn:focus-visible, .video-restart-choice-btn:focus-visible {
      outline: 3px solid var(--att-cobalt, var(--primary));
      outline-offset: 2px;
    }
    .video-skip-btn:active, .video-mini-play:active, .video-control-btn:active, .video-rate-btn:active, .video-resume-btn:active, .video-restart-choice-btn:active {
      transform: scale(0.98);
    }
    .video-skip-btn:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
    .video-skip-btn:disabled { opacity: 0.5; cursor: default; }
    .video-mini-play {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: transparent;
      border: 1px solid var(--primary);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
      transition: all 0.2s;
    }
    .video-mini-play:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
    /* Chapter markers are a sibling overlay (.video-chapter-markers), not children of
       .video-timeline-scrub itself: axe's "nested-interactive" rule correctly flags real
       <button> markers living inside an element with role="slider" — a slider's content
       model doesn't expect focusable descendants (the same real bug found and fixed for
       components/audio-player.js's own chapter markers). */
    .video-scrub-wrap {
      position: relative;
      flex: 1 1 60px;
      min-width: 60px;
    }
    .video-timeline-scrub {
      height: 6px;
      background-color: var(--bg-body);
      border-radius: var(--att-radius-pill, 999px);
      position: relative;
      cursor: pointer;
    }
    .video-fill {
      height: 100%;
      background-color: var(--accent);
      border-radius: var(--att-radius-pill, 999px);
    }
    .video-chapter-markers {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    /* A 24x24 hit target (WCAG 2.2 target-size) centered on the timestamp, but the visible
       glyph (::before) stays a small 10px dot — see components/audio-player.js's identical
       pattern and its own comment for why hit-area and visible-size are decoupled here. */
    .video-chapter-marker {
      position: absolute;
      top: 50%;
      width: 24px;
      height: 24px;
      margin-left: -12px;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .video-chapter-marker::before {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--bg-card);
      border: 2px solid var(--primary);
    }
    .video-chapter-marker:hover::before { background-color: var(--primary); }
    .video-timer {
      font-size: var(--att-fs-body-sm, 0.875rem);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .video-speed-btn {
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      padding: 4px 10px;
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-medium, 500);
      border-radius: var(--button-radius, var(--att-radius-pill, 999px));
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .video-speed-btn:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
    .video-mute-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background-color: var(--bg-card);
      border: 1px solid var(--primary);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
      padding: 0;
    }
    .video-mute-btn:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
    .video-section-heading {
      font-size: var(--att-fs-eyebrow, 0.75rem);
      font-weight: var(--att-fw-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .video-chapter-nav { border-top: var(--border-style); padding-top: 10px; }
    .video-chapter-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      background: none;
      border: none;
      padding: 4px 0;
      margin-bottom: 6px;
      cursor: pointer;
      min-height: 44px;
    }
    .video-chapter-toggle-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
    .video-chapter-chevron {
      color: var(--primary);
      flex-shrink: 0;
      transition: transform 0.25s ease;
    }
    .video-chapter-toggle[aria-expanded="false"] .video-chapter-chevron { transform: rotate(-90deg); }
    /* list-style/margin/padding reset: a bare <ul>'s browser-default bullet + indent
       otherwise leaks through — display:flex on the *list* doesn't change each <li>'s own
       default display:list-item, which the bullet actually depends on (the same real bug
       found and fixed for components/audio-player.js's own chapter list). */
    .video-chapter-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .video-chapter-list li { list-style: none; margin: 0; padding: 0; }
    .video-chapter-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-radius: var(--att-radius-sm, 8px);
      padding: 8px 10px;
      cursor: pointer;
      font-size: var(--att-fs-body-sm, 0.875rem);
      color: var(--text-main);
      min-height: 44px;
      box-sizing: border-box;
    }
    .video-chapter-item:hover { background-color: var(--bg-body); }
    .video-chapter-item.video-chapter-active {
      background-color: var(--bg-body);
      font-weight: var(--att-fw-bold, 700);
      /* Not color alone: the active row also gets aria-current="true" (generateJS) and a
         leading marker character, not just a background tint. */
    }
    .video-chapter-item.video-chapter-active .video-chapter-title::before { content: '▸ '; color: var(--primary); }
    .video-chapter-time { color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .video-chapter-desc { display: block; width: 100%; font-size: var(--att-fs-body-sm, 0.875rem); color: var(--text-muted); margin-top: 2px; }
    .video-progress-status { font-size: var(--att-fs-body-sm, 0.875rem); color: var(--text-muted); }
    .video-transcript-section { border-top: var(--border-style); padding-top: 10px; }
    .video-transcript-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: var(--primary);
      font-size: var(--att-fs-body-sm, 0.875rem);
      font-weight: var(--att-fw-bold, 700);
      cursor: pointer;
      padding: 4px 0;
      min-height: 44px;
    }
    .video-transcript-toggle:hover { color: var(--primary-hover); }
    .video-transcript-panel {
      margin-top: 8px;
      max-height: 260px;
      overflow-y: auto;
      border: var(--border-style);
      border-radius: var(--att-radius-md, 12px);
      padding: 10px;
    }
    .video-transcript-search-row { margin-bottom: 8px; }
    .video-transcript-search {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      font-size: var(--att-fs-body-sm, 0.875rem);
      border: var(--border-style);
      border-radius: var(--att-radius-sm, 8px);
      background-color: var(--bg-card);
      color: var(--text-main);
      min-height: 44px;
    }
    .video-transcript-search-status { font-size: var(--att-fs-body-sm, 0.875rem); color: var(--text-muted); margin: 0 0 6px; }
    .video-transcript-segments { display: flex; flex-direction: column; gap: 2px; }
    .video-transcript-segment {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-radius: var(--att-radius-sm, 8px);
      padding: 8px 10px;
      cursor: pointer;
      font-size: var(--att-fs-body, 1rem);
      color: var(--text-main);
      line-height: var(--att-lh-body, 1.5);
      min-height: 44px;
      box-sizing: border-box;
    }
    .video-transcript-segment:hover { background-color: var(--bg-body); }
    .video-transcript-segment.video-segment-active {
      background-color: var(--bg-body);
      border-left: 3px solid var(--primary);
      font-weight: var(--att-fw-bold, 700);
    }
    .video-segment-time { color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; font-weight: 400; font-size: var(--att-fs-body-sm, 0.875rem); }
    .video-segment-speaker { font-weight: var(--att-fw-bold, 700); flex-shrink: 0; }
    .video-segment-text { max-width: 70ch; }
    .video-search-highlight { background-color: var(--warning); color: var(--text-main); border-radius: 2px; padding: 0 1px; }
    .video-transcript-plain { font-size: var(--att-fs-body, 1rem); line-height: var(--att-lh-body, 1.5); max-width: 70ch; }
    .video-transcript-no-results { font-size: var(--att-fs-body-sm, 0.875rem); color: var(--text-muted); font-style: italic; }
    .video-takeaways-panel {
      background-color: var(--bg-body);
      border-radius: var(--att-radius-md, 12px);
      padding: 16px;
    }
    .video-takeaways-heading {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--att-fs-h4, 1.125rem);
      font-weight: var(--att-fw-bold, 700);
      line-height: var(--att-lh-heading, 1.25);
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .video-takeaways-list {
      padding-left: 20px;
      font-size: var(--att-fs-body, 1rem);
      line-height: var(--att-lh-body, 1.5);
      max-width: 70ch;
      color: var(--text-main);
    }
    .video-takeaways-locked-msg { font-size: var(--att-fs-body-sm, 0.875rem); color: var(--text-muted); font-style: italic; }
    @media (max-width: 420px) {
      .video-control-strip { row-gap: 10px; }
      .video-scrub-wrap { flex-basis: 100%; order: 1; }
      .video-timer { order: 2; }
    }
    @media (forced-colors: active) {
      .video-fill { background: Highlight; }
      .video-chapter-marker::before { border-color: Highlight; }
    }`;
}

export function generateJS(config, instanceId) {
  return `
    var VID_SKIP_SECONDS = ${VID_SKIP_SECONDS};
    var VID_COMPLETION_THRESHOLD = ${VID_COMPLETION_THRESHOLD};
    var VID_COMPLETION_TAIL_SECONDS = ${VID_COMPLETION_TAIL_SECONDS};
    var VID_RESUME_MIN_SECONDS = ${VID_RESUME_MIN_SECONDS};
    var VID_SPEEDS = [1, 1.25, 1.5, 2];

    function vidFormatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      var total = Math.floor(seconds);
      var hrs = Math.floor(total / 3600);
      var mins = Math.floor((total % 3600) / 60);
      var secs = String(total % 60).padStart(2, '0');
      return hrs > 0 ? (hrs + ':' + String(mins).padStart(2, '0') + ':' + secs) : (mins + ':' + secs);
    }

    // A short, stable, non-cryptographic hash (djb2) of instanceId + video source — the
    // localStorage key. Same scheme as components/audio-player.js's own audHash().
    function vidHash(str) {
      var hash = 5381;
      for (var i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash = hash & hash; }
      return (hash >>> 0).toString(36);
    }

    function vidReadProgress(key) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function vidWriteProgress(key, data) {
      try { window.localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* storage unavailable/blocked — playback continues normally */ }
    }

    function vidRenderSegmentText(container, text, query) {
      container.textContent = '';
      if (!query) { container.appendChild(document.createTextNode(text)); return; }
      var lower = text.toLowerCase();
      var q = query.toLowerCase();
      var pos = 0;
      var idx = lower.indexOf(q, pos);
      if (idx === -1) { container.appendChild(document.createTextNode(text)); return; }
      while (idx !== -1) {
        if (idx > pos) container.appendChild(document.createTextNode(text.slice(pos, idx)));
        var mark = document.createElement('mark');
        mark.className = 'video-search-highlight';
        mark.textContent = text.slice(idx, idx + query.length);
        container.appendChild(mark);
        pos = idx + query.length;
        idx = lower.indexOf(q, pos);
      }
      if (pos < text.length) container.appendChild(document.createTextNode(text.slice(pos)));
    }

    function initVideoPlayer() {
      var root = document.getElementById('${instanceId}-root');
      if (!root) return;
      var video = document.getElementById('${instanceId}-html5-video-element');
      var overlayPlay = document.querySelector('.video-overlay-play');
      var miniPlay = document.getElementById('${instanceId}-mini-play');
      var skipBackBtn = document.getElementById('${instanceId}-skip-back');
      var skipForwardBtn = document.getElementById('${instanceId}-skip-forward');
      var scrubBar = document.getElementById('${instanceId}-scrub');
      var scrubFill = document.getElementById('${instanceId}-scrub-fill');
      var chapterMarkersEl = document.getElementById('${instanceId}-chapter-markers');
      var timerEl = document.getElementById('${instanceId}-timer');
      var speedBtn = document.getElementById('${instanceId}-speed-btn');
      var muteBtn = document.getElementById('${instanceId}-mute-btn');
      var statusEl = document.getElementById('${instanceId}-status');
      var currentChapterEl = document.getElementById('${instanceId}-current-chapter');
      var chapterListEl = document.getElementById('${instanceId}-chapter-list');
      var chapterToggle = document.getElementById('${instanceId}-chapter-toggle');
      var progressTextEl = document.getElementById('${instanceId}-progress-text');
      var resumePrompt = document.getElementById('${instanceId}-resume-prompt');
      var resumeText = document.getElementById('${instanceId}-resume-text');
      var resumeBtn = document.getElementById('${instanceId}-resume-btn');
      var restartChoiceBtn = document.getElementById('${instanceId}-restart-choice-btn');
      var transcriptToggle = document.getElementById('${instanceId}-transcript-toggle');
      var transcriptPanel = document.getElementById('${instanceId}-transcript-panel');
      var transcriptSearch = document.getElementById('${instanceId}-transcript-search');
      var transcriptSearchStatus = document.getElementById('${instanceId}-transcript-search-status');
      var transcriptSegmentsEl = document.getElementById('${instanceId}-transcript-segments');
      var transcriptNoResults = document.getElementById('${instanceId}-transcript-no-results');
      var takeawaysList = document.getElementById('${instanceId}-takeaways-list');
      var takeawaysLocked = document.getElementById('${instanceId}-takeaways-locked');
      if (!video) return;

      var CHAPTERS = [];
      var SEGMENTS = [];
      try { CHAPTERS = JSON.parse(root.getAttribute('data-chapters') || '[]'); } catch (e) { CHAPTERS = []; }
      try { SEGMENTS = JSON.parse(root.getAttribute('data-segments') || '[]'); } catch (e) { SEGMENTS = []; }
      var PROGRESS_PERSISTENCE = root.getAttribute('data-progress-persistence') === '1';
      var TAKEAWAYS_VISIBILITY = root.getAttribute('data-takeaways-visibility') || 'always';
      var TAKEAWAYS_COUNT = Number(root.getAttribute('data-takeaways-count') || '0');
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      var progressKey = 'rcb-video-progress-' + vidHash('${instanceId}|' + (video.getAttribute('src') || (video.querySelector('source') && video.querySelector('source').getAttribute('src')) || ''));
      var furthestPosition = 0;
      var completed = false;
      var resumeHandled = false;
      var lastSaveTime = 0;
      var lastActiveChapterIdx = -1;
      var lastActiveSegmentIdx = -1;
      var transcriptUserScrolled = false;
      var programmaticScroll = false;
      // Two guards, matching components/audio-player.js's own two real, testing-found bugs:
      // progressHydrated prevents writing before localStorage has been read once (a
      // beforeunload/visibilitychange save firing first would erase real prior progress
      // with the freshly-initialized zeros); hasEngaged additionally prevents writing
      // before the learner has actually played or sought *this load* (video.currentTime is
      // still genuinely 0 right after hydration — a save in that window would silently
      // overwrite a real stored position with 0 even while the resume prompt was still
      // showing the correct value, unacted on).
      var progressHydrated = !PROGRESS_PERSISTENCE;
      var hasEngaged = false;

      function announce(text) { if (statusEl) statusEl.textContent = text; }

      function saveProgress(force) {
        if (!PROGRESS_PERSISTENCE || !progressHydrated || !hasEngaged) return;
        var now = Date.now();
        if (!force && now - lastSaveTime < 5000) return;
        lastSaveTime = now;
        vidWriteProgress(progressKey, {
          position: video.currentTime || 0,
          furthest: furthestPosition,
          completed: completed,
          updatedAt: now
        });
      }

      function updateProgressStatusText() {
        if (!progressTextEl) return;
        if (completed) { progressTextEl.textContent = 'Completed'; return; }
        if (video.duration && furthestPosition > 0) {
          var pct = Math.round(Math.max(0, Math.min(1, furthestPosition / video.duration)) * 100);
          progressTextEl.textContent = pct + '% watched';
          return;
        }
        progressTextEl.textContent = 'Not started';
      }

      function markCompleted() {
        if (completed) return;
        completed = true;
        saveProgress(true);
        if (TAKEAWAYS_VISIBILITY === 'afterCompletion' && takeawaysList) {
          takeawaysList.hidden = false;
          if (takeawaysLocked) takeawaysLocked.hidden = true;
        }
        updateProgressStatusText();
        announce('Video completed.' + (TAKEAWAYS_COUNT ? ' Key takeaways are now available.' : ''));
        viewedItems.add(0);
        updateProgress();
      }

      function checkCompletion() {
        if (completed || !video.duration) return;
        var reachedThreshold = (video.currentTime / video.duration) >= VID_COMPLETION_THRESHOLD;
        var reachedTail = (video.duration - video.currentTime) <= VID_COMPLETION_TAIL_SECONDS;
        if (reachedThreshold || reachedTail) markCompleted();
      }

      // --- Playback core: play/pause, Replay/Forward, scrub, speed, mute ---
      function toggleVideoPlayback() {
        if (video.paused) {
          video.play().catch(function() { /* autoplay blocked or invalid source URL */ });
        } else {
          video.pause();
        }
      }
      if (overlayPlay) overlayPlay.addEventListener('click', toggleVideoPlayback);
      if (miniPlay) miniPlay.addEventListener('click', toggleVideoPlayback);

      video.addEventListener('play', function() {
        hasEngaged = true;
        // Pause any other audio/video element on the page — multiple instances of this
        // (or any other) component must operate independently, but only one should audibly
        // play at once. Plain DOM traversal, no shared global state.
        var others = document.querySelectorAll('audio, video');
        for (var i = 0; i < others.length; i++) {
          if (others[i] !== video && !others[i].paused) others[i].pause();
        }
        if (overlayPlay) overlayPlay.style.display = 'none';
        if (miniPlay) {
          miniPlay.querySelector('.video-play-svg').style.display = 'none';
          miniPlay.querySelector('.video-pause-svg').style.display = 'block';
          miniPlay.setAttribute('aria-label', 'Pause video');
          miniPlay.setAttribute('aria-pressed', 'true');
        }
        if (resumePrompt && !resumePrompt.hidden) resumePrompt.hidden = true;
        announce('Playing.');
      });
      video.addEventListener('pause', function() {
        if (overlayPlay && !video.ended) overlayPlay.style.display = 'flex';
        if (miniPlay) {
          miniPlay.querySelector('.video-play-svg').style.display = 'block';
          miniPlay.querySelector('.video-pause-svg').style.display = 'none';
          miniPlay.setAttribute('aria-label', 'Play video');
          miniPlay.setAttribute('aria-pressed', 'false');
        }
        saveProgress(true);
        if (!video.ended) announce('Paused.');
      });

      function skipBy(delta) {
        if (!Number.isFinite(video.duration)) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
      }
      if (skipBackBtn) skipBackBtn.addEventListener('click', function() { skipBy(-VID_SKIP_SECONDS); });
      if (skipForwardBtn) skipForwardBtn.addEventListener('click', function() { skipBy(VID_SKIP_SECONDS); });

      function scrubVideo(event) {
        var rect = scrubBar.getBoundingClientRect();
        var percentage = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        scrubFill.style.width = percentage + '%';
        scrubBar.setAttribute('aria-valuenow', String(Math.round(percentage)));
        scrubBar.setAttribute('aria-valuetext', Math.round(percentage) + ' percent');
        if (video.duration) video.currentTime = video.duration * percentage / 100;
      }
      scrubBar.addEventListener('click', scrubVideo);
      scrubBar.addEventListener('keydown', function(event) {
        if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].indexOf(event.key) === -1) return;
        event.preventDefault();
        var value = Number(scrubBar.getAttribute('aria-valuenow')) || 0;
        if (event.key === 'Home') value = 0;
        else if (event.key === 'End') value = 100;
        else value += (event.key === 'ArrowRight' || event.key === 'ArrowUp') ? 5 : -5;
        value = Math.max(0, Math.min(100, value));
        scrubBar.setAttribute('aria-valuenow', String(value));
        scrubBar.setAttribute('aria-valuetext', value + ' percent');
        scrubFill.style.width = value + '%';
        if (video.duration) video.currentTime = video.duration * value / 100;
      });

      if (speedBtn) speedBtn.addEventListener('click', function() {
        var current = video.playbackRate || 1;
        var idx = VID_SPEEDS.indexOf(current);
        if (idx === -1) idx = 0;
        var next = VID_SPEEDS[(idx + 1) % VID_SPEEDS.length];
        video.playbackRate = next;
        var label = next + 'x';
        speedBtn.textContent = label;
        speedBtn.setAttribute('aria-label', 'Playback speed: ' + label);
      });

      if (muteBtn) muteBtn.addEventListener('click', function() {
        video.muted = !video.muted;
        var onSvg = muteBtn.querySelector('.video-volume-on-svg');
        var offSvg = muteBtn.querySelector('.video-volume-off-svg');
        if (video.muted) {
          if (onSvg) onSvg.style.display = 'none';
          if (offSvg) offSvg.style.display = 'block';
          muteBtn.setAttribute('aria-label', 'Unmute video');
          muteBtn.setAttribute('aria-pressed', 'true');
        } else {
          if (onSvg) onSvg.style.display = 'block';
          if (offSvg) offSvg.style.display = 'none';
          muteBtn.setAttribute('aria-label', 'Mute video');
          muteBtn.setAttribute('aria-pressed', 'false');
        }
      });

      // --- Chapters: markers on the scrub bar, chapter list, "current chapter" label ---
      function renderChapterMarkers() {
        if (!chapterMarkersEl || !video.duration || !CHAPTERS.length) return;
        chapterMarkersEl.innerHTML = '';
        CHAPTERS.forEach(function(chapter, i) {
          if (chapter.timestamp > video.duration) return;
          // Inset slightly from the very ends of the track — see
          // components/audio-player.js's identical comment for why.
          var pct = Math.max(6, Math.min(94, (chapter.timestamp / video.duration) * 100));
          var marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'video-chapter-marker';
          marker.style.left = pct + '%';
          marker.setAttribute('aria-label', 'Jump to chapter: ' + chapter.title + ', ' + vidFormatTime(chapter.timestamp));
          marker.addEventListener('click', function(event) {
            event.stopPropagation();
            seekTo(chapter.timestamp);
          });
          chapterMarkersEl.appendChild(marker);
        });
      }

      function seekTo(seconds) {
        video.currentTime = seconds;
        if (video.paused) video.play().catch(function() {});
      }

      if (chapterListEl) {
        Array.prototype.forEach.call(chapterListEl.querySelectorAll('.video-chapter-item'), function(btn) {
          btn.addEventListener('click', function() {
            var time = Number(btn.getAttribute('data-time'));
            if (Number.isFinite(time)) seekTo(time);
          });
        });
      }

      if (chapterToggle && chapterListEl) {
        chapterToggle.addEventListener('click', function() {
          var expanded = chapterToggle.getAttribute('aria-expanded') === 'true';
          chapterToggle.setAttribute('aria-expanded', String(!expanded));
          chapterListEl.hidden = expanded;
        });
      }

      function updateCurrentChapter() {
        if (!CHAPTERS.length) return;
        var activeIdx = -1;
        for (var i = 0; i < CHAPTERS.length; i++) {
          if (CHAPTERS[i].timestamp <= video.currentTime) activeIdx = i; else break;
        }
        if (activeIdx === lastActiveChapterIdx) return;
        lastActiveChapterIdx = activeIdx;
        var active = activeIdx >= 0 ? CHAPTERS[activeIdx] : null;
        if (currentChapterEl && active) currentChapterEl.textContent = active.title;
        if (chapterListEl) {
          Array.prototype.forEach.call(chapterListEl.querySelectorAll('.video-chapter-item'), function(el, i) {
            var isActive = i === activeIdx;
            el.classList.toggle('video-chapter-active', isActive);
            if (isActive) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
          });
        }
      }

      // --- Synchronized transcript: toggle, search, click-to-seek, active-segment sync ---
      if (transcriptToggle && transcriptPanel) {
        transcriptToggle.addEventListener('click', function() {
          var expanded = transcriptToggle.getAttribute('aria-expanded') === 'true';
          transcriptToggle.setAttribute('aria-expanded', String(!expanded));
          transcriptPanel.hidden = expanded;
          var label = transcriptToggle.querySelector('span');
          if (label) label.textContent = expanded ? 'Show Transcript' : 'Hide Transcript';
        });
      }

      if (transcriptSegmentsEl) {
        Array.prototype.forEach.call(transcriptSegmentsEl.querySelectorAll('.video-transcript-segment'), function(btn) {
          btn.addEventListener('click', function() {
            var time = Number(btn.getAttribute('data-time'));
            if (Number.isFinite(time)) { transcriptUserScrolled = false; seekTo(time); }
          });
        });
        transcriptPanel && transcriptPanel.addEventListener('scroll', function() {
          if (programmaticScroll) return;
          transcriptUserScrolled = true;
        });
      }

      if (transcriptSearch) {
        transcriptSearch.addEventListener('input', function() {
          var query = transcriptSearch.value.trim();
          var elements = transcriptSegmentsEl ? transcriptSegmentsEl.querySelectorAll('.video-transcript-segment') : [];
          var matches = 0;
          Array.prototype.forEach.call(elements, function(el, i) {
            var segment = SEGMENTS[i];
            var isMatch = !query || segment.text.toLowerCase().indexOf(query.toLowerCase()) !== -1
              || (segment.speaker && segment.speaker.toLowerCase().indexOf(query.toLowerCase()) !== -1);
            el.hidden = !isMatch;
            var textSpan = el.querySelector('.video-segment-text');
            if (textSpan) vidRenderSegmentText(textSpan, segment.text, query);
            if (isMatch) matches++;
          });
          if (transcriptNoResults) transcriptNoResults.hidden = !(query && matches === 0);
          if (transcriptSearchStatus) {
            transcriptSearchStatus.textContent = query
              ? (matches + ' matching line' + (matches === 1 ? '' : 's') + ' found.')
              : '';
          }
        });
      }

      function updateActiveSegment() {
        if (!SEGMENTS.length || !transcriptSegmentsEl) return;
        var activeIdx = -1;
        for (var i = 0; i < SEGMENTS.length; i++) {
          if (SEGMENTS[i].timestamp <= video.currentTime) activeIdx = i; else break;
        }
        if (activeIdx === lastActiveSegmentIdx) return;
        lastActiveSegmentIdx = activeIdx;
        var elements = transcriptSegmentsEl.querySelectorAll('.video-transcript-segment');
        Array.prototype.forEach.call(elements, function(el, i) { el.classList.toggle('video-segment-active', i === activeIdx); });
        if (activeIdx !== -1 && !transcriptUserScrolled && transcriptPanel && !transcriptPanel.hidden) {
          var el = elements[activeIdx];
          if (el) {
            var panelRect = transcriptPanel.getBoundingClientRect();
            var elRect = el.getBoundingClientRect();
            var inView = elRect.top >= panelRect.top && elRect.bottom <= panelRect.bottom;
            if (!inView) {
              programmaticScroll = true;
              el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
              setTimeout(function() { programmaticScroll = false; }, 400);
            }
          }
        }
      }

      // --- Resume prompt ---
      function showResumePrompt(position) {
        if (!resumePrompt || resumeHandled) return;
        resumeHandled = true;
        if (resumeText) resumeText.textContent = 'Resume from ' + vidFormatTime(position);
        resumePrompt.hidden = false;
      }
      if (resumeBtn) resumeBtn.addEventListener('click', function() {
        if (resumePrompt) resumePrompt.hidden = true;
        var stored = vidReadProgress(progressKey);
        if (stored && Number.isFinite(stored.position)) video.currentTime = stored.position;
        video.play().catch(function() {});
      });
      if (restartChoiceBtn) restartChoiceBtn.addEventListener('click', function() {
        if (resumePrompt) resumePrompt.hidden = true;
        video.currentTime = 0;
      });

      // --- Metadata / timeupdate / ended wiring ---
      video.addEventListener('seeking', function() { hasEngaged = true; });

      video.addEventListener('loadedmetadata', function() {
        if (skipBackBtn) skipBackBtn.disabled = false;
        if (skipForwardBtn) skipForwardBtn.disabled = false;
        if (timerEl) timerEl.textContent = vidFormatTime(video.currentTime) + ' / ' + vidFormatTime(video.duration);
        renderChapterMarkers();
        if (PROGRESS_PERSISTENCE) {
          var stored = vidReadProgress(progressKey);
          if (stored) {
            furthestPosition = Number.isFinite(stored.furthest) ? stored.furthest : 0;
            completed = Boolean(stored.completed);
            updateProgressStatusText();
            var withinTail = Number.isFinite(video.duration) && (video.duration - stored.position) <= VID_COMPLETION_TAIL_SECONDS;
            if (!completed && stored.position >= VID_RESUME_MIN_SECONDS && !withinTail) showResumePrompt(stored.position);
            if (completed && TAKEAWAYS_VISIBILITY === 'afterCompletion' && takeawaysList) {
              takeawaysList.hidden = false;
              if (takeawaysLocked) takeawaysLocked.hidden = true;
            }
          }
          progressHydrated = true;
        }
      });

      video.addEventListener('timeupdate', function() {
        if (!video.duration) return;
        var value = Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
        scrubBar.setAttribute('aria-valuenow', String(Math.round(value)));
        scrubBar.setAttribute('aria-valuetext', vidFormatTime(video.currentTime) + ' of ' + vidFormatTime(video.duration));
        scrubFill.style.width = value + '%';
        if (timerEl) timerEl.textContent = vidFormatTime(video.currentTime) + ' / ' + vidFormatTime(video.duration);
        if (video.currentTime > furthestPosition) furthestPosition = video.currentTime;
        updateCurrentChapter();
        updateActiveSegment();
        updateProgressStatusText();
        saveProgress(false);
        checkCompletion();
      });

      video.addEventListener('ended', function() {
        // markCompleted() itself calls viewedItems.add(0)/updateProgress() — the shared
        // completion tracker every component wires into.
        furthestPosition = video.duration || furthestPosition;
        markCompleted();
      });

      window.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') saveProgress(true); });
      window.addEventListener('beforeunload', function() { saveProgress(true); });
    }

    function initComponent() { initVideoPlayer(); }`;
}

export function validate(config) {
  const errors = Array.isArray(config.items) && config.items.length ? [] : ['Add a video.'];
  return { valid: errors.length === 0, errors };
}
