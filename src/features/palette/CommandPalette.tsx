import { Command } from 'cmdk';
import { useMemo } from 'react';
import { Cursor, Kbd } from '@/ui';
import { useAppCommands, type CommandSection } from './commands';
import { usePalette } from './store';

const ORDER: CommandSection[] = ['Repositorio', 'Cambios', 'Remotos', 'Ramas', 'Vista', 'General'];

/** Ctrl/⌘+K: every action of the app, searchable by name. */
export function CommandPalette() {
  const isOpen = usePalette((s) => s.isOpen);
  const close = usePalette((s) => s.close);
  const commands = useAppCommands();
  const groups = useMemo(
    () =>
      ORDER.map((section) => ({
        section,
        items: commands.filter((c) => c.section === section && c.id !== 'palette'),
      })),
    [commands],
  );

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label="Paleta de comandos"
      loop
      overlayClassName="fixed inset-0 z-40 bg-canvas/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-panel border border-line-strong bg-raised shadow-overlay data-[state=open]:animate-pop-in"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <span className="font-mono text-md text-accent" aria-hidden>
          &gt;
        </span>
        <Command.Input
          autoFocus
          placeholder="Escribe un comando o el nombre de una rama…"
          className="h-12 flex-1 bg-transparent font-mono text-md text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>
      <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-8 text-center font-mono text-base text-fg-muted">
          sin resultados
          <Cursor />
        </Command.Empty>
        {groups.map(
          ({ section, items }) =>
            items.length > 0 && (
              <Command.Group
                key={section}
                heading={section}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle"
              >
                {items.map((command) => (
                  <Command.Item
                    key={command.id}
                    value={`${command.title} ${command.id}`}
                    keywords={command.keywords}
                    onSelect={() => {
                      close();
                      command.run();
                    }}
                    className="flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 text-base text-fg-secondary data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted data-[selected=true]:[&_svg]:text-accent"
                  >
                    {command.icon ?? <span className="size-4" />}
                    <span className="flex-1 truncate">{command.title}</span>
                    {command.shortcut && <Kbd shortcut={command.shortcut} />}
                  </Command.Item>
                ))}
              </Command.Group>
            ),
        )}
      </Command.List>
      <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1">
          <Kbd shortcut="arrowup" />
          <Kbd shortcut="arrowdown" /> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd shortcut="enter" /> ejecutar
        </span>
        <span className="flex items-center gap-1">
          <Kbd shortcut="escape" /> cerrar
        </span>
      </div>
    </Command.Dialog>
  );
}
