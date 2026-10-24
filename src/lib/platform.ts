/** True on macOS, where shortcuts use ⌘ instead of Ctrl. */
export const isMac: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);
