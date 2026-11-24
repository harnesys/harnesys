import { FolderPlusIcon } from 'lucide-react';
import { createDepartment, openDepartmentNameDialog } from '@/features/manage-department';
import { useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

export function DepartmentCreateButton() {
  const { orgId } = useStudioLocation();
  if (!orgId) {
    return null;
  }
  const create = async () => {
    const name = await openDepartmentNameDialog({
      title: 'New department',
      submitLabel: 'Create',
    });
    if (!name) {
      return;
    }
    try {
      await createDepartment(orgId, name);
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not create department',
      });
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New department"
      aria-label="New department"
      data-testid="departments-create"
      onClick={() => void create()}
    >
      <FolderPlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New department</span>
    </Button>
  );
}
