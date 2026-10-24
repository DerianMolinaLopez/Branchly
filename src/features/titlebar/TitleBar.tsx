import { Copy, Minus, Plus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { windowApi } from '@/api';
import { cn } from '@/lib/cn';
import { SHORTCUTS } from '@/lib/shortcuts';
import { closeRepository } from '@/features/home/openRepo';
import { useWorkspace } from '@/stores/workspace';
import { IconButton, Tooltip } from '@/ui';

/** Frameless window title bar: logo, repository tabs and window controls. */
export function TitleBar() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const activate = useWorkspace((s) => s.activate);

  return (
    <header
      data-tauri-drag-region
      className="relative flex h-(--titlebar-height) shrink-0 items-stretch border-b border-line bg-canvas/70"
    >
      <button
        type="button"
        onClick={() => {
          activate(null);
        }}
        aria-label="Inicio"
        className="flex items-center gap-2 px-3 font-mono text-sm text-fg-secondary hover:text-fg"
      >
        <img src="/logo.svg" alt="" className="size-5" draggable={false} />
        <span>branchly</span>
      </button>

      <div
        role="tablist"
        aria-label="Repositorios abiertos"
        className="flex min-w-0 items-stretch"
        data-tauri-drag-region
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={tab.path}
              onClick={() => {
                activate(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') activate(tab.id);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) closeRepository(tab.id);
              }}
              className={cn(
                'group relative flex max-w-56 min-w-28 items-center gap-2 border-r border-line pr-1.5 pl-3 text-base transition-colors duration-(--duration-fast)',
                active ? 'bg-mid text-fg' : 'text-fg-muted hover:bg-mid/50 hover:text-fg-secondary',
              )}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  active ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-fg-subtle',
                )}
              />
              <span className="min-w-0 flex-1 truncate">{tab.name}</span>
              <button
                type="button"
                aria-label={`Cerrar ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeRepository(tab.id);
                }}
                className="rounded-chip p-0.5 text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-fg focus-visible:opacity-100 aria-selected:opacity-100"
              >
                <X className="size-3.5" />
              </button>
              {active && <span className="accent-rule absolute inset-x-0 bottom-0" aria-hidden />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center px-1">
        <IconButton
          size="sm"
          label="Abrir otro repositorio"
          shortcut={SHORTCUTS.home}
          icon={<Plus />}
          onClick={() => {
            activate(null);
          }}
        />
      </div>
      <div className="flex-1" data-tauri-drag-region />
      <WindowControls />
    </header>
  );
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const sync = () => {
      void windowApi.isMaximized().then(setMaximized);
    };
    sync();
    let unlisten: (() => void) | null = null;
    void windowApi.onResized(sync).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);
  const base =
    'flex w-11 items-center justify-center text-fg-muted transition-colors duration-(--duration-fast) [&_svg]:size-3.5';
  return (
    <div className="flex items-stretch">
      <Tooltip content="Minimizar">
        <button
          type="button"
          aria-label="Minimizar"
          className={cn(base, 'hover:bg-raised hover:text-fg')}
          onClick={() => void windowApi.minimize()}
        >
          <Minus />
        </button>
      </Tooltip>
      <Tooltip content={maximized ? 'Restaurar' : 'Maximizar'}>
        <button
          type="button"
          aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          className={cn(base, 'hover:bg-raised hover:text-fg [&_svg]:size-3!')}
          onClick={() => void windowApi.toggleMaximize()}
        >
          {maximized ? <Copy /> : <Square />}
        </button>
      </Tooltip>
      <Tooltip content="Cerrar">
        <button
          type="button"
          aria-label="Cerrar"
          className={cn(base, 'hover:bg-danger hover:text-accent-fg')}
          onClick={() => void windowApi.close()}
        >
          <X />
        </button>
      </Tooltip>
    </div>
  );
}
