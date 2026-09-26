import { describe, expect, it } from 'vitest';
import * as fillBlank from '../../components/fill-blank.js';

describe('Fill-in-the-Blank: several blanks in one sentence', () => {
  it('counts blanks and splits the answer field one line per blank', () => {
    const item = { title: 'A [blank] and a [blank].', content: 'first, one\nsecond' };
    expect(fillBlank.countBlanks(item.title)).toBe(2);
    expect(fillBlank.getBlankAnswers(item)).toEqual(['first, one', 'second']);
  });

  it('keeps a one-blank sentence working as before, commas and all', () => {
    expect(fillBlank.getBlankAnswers({ title: 'A [blank].', content: 'x, y, z' })).toEqual(['x, y, z']);
  });

  it('asks for an answer line for every blank', () => {
    const result = fillBlank.validate({ items: [{ title: 'A [blank], a [blank] and a [blank].', content: 'one\ntwo' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/3 blanks.*Blank 3 has no answer/);
  });

  it('accepts a complete multi-blank sentence', () => {
    const result = fillBlank.validate({ items: [{ title: 'A [blank], a [blank].', content: 'one\ntwo' }] });
    expect(result.valid).toBe(true);
  });
});

describe('Fill-in-the-Blank: clues for several blanks', () => {
  const sentence = 'A [blank], a [blank] and a [blank].';

  it('gives each blank its own clue when the clue field has one line per blank', () => {
    const clues = fillBlank.getBlankClues({ title: sentence, hint: 'first clue\n\nthird clue' });
    expect(clues).toEqual([{ blank: 0, text: 'first clue' }, { blank: 2, text: 'third clue' }]);
  });

  it('treats a single-line clue as one clue for the whole sentence, as before', () => {
    expect(fillBlank.getBlankClues({ title: sentence, hint: 'Think about constraints' })).toEqual([{ blank: null, text: 'Think about constraints' }]);
    expect(fillBlank.getBlankClues({ title: 'A [blank].', hint: 'one' })).toEqual([{ blank: null, text: 'one' }]);
  });

  it('has no clues when the field is empty', () => {
    expect(fillBlank.getBlankClues({ title: sentence, hint: '  ' })).toEqual([]);
  });

  it('renders a clue button per blank that has one', () => {
    const html = fillBlank.generateHTML({ ...fillBlank.defaultConfig, items: [{ title: sentence, content: 'a\nb\nc', hint: 'one\ntwo\nthree' }] }, 'rcb-x');
    expect(html.match(/class="blank-hint-btn"/g)).toHaveLength(3);
    expect(html).toContain('Clue for blank 2');
    expect(html).toContain('id="rcb-x-hint-box-0-2"');
  });
});
