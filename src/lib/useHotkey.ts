import { useEffect, useEffectEvent } from 'react';
import { isEditableTarget, matchesShortcut } from './shortcuts';

/**
 * Calls `handler` when `shortcut` is pressed anywhere in the window while
 * `enabled`. Shortcuts without Ctrl/⌘/Alt are ignored inside text fields.
 */
export function useHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const onShortcut = useEffectEvent(handler);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, shortcut)) return;
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
      if (!hasModifier && isEditableTarget(event.target)) return;
      event.preventDefault();
      onShortcut(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcut, enabled]);
}
