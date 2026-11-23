import { dialog } from '@/shared/services/overlay';
import { SourceControlDialog } from '../ui/source-control-dialog';
import type { SourceControlDialogData } from './source-control';

export async function openSourceControlDialog(
  projectId: string,
  defaultMessage?: string,
  focusPath?: string,
): Promise<void> {
  await dialog.open<undefined, SourceControlDialogData>(SourceControlDialog, {
    title: 'Source control',
    description: 'Review changes, discard work and browse history.',
    layoutKey: 'source-control',
    className: 'h-[80vh] sm:max-w-6xl w-[96vw]',
    data: { projectId, message: defaultMessage, focusPath },
  });
}
