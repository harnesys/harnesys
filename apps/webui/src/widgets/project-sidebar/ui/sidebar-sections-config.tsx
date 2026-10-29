import { CogIcon } from 'lucide-react';
import { useStudioNavigation } from '@/shared/config/navigation';
import { SidebarMenuButton, useSidebar } from '@/shared/ui/sidebar';

export function SidebarSectionsConfig() {
  const { openSettings } = useStudioNavigation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      tooltip="Settings"
      aria-label="Open settings"
      data-testid="nav-sections"
      className="w-auto text-muted-foreground"
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
