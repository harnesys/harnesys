import { useQuery } from '@tanstack/react-query';
import { UserRoundIcon } from 'lucide-react';
import { currentUserQuery } from '@/shared/api/sessions';
import { useStudioNavigation } from '@/shared/config/navigation';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { AssistantChatToggle } from '@/widgets/assistant-chat';
import { SidebarSectionsConfig, SidebarSectionsVisibility } from '@/widgets/project-sidebar';

const FOOTER_ICON_CLASS = 'size-7 justify-center p-0';

export function RailFooter() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 p-2" data-testid="rail-footer">
      <AssistantChatToggle />
      <SidebarSectionsVisibility className={FOOTER_ICON_CLASS} />
      <SidebarSectionsConfig className={FOOTER_ICON_CLASS} />
      <AccountAvatarButton />
    </div>
  );
}

function AccountAvatarButton() {
  const { openSettings } = useStudioNavigation();
  const { data: me } = useQuery(currentUserQuery());
  const label = me ? `${me.name} · Account` : 'Account';
  return (
    <button
      type="button"
      title={label}
      aria-label="Open account settings"
      data-testid="rail-account"
      onClick={() => openSettings('account')}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      {me ? (
        <UserAvatar
          name={me.name}
          seed={me.userId}
          src={me.avatar}
          color={me.color}
          size="md"
          className="size-7"
        />
      ) : (
        <UserRoundIcon className="size-4" />
      )}
    </button>
  );
}
