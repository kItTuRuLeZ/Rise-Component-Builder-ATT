import { describe, expect, test } from 'vitest';
import * as audioPlayer from '../../components/audio-player.js';
import * as videoFrame from '../../components/video-frame.js';
import * as interactiveVideo from '../../components/interactive-video.js';
import { createMediaReference } from '../../js/media.js';
import { collectSyncIssues, SEVERITY } from '../../js/validation.js';

// Audit 2026-09-30, section 3: replacing the default audio with a 12-second file left a chapter
// at 0:45 and Preflight said nothing. Chapters, synchronized-transcript rows and Interactive Video
// markers are timestamps into a media file, so each is checked against that file's recorded
// length (the `duration` stored on its media reference), and an unknown length is reported as
// unverified rather than passing silently.

function upload(kind, durationSeconds) {
  return createMediaReference({ id: `media-${kind}`, kind, name: `clip.${kind === 'audio' ? 'wav' : 'mp4'}`, duration: durationSeconds });
}

function issuesFor(component, config) {
  return collectSyncIssues({
    componentId: component.id, schema: component.editorSchema, config,
    theme: {}, componentOverrides: {}, settings: {}
  });
}

function audioConfig({ content, chapters = '', transcriptSegments = '' }) {
  return { items: [{ title: 'Clip', content }], chapters, transcriptSegments };
}

const byRule = (issues, id) => issues.filter(item => item.ruleId === id);

