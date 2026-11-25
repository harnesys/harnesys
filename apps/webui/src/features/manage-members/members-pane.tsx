import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type MemberCapability,
  type MemberView,
  memberInvitesQueryKey,
  membersQuery,
  membersQueryKey,
  removeMember,
  updateMember,
} from '@/shared/api/members';
import { currentUserQuery, currentUserQueryKey } from '@/shared/api/sessions';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowHeader } from '@/shared/ui/capability-rows';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/ui/input-group';
import { SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/toast';
import { openInviteMemberDialog } from './invite-member-dialog';
import { type MemberRole, membershipRole, roleRank } from './model/member-access';
import { openResetMemberPasswordDialog } from './reset-member-password-dialog';
import { MemberAccessSheet } from './ui/member-access-sheet';
import { MemberInvitesContainer } from './ui/member-invites-container';
import { MembersTable, MembersTableSkeleton } from './ui/members-table';

type RoleFilter = 'all' | MemberRole;

const ROLE_FILTERS: readonly { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owner', label: 'Owners' },
  { value: 'admin', label: 'Admins' },
  { value: 'operator', label: 'Operators' },
  { value: 'viewer', label: 'Viewers' },
  { value: 'custom', label: 'Custom' },
];

export function OrgMembersPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(membersQuery(orgId));
  const me = useQuery(currentUserQuery());
  const capabilities = me.data?.capabilities ?? [];
  const canInvite = capabilities.includes('member.invite');
  const canManage = capabilities.includes('member.manage');
  const members = query.data ?? [];
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sheetMember, setSheetMember] = useState<MemberView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: membersQueryKey(orgId) });
  };

  const update = useMutation({
    mutationFn: (input: { member: MemberView; capabilities: MemberCapability[] }) =>
      updateMember(orgId, input.member.userId, input.capabilities),
    onSuccess: async (_result, input) => {
      setSheetOpen(false);
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey() });
      toast.add({ title: 'Access updated', description: input.member.login });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Access update failed', description: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (member: MemberView) => removeMember(orgId, member.userId),
    onSuccess: async (_result, member) => {
      if (sheetMember?.userId === member.userId) {
        setSheetOpen(false);
      }
      await invalidate();
      toast.add({ title: 'Member removed', description: member.login });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Removal failed', description: err.message });
    },
  });

  const onInvite = () => {
    void openInviteMemberDialog(orgId).then(() => {
      void queryClient.invalidateQueries({ queryKey: memberInvitesQueryKey(orgId) });
    });
  };

  const onResetPassword = (member: MemberView) => {
    void openResetMemberPasswordDialog(orgId, {
      userId: member.userId,
      name: member.name,
      login: member.login,
    }).then((result) => {
      if (result) {
        toast.add({ title: 'Password reset', description: member.login });
      }
    });
  };

  const onRemove = (member: MemberView) => {
    void alert
      .confirm({
        title: `Remove ${member.name}?`,
        description:
          'They lose access to this organization and their sessions are revoked immediately. The account itself stays.',
        confirmText: 'Remove',
        variant: 'destructive',
      })
      .then((ok) => {
        if (ok) {
          remove.mutate(member);
        }
      });
  };

  const onEdit = (member: MemberView) => {
    setSheetMember(member);
    setSheetOpen(true);
  };

  const roleCounts: Record<MemberRole, number> = {
    owner: 0,
    admin: 0,
    operator: 0,
    viewer: 0,
    custom: 0,
  };
  for (const member of members) {
    roleCounts[membershipRole(member.capabilities)] += 1;
  }

  const queryText = search.trim().toLowerCase();
  const visible = members
    .filter((member) => {
      const role = membershipRole(member.capabilities);
      if (roleFilter !== 'all' && role !== roleFilter) {
        return false;
      }
      if (queryText.length === 0) {
        return true;
      }
      return (
        member.name.toLowerCase().includes(queryText) ||
        member.login.toLowerCase().includes(queryText)
      );
    })
    .sort((left, right) => {
      const rank =
        roleRank(membershipRole(left.capabilities)) - roleRank(membershipRole(right.capabilities));
      return rank !== 0 ? rank : left.name.localeCompare(right.name);
    });

  const busy = update.isPending || remove.isPending;
  const loading = query.isPending;
  const memberNames = new Map(
    members.map((member) => [member.userId, member.name.trim() || member.login]),
  );

  return (
    <div className="flex w-full flex-col gap-4" data-testid="members-pane">
      <RowHeader label="Members" count={loading ? undefined : members.length}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!orgId}
          onClick={onInvite}
          data-testid="members-invite"
        >
          <PlusIcon />
          Invite member
        </Button>
      </RowHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={roleFilter}
          onValueChange={(next) => setRoleFilter(next as RoleFilter)}
          className="min-w-0"
        >
          <TabsList className="max-w-full overflow-x-auto">
            {ROLE_FILTERS.map((filter) => (
              <TabsTrigger
                key={filter.value}
                value={filter.value}
                data-testid={`members-role-${filter.value}`}
              >
                {filter.label}
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {filter.value === 'all' ? members.length : roleCounts[filter.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="w-full sm:w-56">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            placeholder="Search members"
            aria-label="Search members"
            data-testid="members-search"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.length > 0 ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      {loading ? <MembersTableSkeleton /> : null}

      {query.isError ? (
        <SettingsErrorBanner
          message={query.error instanceof Error ? query.error.message : 'Could not load members'}
          onRetry={() => void query.refetch()}
          testId="members-error"
        />
      ) : null}

      {!loading && !query.isError && members.length === 0 ? (
        <SettingsEmpty
          testId="members-empty"
          title="No members"
          description="Invite the first member — they get an invite code and pick a login."
          action={
            canInvite ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!orgId}
                onClick={onInvite}
              >
                <PlusIcon />
                Invite member
              </Button>
            ) : null
          }
        />
      ) : null}

      {!loading && members.length > 0 && visible.length === 0 ? (
        <SettingsEmpty
          testId="members-no-matches"
          title="No matches"
          description="No members match the current search and role filter."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : null}

      {!loading && visible.length > 0 ? (
        <MembersTable
          members={visible}
          currentUserId={me.data?.userId}
          canManage={canManage}
          busy={busy}
          onEdit={onEdit}
          onResetPassword={onResetPassword}
          onRemove={onRemove}
        />
      ) : null}

      {canInvite ? <MemberInvitesContainer orgId={orgId} memberNames={memberNames} /> : null}

      <MemberAccessSheet
        open={sheetOpen}
        member={sheetMember}
        busy={update.isPending}
        onClose={() => setSheetOpen(false)}
        onSave={(capabilities) => {
          if (sheetMember) {
            update.mutate({ member: sheetMember, capabilities });
          }
        }}
      />
    </div>
  );
}
