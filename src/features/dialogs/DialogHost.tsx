import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { ConfirmDialog } from './ConfirmDialog';
import {
  CreateBranchDialog,
  CreateTagDialog,
  MergeDialog,
  RenameBranchDialog,
  StashDialog,
} from './RefDialogs';
import { CloneDialog, InitDialog } from './RepoDialogs';
import { useDialogs } from './store';

/** Renders whichever dialog is requested through the dialog store. */
export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const close = useDialogs((s) => s.close);
  return (
    <>
      {current?.kind === 'clone' && <CloneDialog onClose={close} />}
      {current?.kind === 'init' && <InitDialog onClose={close} />}
      {current?.kind === 'settings' && <SettingsDialog onClose={close} />}
      {current?.kind === 'createBranch' && <CreateBranchDialog request={current} onClose={close} />}
      {current?.kind === 'renameBranch' && <RenameBranchDialog request={current} onClose={close} />}
      {current?.kind === 'createTag' && <CreateTagDialog request={current} onClose={close} />}
      {current?.kind === 'stash' && <StashDialog request={current} onClose={close} />}
      {current?.kind === 'merge' && <MergeDialog request={current} onClose={close} />}
      <ConfirmDialog />
    </>
  );
}
