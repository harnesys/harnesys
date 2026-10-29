import { dialog } from '@/shared/services/overlay';
import { ProjectDetailsDialog } from '../ui/project-details-dialog.tsx';
export function openCreateProjectDialog() {
  return dialog.open(ProjectDetailsDialog, {
    title: 'Add local folder',
    description: 'Attach a folder on a host as a Source. Agents and files work inside that tree.',
    className: 'sm:max-w-md',
    testId: 'create-source-dialog',
  });
}
