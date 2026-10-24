import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, parseShortcut } from './shortcuts';

function key(init: KeyboardEventInit & { code?: string }) {
  return new KeyboardEvent('keydown', init);
}

describe('shortcuts', () => {
  it('parses modifiers and key', () => {
    expect(parseShortcut('mod+shift+P')).toEqual({
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
      key: 'p',
    });
  });

  it('matches mod as Ctrl on Linux/Windows and ⌘ on macOS', () => {
    const ctrlK = key({ key: 'k', code: 'KeyK', ctrlKey: true });
    const metaK = key({ key: 'k', code: 'KeyK', metaKey: true });
    expect(matchesShortcut(ctrlK, 'mod+k', false)).toBe(true);
    expect(matchesShortcut(metaK, 'mod+k', false)).toBe(false);
    expect(matchesShortcut(metaK, 'mod+k', true)).toBe(true);
  });

  it('requires the exact set of modifiers', () => {
    const ctrlShiftK = key({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(ctrlShiftK, 'mod+k', false)).toBe(false);
    expect(matchesShortcut(ctrlShiftK, 'mod+shift+k', false)).toBe(true);
  });

  it('matches named keys', () => {
    expect(matchesShortcut(key({ key: 'Enter', code: 'Enter', ctrlKey: true }), 'mod+enter', false)).toBe(true);
    expect(matchesShortcut(key({ key: 'ArrowDown', code: 'ArrowDown', altKey: true }), 'alt+arrowdown', false)).toBe(true);
    expect(matchesShortcut(key({ key: 'Escape', code: 'Escape' }), 'escape', false)).toBe(true);
  });

  it('formats for each platform', () => {
    expect(formatShortcut('mod+shift+p', false)).toEqual(['Ctrl', 'Shift', 'P']);
    expect(formatShortcut('mod+shift+p', true)).toEqual(['⌘', '⇧', 'P']);
    expect(formatShortcut('mod+enter', false)).toEqual(['Ctrl', '↵']);
  });
});
