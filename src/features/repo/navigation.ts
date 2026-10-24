import { graphApi } from '@/api';
import { useWorkspace } from '@/stores/workspace';

/**
 * Selects a commit and scrolls the graph to it. Commits that are not part of
 * the graph (e.g. stashes) are still shown in the detail panel.
 */
export async function focusCommit(repoId: string, sha: string): Promise<void> {
  const workspace = useWorkspace.getState();
  workspace.setCenter(repoId, { kind: 'graph' });
  workspace.select(repoId, { kind: 'commit', sha });
  try {
    const row = await graphApi.locate(repoId, sha);
    if (row !== null) workspace.scrollToRow(repoId, row, false);
  } catch {
    // Selection is enough when the commit cannot be located.
  }
}

/** Shows the working-tree changes (the WIP row) in the right panel. */
export function showChanges(repoId: string): void {
  const workspace = useWorkspace.getState();
  workspace.select(repoId, { kind: 'wip' });
}
