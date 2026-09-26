import { describe, expect, it } from 'vitest';
import * as flipCards from '../../components/flip-cards.js';
import * as verticalTimeline from '../../components/vertical-timeline.js';
import * as horizontalTimeline from '../../components/horizontal-timeline.js';
import * as processFlow from '../../components/process-flow.js';
import { editorSchemas } from '../../js/editor-schemas.js';
import { createEmptyItemMedia } from '../../js/item-media.js';

const image = { ...createEmptyItemMedia('image'), sourceType: 'url', src: 'https://example.com/pic.png', alt: 'A picture' };
const badImage = { ...createEmptyItemMedia('image'), sourceType: 'url', src: '', mediaId: '', alt: '' };
const items = () => [
  { title: 'First', content: 'First body', media: image },
  { title: 'Second', content: 'Second body' },
  { title: 'Third', content: 'Third body' }
];

const cases = [
  ['flip-cards', 'flip-cards', flipCards],
  ['vertical-timeline', 'vertical-timeline', verticalTimeline],
  ['horizontal-timeline', 'horizontal-timeline', horizontalTimeline],
  ['process-flow', 'process-flow', processFlow]
];

describe('item media on Flip Cards, Timelines and Process Flow', () => {
  for (const [name, schemaId, mod] of cases) {
    describe(name, () => {
      it('is offered in the editor', () => {
        expect(editorSchemas[schemaId].supportsItemMedia).toBe(true);
      });

      it('renders the media with its item, and only there', () => {
        const html = mod.generateHTML({ ...mod.defaultConfig, items: items() }, 'rcb-x');
        expect(html).toContain('https://example.com/pic.png');
        expect(html.match(/item-content-layout/g).length).toBe(1);
      });

      it('ships the media styles', () => {
        expect(mod.generateCSS()).toContain('.item-content-layout');
      });

      it('reports media problems in validation', () => {
        const result = mod.validate({ ...mod.defaultConfig, items: items().map((i, n) => (n === 0 ? { ...i, media: badImage } : i)) });
        expect(result.valid).toBe(false);
      });
    });
  }

  it('Flip Cards offers images only (a card is one button)', () => {
    expect(editorSchemas['flip-cards'].itemMediaTypes).toEqual(['image']);
  });

  it('a Flip Card with media is marked so it can grow taller', () => {
    const html = flipCards.generateHTML({ ...flipCards.defaultConfig, items: [{ title: 'Front', content: 'F', media: image }, { title: 'Back', content: 'B' }] }, 'rcb-x');
    expect(html).toContain('flip-card has-media');
  });

  it('media that is playing stops when the reader moves on', () => {
    for (const mod of [verticalTimeline, horizontalTimeline, processFlow]) {
      expect(mod.generateJS({ ...mod.defaultConfig, timelineCollapsibleDetails: true }, 'rcb-x')).toContain("querySelectorAll('audio, video')");
    }
  });
});
