import { dialog } from '@/shared/services/overlay';
import { AttachGitDialog } from '../ui/attach-git-dialog';
import { SwitchGitBranchDialog } from '../ui/switch-git-branch-dialog';

export function openAttachGitDialog() {
  return dialog.open(AttachGitDialog, {
    title: 'Add git repository',
    description: 'Clone a public HTTPS repository as an org source.',
    className: 'sm:max-w-md',
    testId: 'attach-git-dialog',
  });
}

export function openSwitchGitBranchDialog(input: { sourceId: string; currentBranch?: string }) {
  return dialog.open(SwitchGitBranchDialog, {
    title: 'Switch branch',
    description: input.currentBranch
      ? `Active branch is ${input.currentBranch}.`
      : 'Pick a branch to make its worktree active.',
    className: 'sm:max-w-md',
    testId: 'switch-git-branch-dialog',
    data: {
      sourceId: input.sourceId,
      currentBranch: input.currentBranch,
    },
  });
}
