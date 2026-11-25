import { CogIcon } from 'lucide-react';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { SidebarMenuButton, useSidebar } from '@/shared/ui/sidebar';

export function SidebarSectionsConfig({ className }: { className?: string }) {
  const { openSettings } = useStudioNavigation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      tooltip="Settings"
      aria-label="Open settings"
      data-testid="nav-sections"
      className={cn('w-auto text-muted-foreground', className)}
      onClick={() => {
        openSettings();
        setOpenMobile(false);
      }}
    >
      <CogIcon />
      <span className="sr-only">Settings</span>
    </SidebarMenuButton>
  );
}
