import { isMac } from './platform';

/**
 * Keyboard shortcuts, written as `mod+shift+k`. `mod` is ⌘ on macOS and
 * Ctrl elsewhere. One table feeds the global handler, tooltips, menus and the
 * command palette, so a shortcut is always shown where its action lives.
 */
export const SHORTCUTS = {
  palette: 'mod+k',
  openRepo: 'mod+o',
  cloneRepo: 'mod+shift+o',
  home: 'mod+t',
  closeTab: 'mod+w',
  nextTab: 'ctrl+tab',
  prevTab: 'ctrl+shift+tab',
  fetch: 'mod+shift+f',
  pull: 'mod+shift+l',
  push: 'mod+shift+p',
  newBranch: 'mod+b',
  stash: 'mod+shift+s',
  popStash: 'mod+shift+a',
  showChanges: 'mod+shift+m',
  commit: 'mod+enter',
  stageAll: 'mod+shift+enter',
  undo: 'mod+z',
  search: 'mod+f',
  toggleDiffMode: 'mod+shift+d',
  settings: 'mod+,',
  nextChange: 'alt+arrowdown',
  prevChange: 'alt+arrowup',
  close: 'escape',
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;

interface Combo {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export function parseShortcut(shortcut: string): Combo {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return {
    mod: parts.includes('mod'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key,
  };
}

/** True when `event` is exactly the given shortcut (no extra modifiers). */
export function matchesShortcut(event: KeyboardEvent, shortcut: string, mac = isMac): boolean {
  const combo = parseShortcut(shortcut);
  const wantMeta = combo.mod && mac;
  const wantCtrl = combo.ctrl || (combo.mod && !mac);
  return (
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === combo.shift &&
    event.altKey === combo.alt &&
    normalizeKey(event) === combo.key
  );
}

function normalizeKey(event: KeyboardEvent): string {
  // Letters and digits by physical key so Shift/Alt and keyboard layouts
  // (e.g. Alt producing special characters on macOS) do not change them.
  const code = event.code;
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return event.key.toLowerCase();
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
};

const KEY_NAMES: Record<string, string> = {
  enter: '↵',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  tab: 'Tab',
  ',': ',',
};

/** Display labels of a shortcut's keys, e.g. `['Ctrl', 'Shift', 'P']`. */
export function formatShortcut(shortcut: string, mac = isMac): string[] {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts.map((part) => {
    if (mac) return MAC_SYMBOLS[part] ?? part;
    if (part === 'mod' || part === 'ctrl') return 'Ctrl';
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  return [...modifiers, KEY_NAMES[key] ?? key.toUpperCase()];
}

/** True when focus is in a text field, where plain shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
