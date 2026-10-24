import { describe, expect, it } from 'vitest';
import { reflowParagraphs } from './text';

describe('reflowParagraphs', () => {
  it('joins hard-wrapped lines within a paragraph', () => {
    expect(
      reflowParagraphs('We now store keys as\nOsString values.\n\nSecond paragraph\nhere.'),
    ).toEqual(['We now store keys as OsString values.', 'Second paragraph here.']);
  });

  it('keeps lists, indented code and trailers as written', () => {
    const body =
      '- one\n- two\n\n    let x = 1;\n    x + 1\n\nSigned-off-by: Ana <a@b.c>\nCo-authored-by: Bo <b@c.d>';
    expect(reflowParagraphs(body)).toEqual([
      '- one\n- two',
      '    let x = 1;\n    x + 1',
      'Signed-off-by: Ana <a@b.c>\nCo-authored-by: Bo <b@c.d>',
    ]);
  });

  it('ignores empty paragraphs', () => {
    expect(reflowParagraphs('\n\n\n')).toEqual([]);
  });
});
