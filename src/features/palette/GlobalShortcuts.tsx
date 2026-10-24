import { useEffect, useEffectEvent } from 'react';
import { isEditableTarget, matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { useDialogs } from '@/features/dialogs/store';
import { useAppCommands } from './commands';
import { usePalette } from './store';

/** Binds the global shortcuts of the command registry to the window. */
export function GlobalShortcuts() {
  const commands = useAppCommands();
  const currentCommands = useEffectEvent(() => commands);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const editing = isEditableTarget(event.target);
      const modal = useDialogs.getState().current !== null || usePalette.getState().isOpen;
      for (const command of currentCommands()) {
        if (!command.global || !command.shortcut || !matchesShortcut(event, command.shortcut))
          continue;
        // Inside text fields keep native undo and plain keys.
        if (
          editing &&
          (command.shortcut === SHORTCUTS.undo || !(event.ctrlKey || event.metaKey || event.altKey))
        )
          return;
        // While a dialog is open only the palette toggle stays active.
        if (modal && command.id !== 'palette') return;
        event.preventDefault();
        command.run();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  return null;
}
