import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MemberInviteView,
  memberInvitesQuery,
  memberInvitesQueryKey,
  revokeMemberInvite,
} from '@/shared/api/members';
import { alert } from '@/shared/services/overlay';
import { toast } from '@/shared/ui/toast';
import { inviteCodeLabel } from '../model/member-invites';
import { MemberInvitesSection } from './member-invites-section';

interface MemberInvitesContainerProps {
  orgId: string;
  memberNames: ReadonlyMap<string, string>;
}

export function MemberInvitesContainer({ orgId, memberNames }: MemberInvitesContainerProps) {
  const queryClient = useQueryClient();
  const query = useQuery(memberInvitesQuery(orgId));

  const revoke = useMutation({
    mutationFn: (invite: MemberInviteView) => revokeMemberInvite(orgId, invite.inviteId),
    onSuccess: async (_result, invite) => {
      await queryClient.invalidateQueries({ queryKey: memberInvitesQueryKey(orgId) });
      toast.add({
        title: 'Invite revoked',
        description: invite.code ? inviteCodeLabel(invite.code) : undefined,
      });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Revoke failed', description: err.message });
    },
  });

  const onRevoke = (invite: MemberInviteView) => {
    void alert
      .confirm({
        title: 'Revoke this invite?',
        description: 'The invite link stops working immediately and is removed from the list.',
        confirmText: 'Revoke',
        variant: 'destructive',
      })
      .then((ok) => {
        if (ok) {
          revoke.mutate(invite);
        }
      });
  };

  const error = query.isError ? errorMessage(query.error, 'Could not load invites') : null;

  return (
    <MemberInvitesSection
      invites={query.data ?? []}
      pending={query.isPending}
      error={error}
      memberNames={memberNames}
      busy={revoke.isPending}
      onRetry={() => void query.refetch()}
      onRevoke={onRevoke}
    />
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
