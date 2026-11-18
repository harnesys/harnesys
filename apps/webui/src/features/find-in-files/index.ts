import { dialog } from '@/shared/services/overlay';
import { FindInFilesDialog } from './ui/find-in-files-dialog';

export type FindInFilesMode = 'find' | 'replace';

export interface FindInFilesOptions {
  mode?: FindInFilesMode;
  sourceId?: string;
  dir?: string;
  initialQuery?: string;
}

export function openFindInFilesDialog(options: FindInFilesOptions = {}) {
  return dialog.open(FindInFilesDialog, {
    className: 'h-[85vh] sm:max-w-5xl',
    testId: 'find-in-files',
    data: options,
  });
}

export function openReplaceInFilesDialog(options: Omit<FindInFilesOptions, 'mode'> = {}) {
  return openFindInFilesDialog({ ...options, mode: 'replace' });
}
