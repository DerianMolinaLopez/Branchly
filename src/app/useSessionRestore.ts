import { useEffect, useRef } from 'react';
import { repositoriesApi } from '@/api';
import { openRepository } from '@/features/home/openRepo';
import { useSettings } from '@/stores/settings';
import { useWorkspace } from '@/stores/workspace';

/**
 * Reopens the repositories that were open when the app was closed (plus one
 * given on the command line) and keeps the persisted list in sync with the tabs.
 */
export function useSessionRestore(): void {
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const { openPaths, activePath } = useSettings.getState();
    void (async () => {
      const results = await Promise.allSettled(openPaths.map((path) => repositoriesApi.open(path)));
      const workspace = useWorkspace.getState();
      let activeId: string | null = null;
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        workspace.openTab(result.value);
        if (result.value.path === activePath) activeId = result.value.id;
      }
      useWorkspace.getState().activate(activeId ?? useWorkspace.getState().tabs[0]?.id ?? null);
      // `branchly <folder>` opens (and focuses) that repository.
      const launch = await repositoriesApi.takeLaunchPath().catch(() => null);
      if (launch) await openRepository(launch);
    })();
  }, []);

  useEffect(
    () =>
      useWorkspace.subscribe((state) => {
        if (!restored.current) return;
        const active = state.tabs.find((t) => t.id === state.activeId)?.path ?? null;
        useSettings.getState().setSession(
          state.tabs.map((t) => t.path),
          active,
        );
      }),
    [],
  );
}
