import { dialog } from '@/shared/services/overlay';
import { GitCommitDialog } from '../ui/git-commit-dialog';
export function openCommitDialog(projectId: string, defaultMessage?: string, focusPath?: string) {
  return dialog.open(GitCommitDialog, {
    title: 'Commit',
    description: 'Review changes and write a commit message.',
    className: 'sm:max-w-5xl w-[96vw]',
    data: { projectId, message: defaultMessage ?? '', focusPath },
  });
}
