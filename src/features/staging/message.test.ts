import { describe, expect, it } from 'vitest';
import { composeMessage, splitMessage } from './message';

describe('commit messages', () => {
  it('composes summary and description separated by a blank line', () => {
    expect(composeMessage({ summary: ' Fix bug ', description: '' })).toBe('Fix bug');
    expect(composeMessage({ summary: 'Fix bug', description: 'Details\nmore' })).toBe(
      'Fix bug\n\nDetails\nmore',
    );
  });

  it('round-trips through split', () => {
    const message = 'Add login\n\nUses OAuth.\nCloses #12';
    expect(composeMessage(splitMessage(message))).toBe(message);
    expect(splitMessage('Only summary')).toEqual({ summary: 'Only summary', description: '' });
  });
});
