import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { SidebarRowTitle } from '@/shared/ui/sidebar-row';

export function BranchFolderLabel({
  open,
  label,
  titleClassName,
}: {
  open: boolean;
  label: string;
  titleClassName?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ChevronRightIcon
          className={cn(
            'size-3.5 text-sidebar-foreground/50 transition-transform',
            open && 'rotate-90',
          )}
        />
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
        <FolderTypeIcon open={open} size="sm" />
      </span>
      <SidebarRowTitle className={titleClassName}>{label}</SidebarRowTitle>
    </span>
  );
}
