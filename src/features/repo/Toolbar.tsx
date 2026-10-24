import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Command,
  GitBranch,
  GitBranchPlus,
  PackageOpen,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SHORTCUTS } from '@/lib/shortcuts';
import { checkoutBranch } from '@/features/branches/actions';
import { openDialog } from '@/features/dialogs/store';
import { usePalette } from '@/features/palette/store';
import { applyStash } from '@/features/sidebar/stashActions';
import { useRunning } from '@/stores/operations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Spinner,
  Tooltip,
} from '@/ui';
import { remoteActions, undoOperation } from './actions';
import { useBranches, useCurrentBranch, useRepoInfo, useStashes } from './queries';
import { useUndoStore } from './undo';

function ToolButton({
  label,
  icon,
  shortcut,
  tooltip,
  onClick,
  disabled,
  busy,
  badge,
}: {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  badge?: number;
}) {
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cn(
          'relative inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-fg-secondary transition-colors duration-(--duration-fast)',
          'hover:bg-raised hover:text-fg disabled:opacity-40 [&_svg]:size-4',
          busy && 'text-accent disabled:opacity-100',
        )}
      >
        {busy ? <Spinner className="size-4" /> : icon}
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-accent-soft px-1.5 font-mono text-2xs leading-4 text-accent tabular-nums">
            {badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

/** Repository toolbar: branch switcher, undo, remotes, branch and stash actions. */
export function Toolbar({ repoId }: { repoId: string }) {
  const info = useRepoInfo(repoId);
  const current = useCurrentBranch(repoId);
  const stashes = useStashes(repoId);
  const undo = useUndoStore((s) => s.last[repoId]);
  const fetching = useRunning(repoId, 'fetch');
  const pulling = useRunning(repoId, 'pull');
  const pushing = useRunning(repoId, 'push');
  const openPalette = usePalette((s) => s.open);
  const lastStash = stashes.data?.[0];

  return (
    <div className="flex h-(--toolbar-height) shrink-0 items-center gap-1 border-b border-line bg-mid/60 px-2">
      <BranchSwitcher
        repoId={repoId}
        name={info.data?.head.branch ?? null}
        detached={info.data?.head.detached ?? false}
      />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ToolButton
        label="Deshacer"
        icon={<Undo2 />}
        shortcut={SHORTCUTS.undo}
        tooltip={undo ? `Deshacer: ${undo.label}` : 'Nada que deshacer'}
        disabled={!undo}
        onClick={() => {
          if (undo) void undoOperation(repoId, undo);
        }}
      />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ToolButton
        label="Fetch"
        icon={<RefreshCw />}
        shortcut={SHORTCUTS.fetch}
        tooltip="Obtener cambios de todos los remotos"
        busy={!!fetching}
        onClick={() => void remoteActions.fetch(repoId)}
      />
      <ToolButton
        label="Pull"
        icon={<ArrowDownToLine />}
        shortcut={SHORTCUTS.pull}
        tooltip={
          current?.upstream ? `Traer e integrar ${current.upstream}` : 'La rama no tiene upstream'
        }
        busy={!!pulling}
        badge={current?.behind}
        onClick={() => void remoteActions.pull(repoId)}
      />
      <ToolButton
        label="Push"
        icon={<ArrowUpFromLine />}
        shortcut={SHORTCUTS.push}
        tooltip={
          current?.upstream ? `Enviar a ${current.upstream}` : 'Publicar la rama en el remoto'
        }
        busy={!!pushing}
        badge={current?.ahead}
        onClick={() => void remoteActions.push(repoId)}
      />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ToolButton
        label="Rama"
        icon={<GitBranchPlus />}
        shortcut={SHORTCUTS.newBranch}
        tooltip="Crear una rama"
        onClick={() => {
          openDialog({ kind: 'createBranch', repoId });
        }}
      />
      <ToolButton
        label="Stash"
        icon={<Archive />}
        shortcut={SHORTCUTS.stash}
        tooltip="Guardar los cambios en el stash"
        onClick={() => {
          openDialog({ kind: 'stash', repoId });
        }}
      />
      <ToolButton
        label="Pop"
        icon={<PackageOpen />}
        shortcut={SHORTCUTS.popStash}
        tooltip={lastStash ? 'Aplicar y eliminar el último stash' : 'No hay stashes'}
        disabled={!lastStash}
        onClick={() => {
          if (lastStash) void applyStash(repoId, lastStash, true);
        }}
      />
      <div className="flex-1" />
      <button
        type="button"
        onClick={openPalette}
        className="inline-flex h-7 items-center gap-2 rounded-control border border-line bg-canvas/50 pr-1.5 pl-2.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
      >
        <Command className="size-3.5" />
        Comandos
        <Kbd shortcut={SHORTCUTS.palette} />
      </button>
    </div>
  );
}

function BranchSwitcher({
  repoId,
  name,
  detached,
}: {
  repoId: string;
  name: string | null;
  detached: boolean;
}) {
  const branches = useBranches(repoId);
  const local = (branches.data ?? []).filter((b) => !b.isRemote);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-control px-2 text-base text-fg hover:bg-raised"
          aria-label="Cambiar de rama"
        >
          <GitBranch className="size-4 text-accent" />
          <span className="truncate font-mono text-sm">
            {detached ? 'HEAD separado' : (name ?? '…')}
          </span>
          <ChevronDown className="size-3.5 text-fg-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>cambiar a</DropdownMenuLabel>
        <div className="max-h-80 overflow-y-auto">
          {local.map((branch) => (
            <DropdownMenuItem
              key={branch.name}
              icon={branch.isHead ? <Check className="text-accent!" /> : <GitBranch />}
              disabled={branch.isHead}
              onSelect={() => void checkoutBranch(repoId, branch.name)}
            >
              <span className="font-mono text-sm">{branch.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<GitBranchPlus />}
          shortcut={SHORTCUTS.newBranch}
          onSelect={() => {
            openDialog({ kind: 'createBranch', repoId });
          }}
        >
          Nueva rama…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
