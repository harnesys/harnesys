import { dialog } from '@/shared/services/overlay';
import { AddSourceDialog } from '../ui/add-source-dialog';

export function openAddSourceDialog() {
  return dialog.open(AddSourceDialog, {
    title: 'Add source',
    description: 'Attach a local folder or a remote git repository as a source.',
    className: 'sm:max-w-md',
    testId: 'add-source-dialog',
  });
}
