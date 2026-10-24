import {
  Archive,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Columns2,
  FileDiff,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitBranchPlus,
  GitFork,
  Home,
  ListChecks,
  PackageOpen,
  RefreshCw,
  Search,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { stagingApi } from '@/api';
import { SHORTCUTS } from '@/lib/shortcuts';
import { checkoutBranch, checkoutRemoteBranch } from '@/features/branches/actions';
import { openDialog } from '@/features/dialogs/store';
import { closeRepository, pickAndOpenRepository } from '@/features/home/openRepo';
import { remoteActions, runAction, undoOperation } from '@/features/repo/actions';
import { showChanges } from '@/features/repo/navigation';
import { useBranches, useStashes } from '@/features/repo/queries';
import { useUndoStore } from '@/features/repo/undo';
import { applyStash } from '@/features/sidebar/stashActions';
import { FOCUS_COMMIT_EVENT } from '@/features/staging/CommitEditor';
import { useSettings } from '@/stores/settings';
import { useWorkspace } from '@/stores/workspace';
import { usePalette } from './store';

export type CommandSection = 'General' | 'Repositorio' | 'Remotos' | 'Ramas' | 'Cambios' | 'Vista';

export interface AppCommand {
  id: string;
  title: string;
  section: CommandSection;
  icon?: ReactNode;
  shortcut?: string;
  /** Extra words to match in the palette. */
  keywords?: string[];
  run: () => void;
  /** Also bind `shortcut` globally (views own the contextual ones). */
  global?: boolean;
}

/** Event asking the active graph to focus its search field. */
export const FOCUS_SEARCH_EVENT = 'branchly:focus-search';

/** Every action of the app available right now, for the palette and shortcuts. */
export function useAppCommands(): AppCommand[] {
  const activeId = useWorkspace((s) => s.activeId);
  const tabs = useWorkspace((s) => s.tabs);
  const workspace = useWorkspace.getState;
  const setDiffMode = useSettings((s) => s.setDiffMode);
  const diffMode = useSettings((s) => s.diffMode);
  const openPalette = usePalette((s) => s.open);
  const repoId = activeId ?? '';
  const branches = useBranches(repoId);
  const stashes = useStashes(repoId);
  const undo = useUndoStore((s) => (activeId ? s.last[activeId] : undefined));

  const commands: AppCommand[] = [
    {
      id: 'palette',
      title: 'Paleta de comandos',
      section: 'General',
      shortcut: SHORTCUTS.palette,
      global: true,
      run: openPalette,
    },
    {
      id: 'open',
      title: 'Abrir repositorio…',
      section: 'General',
      icon: <FolderOpen />,
      shortcut: SHORTCUTS.openRepo,
      global: true,
      run: () => void pickAndOpenRepository(),
    },
    {
      id: 'clone',
      title: 'Clonar repositorio…',
      section: 'General',
      icon: <GitFork />,
      shortcut: SHORTCUTS.cloneRepo,
      global: true,
      run: () => {
        openDialog({ kind: 'clone' });
      },
    },
    {
      id: 'init',
      title: 'Crear repositorio…',
      section: 'General',
      icon: <FolderPlus />,
      keywords: ['init', 'inicializar'],
      run: () => {
        openDialog({ kind: 'init' });
      },
    },
    {
      id: 'home',
      title: 'Ir al inicio',
      section: 'General',
      icon: <Home />,
      shortcut: SHORTCUTS.home,
      global: true,
      run: () => {
        workspace().activate(null);
      },
    },
    {
      id: 'settings',
      title: 'Ajustes',
      section: 'General',
      icon: <Settings />,
      shortcut: SHORTCUTS.settings,
      global: true,
      keywords: ['preferencias', 'fetch automático'],
      run: () => {
        openDialog({ kind: 'settings' });
      },
    },
    {
      id: 'next-tab',
      title: 'Pestaña siguiente',
      section: 'General',
      shortcut: SHORTCUTS.nextTab,
      global: true,
      run: () => {
        workspace().cycleTab(1);
      },
    },
    {
      id: 'prev-tab',
      title: 'Pestaña anterior',
      section: 'General',
      shortcut: SHORTCUTS.prevTab,
      global: true,
      run: () => {
        workspace().cycleTab(-1);
      },
    },
    ...tabs.map((tab) => ({
      id: `tab-${tab.id}`,
      title: `Ir a ${tab.name}`,
      section: 'General' as const,
      icon: <FolderOpen />,
      keywords: [tab.path],
      run: () => {
        workspace().activate(tab.id);
      },
    })),
    {
      id: 'diff-mode',
      title: diffMode === 'unified' ? 'Ver diffs lado a lado' : 'Ver diffs unificados',
      section: 'Vista',
      icon: <Columns2 />,
      shortcut: SHORTCUTS.toggleDiffMode,
      run: () => {
        setDiffMode(diffMode === 'unified' ? 'split' : 'unified');
      },
    },
  ];

  if (!activeId) return commands;

  commands.push(
    {
      id: 'close-tab',
      title: 'Cerrar pestaña',
      section: 'Repositorio',
      icon: <X />,
      shortcut: SHORTCUTS.closeTab,
      global: true,
      run: () => {
        closeRepository(activeId);
      },
    },
    {
      id: 'undo',
      title: undo ? `Deshacer: ${undo.label}` : 'Deshacer',
      section: 'Repositorio',
      icon: <Undo2 />,
      shortcut: SHORTCUTS.undo,
      global: true,
      run: () => {
        if (undo) void undoOperation(activeId, undo);
      },
    },
    {
      id: 'search',
      title: 'Buscar commits',
      section: 'Repositorio',
      icon: <Search />,
      shortcut: SHORTCUTS.search,
      global: true,
      keywords: ['hash', 'autor', 'mensaje'],
      run: () => {
        workspace().setCenter(activeId, { kind: 'graph' });
        window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT, { detail: activeId }));
      },
    },
    {
      id: 'graph',
      title: 'Ver la gráfica de commits',
      section: 'Vista',
      icon: <GitBranch />,
      run: () => {
        workspace().setCenter(activeId, { kind: 'graph' });
      },
    },
    {
      id: 'fetch',
      title: 'Fetch',
      section: 'Remotos',
      icon: <RefreshCw />,
      shortcut: SHORTCUTS.fetch,
      global: true,
      keywords: ['obtener', 'actualizar'],
      run: () => void remoteActions.fetch(activeId),
    },
    {
      id: 'pull',
      title: 'Pull',
      section: 'Remotos',
      icon: <ArrowDownToLine />,
      shortcut: SHORTCUTS.pull,
      global: true,
      keywords: ['traer'],
      run: () => void remoteActions.pull(activeId),
    },
    {
      id: 'push',
      title: 'Push',
      section: 'Remotos',
      icon: <ArrowUpFromLine />,
      shortcut: SHORTCUTS.push,
      global: true,
      keywords: ['enviar', 'publicar'],
      run: () => void remoteActions.push(activeId),
    },
    {
      id: 'push-force',
      title: 'Push forzado seguro (--force-with-lease)',
      section: 'Remotos',
      icon: <ArrowUpFromLine />,
      run: () => void remoteActions.push(activeId, true),
    },
    {
      id: 'new-branch',
      title: 'Nueva rama…',
      section: 'Ramas',
      icon: <GitBranchPlus />,
      shortcut: SHORTCUTS.newBranch,
      global: true,
      run: () => {
        openDialog({ kind: 'createBranch', repoId: activeId });
      },
    },
    {
      id: 'changes',
      title: 'Ir a los cambios',
      section: 'Cambios',
      icon: <FileDiff />,
      shortcut: SHORTCUTS.showChanges,
      global: true,
      keywords: ['wip', 'commit', 'staging'],
      run: () => {
        showChanges(activeId);
        window.setTimeout(
          () => window.dispatchEvent(new CustomEvent(FOCUS_COMMIT_EVENT, { detail: activeId })),
          50,
        );
      },
    },
    {
      id: 'stage-all',
      title: 'Preparar todos los cambios',
      section: 'Cambios',
      icon: <ListChecks />,
      shortcut: SHORTCUTS.stageAll,
      global: true,
      run: () => void runAction(activeId, () => stagingApi.stageAll(activeId)),
    },
    {
      id: 'stash',
      title: 'Guardar cambios en el stash…',
      section: 'Cambios',
      icon: <Archive />,
      shortcut: SHORTCUTS.stash,
      global: true,
      run: () => {
        openDialog({ kind: 'stash', repoId: activeId });
      },
    },
  );

  const lastStash = stashes.data?.[0];
  if (lastStash) {
    commands.push({
      id: 'pop',
      title: 'Aplicar y eliminar el último stash',
      section: 'Cambios',
      icon: <PackageOpen />,
      shortcut: SHORTCUTS.popStash,
      global: true,
      run: () => void applyStash(activeId, lastStash, true),
    });
  }

  for (const branch of branches.data ?? []) {
    if (branch.isHead) continue;
    commands.push({
      id: `checkout-${branch.fullName}`,
      title: `Cambiar a ${branch.name}`,
      section: 'Ramas',
      icon: <ArrowRightLeft />,
      keywords: ['checkout', 'switch'],
      run: () =>
        void (branch.isRemote
          ? checkoutRemoteBranch(activeId, branch.name)
          : checkoutBranch(activeId, branch.name)),
    });
  }
  return commands;
}
