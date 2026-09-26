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
