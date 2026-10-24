import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BlameView } from '@/features/history/BlameView';
import { CommitDetailPanel } from '@/features/commit/CommitDetailPanel';
import { DiffView } from '@/features/diff/DiffView';
import { GraphView } from '@/features/graph/GraphView';
import { FileHistoryView } from '@/features/history/FileHistoryView';
import { FOCUS_SEARCH_EVENT } from '@/features/palette/commands';
import { Sidebar } from '@/features/sidebar/Sidebar';
import { StagingPanel } from '@/features/staging/StagingPanel';
import { useSettings } from '@/stores/settings';
import { useRepoUi, useWorkspace, type Selection } from '@/stores/workspace';
import { ResizeHandle } from '@/ui';
import { RepoActiveContext } from './context';
import { useStatus } from './queries';
import { Toolbar } from './Toolbar';
import { useAutoFetch } from './useAutoFetch';

/** One open repository: toolbar, sidebar, center view and contextual panel. */
export function RepoView({ repoId, active }: { repoId: string; active: boolean }) {
  const sidebarWidth = useSettings((s) => s.sidebarWidth);
  const panelWidth = useSettings((s) => s.panelWidth);
  const setSidebarWidth = useSettings((s) => s.setSidebarWidth);
  const setPanelWidth = useSettings((s) => s.setPanelWidth);
  useAutoFetch(repoId);

  return (
    <RepoActiveContext.Provider value={active}>
      <div className="flex h-full min-h-0 flex-col" hidden={!active}>
        <Toolbar repoId={repoId} />
        <div className="flex min-h-0 flex-1">
          <aside style={{ width: sidebarWidth }} className="shrink-0">
            <Sidebar repoId={repoId} />
          </aside>
          <ResizeHandle
            label="Ancho de la barra lateral"
            value={sidebarWidth}
            onChange={setSidebarWidth}
          />
          <main className="min-w-0 flex-1 bg-canvas/30">
            <CenterPane repoId={repoId} active={active} />
          </main>
          <ResizeHandle
            label="Ancho del panel de detalle"
            value={panelWidth}
            onChange={setPanelWidth}
            direction={-1}
          />
          <aside
            style={{ width: panelWidth }}
            className="shrink-0 bg-surface/50"
            aria-label="Detalle"
          >
            <RightPanel repoId={repoId} />
          </aside>
        </div>
      </div>
    </RepoActiveContext.Provider>
  );
}

function CenterPane({ repoId, active }: { repoId: string; active: boolean }) {
  const { center } = useRepoUi(repoId);
  const setCenter = useWorkspace((s) => s.setCenter);
  const [searchToken, setSearchToken] = useState(0);
  const back = () => {
    setCenter(repoId, { kind: 'graph' });
  };

  useEffect(() => {
    if (!active) return;
    const onSearch = (event: Event) => {
      if ((event as CustomEvent<string>).detail === repoId) setSearchToken((t) => t + 1);
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, onSearch);
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onSearch);
    };
  }, [active, repoId]);

  return (
    <div className="relative h-full">
      {/* The graph stays mounted underneath so its scroll position survives. */}
      <div className="h-full" hidden={center.kind !== 'graph'}>
        <GraphView repoId={repoId} searchToken={searchToken} />
      </div>
      <AnimatePresence>
        {center.kind !== 'graph' && (
          <motion.div
            key={
              center.kind === 'diff'
                ? `diff:${JSON.stringify(center.source)}`
                : `${center.kind}:${center.path}`
            }
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute inset-0 bg-mid"
          >
            {center.kind === 'diff' && (
              <DiffView repoId={repoId} source={center.source} onClose={back} />
            )}
            {center.kind === 'history' && (
              <FileHistoryView repoId={repoId} path={center.path} onClose={back} />
            )}
            {center.kind === 'blame' && (
              <BlameView repoId={repoId} path={center.path} onClose={back} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Uncommitted changes when selected (or when nothing is), otherwise commit details. */
function RightPanel({ repoId }: { repoId: string }) {
  const { selection } = useRepoUi(repoId);
  const status = useStatus(repoId);
  const dirty = status.data
    ? status.data.staged.length + status.data.unstaged.length + status.data.conflicted.length > 0
    : false;
  const effective: Selection | null =
    selection ?? (dirty || status.data?.state !== 'clean' ? { kind: 'wip' } : null);

  if (!effective || effective.kind === 'wip') return <StagingPanel repoId={repoId} />;
  return <CommitDetailPanel repoId={repoId} sha={effective.sha} />;
}
