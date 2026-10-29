import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { useEffect } from 'react';
import { inboxPendingQuery, inboxQueryKey } from '@/entities/approval';
import { useErroredThreads } from '@/features/desk';
import { watchApprovalEvents } from '@/shared/api/events';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';

export function InboxBell() {
  const orgId = useOrgId() ?? '';
  const { openInbox } = useStudioNavigation();
  const queryClient = useQueryClient();
  const { data } = useQuery(inboxPendingQuery(orgId));
  const erroredThreads = useErroredThreads(orgId ? [orgId] : []);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchApprovalEvents((eventOrgId) => {
      if (eventOrgId === orgId) {
        void queryClient.invalidateQueries({ queryKey: [...inboxQueryKey, orgId] });
      }
    });
  }, [orgId, queryClient]);
  const count = (data?.items.length ?? 0) + erroredThreads.length;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="Inbox"
      aria-label={`Inbox, ${count} pending`}
      onClick={() => {
        openInbox();
      }}
      data-testid="inbox-bell"
      className="relative"
    >
      <BellIcon />
      {count > 0 ? (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[10px] text-white"
          data-testid="inbox-bell-count"
        >
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </Button>
  );
}