describe.each([
  ['audio-player', audioPlayer, 'audio'],
  ['video-frame', videoFrame, 'video']
])('%s: chapters and transcript rows vs. the attached file length', (id, component, kind) => {
  const config = overrides => audioConfig({ content: upload(kind, 12), ...overrides });

  test('a chapter at 0:45 on a 12-second file is a Warning naming the row, timestamp and permitted range', () => {
    const issues = byRule(issuesFor(component, config({ chapters: '0:05 | Intro\n0:45 | Late chapter' })), `${id}-chapter-outside-duration`);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe(SEVERITY.WARNING);
    expect(issues[0].explanation).toContain('Chapter 2 ("Late chapter")');
    expect(issues[0].explanation).toContain('0:45');
    expect(issues[0].explanation).toContain('only 0:12 long');
    expect(issues[0].explanation).toContain('0:00 to 0:12');
    expect(issues[0].fieldId).toBe('chapters');
  });

  test('the message states that export is not blocked and that nothing was changed', () => {
    const [found] = byRule(issuesFor(component, config({ chapters: '0:45 | Late' })), `${id}-chapter-outside-duration`);
    expect(found.explanation).toMatch(/does not block export/i);
    expect(found.explanation).toMatch(/nothing was changed or removed/i);
  });

  test('chapters inside the file pass, and the timestamps count as verified (no unverified note)', () => {
    const issues = issuesFor(component, config({ chapters: '0:00 | Start\n0:05 | Middle\n0:11 | Near the end' }));
    expect(byRule(issues, `${id}-chapter-outside-duration`)).toEqual([]);
    expect(byRule(issues, `${id}-timestamps-unverified`)).toEqual([]);
  });

  test('end boundary: a timestamp equal to the length is valid, one second past it is not', () => {
    const atEnd = issuesFor(component, config({ chapters: '0:12 | At the end' }));
    expect(byRule(atEnd, `${id}-chapter-outside-duration`)).toEqual([]);
    const pastEnd = issuesFor(component, config({ chapters: '0:13 | One past' }));
    expect(byRule(pastEnd, `${id}-chapter-outside-duration`)).toHaveLength(1);
  });

  test('a fractional length is honoured exactly (12.6s: 0:12 is inside, 0:13 is not) and shown to one decimal', () => {
    const fractional = { content: upload(kind, 12.6) };
    expect(byRule(issuesFor(component, audioConfig({ ...fractional, chapters: '0:12 | In' })), `${id}-chapter-outside-duration`)).toEqual([]);
    const [found] = byRule(issuesFor(component, audioConfig({ ...fractional, chapters: '0:13 | Out' })), `${id}-chapter-outside-duration`);
    expect(found.explanation).toContain('only 0:12.6 long');
  });

  test('synchronized transcript rows are checked the same way, with their own rule and field', () => {
    const [found] = byRule(issuesFor(component, config({ transcriptSegments: '0:03 | Host | Fine\n1:30 | Host | Way past' })), `${id}-transcript-segment-outside-duration`);
    expect(found.severity).toBe(SEVERITY.WARNING);
    expect(found.explanation).toContain('Synchronized transcript row 2');
    expect(found.fieldId).toBe('transcriptSegments');
  });

  test('hour-long timestamps and lengths are formatted as h:mm:ss', () => {
    const long = audioConfig({ content: upload(kind, 3725), chapters: '1:05:00 | Late' });
    const [found] = byRule(issuesFor(component, long), `${id}-chapter-outside-duration`);
    expect(found.explanation).toContain('1:05:00');
    expect(found.explanation).toContain('1:02:05');
  });

  test('replacing the file re-checks the same chapters: the old file flagged them, the longer one does not', () => {
    const chapters = '0:05 | Intro\n0:45 | Late chapter';
    expect(byRule(issuesFor(component, audioConfig({ content: upload(kind, 12), chapters })), `${id}-chapter-outside-duration`)).toHaveLength(1);
    expect(byRule(issuesFor(component, audioConfig({ content: upload(kind, 120), chapters })), `${id}-chapter-outside-duration`)).toEqual([]);
  });

  test.each([
    ['an external URL', 'https://cdn.example.org/clip.mp3'],
    ['an upload whose length could not be read', createMediaReference({ id: 'm', kind, name: 'clip', duration: null })],
    ['an upload recorded with a zero length', createMediaReference({ id: 'm', kind, name: 'clip', duration: 0 })]
  ])('with %s the timestamps are reported as unverified, never as passing', (_label, content) => {
    const issues = issuesFor(component, audioConfig({ content, chapters: '0:45 | Anything' }));
    const [note] = byRule(issues, `${id}-timestamps-unverified`);
    expect(note.severity).toBe(SEVERITY.RECOMMENDATION);
    expect(note.explanation).toMatch(/not known/i);
    expect(note.explanation).toMatch(/have not been checked/i);
    expect(byRule(issues, `${id}-chapter-outside-duration`)).toEqual([]);
  });

  test('with no chapters or transcript rows there is nothing to verify and no note', () => {
    for (const content of ['https://cdn.example.org/clip.mp3', upload(kind, 12)]) {
      const issues = issuesFor(component, audioConfig({ content }));
      expect(byRule(issues, `${id}-timestamps-unverified`)).toEqual([]);
      expect(byRule(issues, `${id}-chapter-outside-duration`)).toEqual([]);
    }
  });

  test('malformed rows keep their existing invalid-row warning and are not also range-checked', () => {
    const issues = issuesFor(component, config({ chapters: 'not-a-time | Broken\n-5 | Negative\n0:03 | Fine' }));
    expect(byRule(issues, `${id}-invalid-chapter-line`)).toHaveLength(2);
    expect(byRule(issues, `${id}-chapter-outside-duration`)).toEqual([]);
  });

  test('nothing is rewritten: the config is unchanged by validation', () => {
    const before = config({ chapters: '0:05 | Intro\n0:45 | Late chapter' });
    const snapshot = JSON.stringify(before);
    issuesFor(component, before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('interactive-video: markers vs. the uploaded video length', () => {
  const marker = timestamp => ({ type: 'information', title: 'Marker', content: 'Body', timestamp, pauseVideo: true, required: false });
  const config = overrides => ({ ...interactiveVideo.defaultConfig, videoSourceType: 'upload', videoMediaId: upload('video', 30), items: [marker(10)], ...overrides });

  test('a marker past an uploaded video\'s recorded length is flagged without the editor ever loading the video', () => {
    const issues = issuesFor(interactiveVideo, config({ items: [marker(10), marker(95)] }));
    const [found] = byRule(issues, 'interactive-video-marker-outside-duration');
    expect(found.explanation).toContain('Marker 2');
    expect(byRule(issues, 'interactive-video-duration-unknown')).toEqual([]);
  });

  test('replacing the video re-checks the markers: a 30s upload flags 95s, a 120s one does not', () => {
    const items = [marker(95)];
    expect(byRule(issuesFor(interactiveVideo, config({ items })), 'interactive-video-marker-outside-duration')).toHaveLength(1);
    expect(byRule(issuesFor(interactiveVideo, config({ items, videoMediaId: upload('video', 120) })), 'interactive-video-marker-outside-duration')).toEqual([]);
  });

  test('the live measurement from the editor preview wins over the recorded length', () => {
    const issues = issuesFor(interactiveVideo, config({ items: [marker(95)], videoDurationSeconds: 200 }));
    expect(byRule(issues, 'interactive-video-marker-outside-duration')).toEqual([]);
  });

  test('an external URL whose metadata has not loaded is reported as unverified', () => {
    const issues = issuesFor(interactiveVideo, config({ videoSourceType: 'url', videoUrl: 'https://cdn.example.org/v.mp4', videoMediaId: '', items: [marker(95)] }));
    const [note] = byRule(issues, 'interactive-video-duration-unknown');
    expect(note.severity).toBe(SEVERITY.RECOMMENDATION);
    expect(note.explanation).toMatch(/not known yet/i);
    expect(byRule(issues, 'interactive-video-marker-outside-duration')).toEqual([]);
  });

  test('once the preview has measured the external video the unverified note goes away and the check runs', () => {
    const issues = issuesFor(interactiveVideo, config({ videoSourceType: 'url', videoUrl: 'https://cdn.example.org/v.mp4', videoMediaId: '', items: [marker(95)], videoDurationSeconds: 60 }));
    expect(byRule(issues, 'interactive-video-duration-unknown')).toEqual([]);
    expect(byRule(issues, 'interactive-video-marker-outside-duration')).toHaveLength(1);
  });

  test('a video with no markers has nothing to verify and no note', () => {
    const issues = issuesFor(interactiveVideo, config({ videoSourceType: 'url', videoUrl: 'https://cdn.example.org/v.mp4', videoMediaId: '', items: [] }));
    expect(byRule(issues, 'interactive-video-duration-unknown')).toEqual([]);
  });
});
