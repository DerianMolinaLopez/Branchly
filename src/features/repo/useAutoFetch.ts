import { useEffect } from 'react';
import { useSettings } from '@/stores/settings';
import { useOperations } from '@/stores/operations';
import { remoteActions } from './actions';

/** Fetches in the background every N minutes when enabled in the settings. */
export function useAutoFetch(repoId: string): void {
  const minutes = useSettings((s) => s.autoFetchMinutes);
  useEffect(() => {
    if (minutes <= 0) return;
    const timer = window.setInterval(() => {
      const busy = Object.values(useOperations.getState().running).some(
        (op) => op.repoId === repoId,
      );
      if (!busy) void remoteActions.fetch(repoId, true);
    }, minutes * 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [minutes, repoId]);
}
