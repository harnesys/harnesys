import { dialog } from '@/shared/services/overlay';
import { FindInFilesDialog } from './ui/find-in-files-dialog';

export function openFindInFilesDialog() {
  return dialog.open(FindInFilesDialog, {
    className: 'h-[85vh] sm:max-w-5xl',
    testId: 'find-in-files',
  });
}
