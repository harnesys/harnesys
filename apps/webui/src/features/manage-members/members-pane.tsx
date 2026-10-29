import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import type { MemberCapability } from '@/shared/api/members';
import {
  INVITE_PRESETS,
  listMembers,
  membersQueryKey,
  removeMember,
  updateMember,
} from '@/shared/api/members';
import { alert } from '@/shared/services/overlay';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import {
  CapabilityForm,
  membershipRole,
  openInviteMemberDialog,
  ROLE_LABELS,
} from './invite-member-dialog';
import { openResetMemberPasswordDialog } from './reset-member-password-dialog';

const ROLE_SUMMARY: Record<keyof typeof ROLE_LABELS, string> = {
  owner: 'Full control, including deleting the organization and promoting relays',
  admin: 'Everything except deleting the organization and promoting relays',
  operator: 'Desk, runs, sources, terminal, agents and schedules',
  viewer: 'Read-only: org, desk and sources',
  custom: 'Hand-picked capabilities',
};

function initialsOf(member: { name: string; login: string }): string {
  const name = member.name.trim();
  if (name.length > 0) {
    return name.slice(0, 2).toUpperCase();
  }
  return member.login.slice(0, 2).toUpperCase();
}

export function OrgMembersPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: membersQueryKey(orgId),
    queryFn: () => listMembers(orgId),
    enabled: Boolean(orgId),
    staleTime: 5000,
  });
  const members = query.data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: membersQueryKey(orgId) });
  };

  const update = useMutation({
    mutationFn: (input: { userId: string; capabilities: string[] }) =>
      updateMember(orgId, input.userId, input.capabilities),
    onSuccess: async (result) => {
      setExpandedId(null);
      await invalidate();
      toast.add({ title: 'Member updated', description: result.userId });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Role change failed', description: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(orgId, userId),
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Member removed' });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Removal failed', description: err.message });
    },
  });

  const onResetPassword = (member: (typeof members)[number]) => {
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

  const onDelete = (member: (typeof members)[number]) => {
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
          remove.mutate(member.userId);
        }
      });
  };

  const toggle = (member: (typeof members)[number]) => {
    setExpandedId((current) => (current === member.userId ? null : member.userId));
  };

  return (
    <div className="flex w-full flex-col gap-8" data-testid="members-pane">
      <RowHeader label="Members" count={query.isPending ? undefined : members.length}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId}
          onClick={() => {
            void openInviteMemberDialog(orgId).then((invite) => {
              if (invite) {
                void invalidate();
              }
            });
          }}
          data-testid="members-invite"
        >
          <PlusIcon />
          Invite member
        </Button>
      </RowHeader>

      {query.isPending && <RowListSkeleton testId="members-loading" />}
      {!query.isPending && members.length === 0 ? (
        <SettingsEmpty
          testId="members-empty"
          title="No members"
          description="Invite the first member — they get an invite code and pick a login."
        />
      ) : null}
      <RowList>
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            expanded={expandedId === member.userId}
            busy={update.isPending || remove.isPending}
            onToggle={() => toggle(member)}
            onSave={(capabilities) => {
              update.mutate({ userId: member.userId, capabilities });
            }}
            onDelete={() => onDelete(member)}
            onResetPassword={() => onResetPassword(member)}
          />
        ))}
      </RowList>
    </div>
  );
}

function MemberRow({
  member,
  expanded,
  busy,
  onToggle,
  onSave,
  onDelete,
  onResetPassword,
}: {
  member: {
    userId: string;
    login: string;
    name: string;
    capabilities: string[];
    updatedAt: string;
  };
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (capabilities: MemberCapability[]) => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  const role = membershipRole(member.capabilities);
  const [preset, setPreset] = useState<Exclude<keyof typeof ROLE_LABELS, 'owner'>>(
    role === 'owner' ? 'custom' : role,
  );
  const [draft, setDraft] = useState<readonly MemberCapability[]>([
    ...member.capabilities,
  ] as MemberCapability[]);

  const choosePreset = (next: Exclude<keyof typeof ROLE_LABELS, 'owner'>) => {
    setPreset(next);
    setDraft(next === 'custom' ? [] : [...INVITE_PRESETS[next]]);
  };

  const toggleCapability = (capability: MemberCapability, checked: boolean) => {
    if (preset !== 'custom') {
      setPreset('custom');
    }
    setDraft((current) =>
      checked ? [...current, capability] : current.filter((row) => row !== capability),
    );
  };

  const dirty =
    draft.length !== member.capabilities.length ||
    draft.some((capability) => !member.capabilities.includes(capability));

  return (
    <Row
      testId={`member-${member.login}`}
      icon={
        <Avatar size="sm">
          <AvatarFallback>{initialsOf(member)}</AvatarFallback>
        </Avatar>
      }
      title={member.name}
      mono={false}
      meta={member.login}
      chips={
        <RowChip tone={role === 'owner' || role === 'admin' ? 'accent' : 'neutral'}>
          {ROLE_LABELS[role]}
        </RowChip>
      }
      summary={ROLE_SUMMARY[role]}
      expanded={expanded}
      onToggle={onToggle}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            disabled={busy}
            aria-label={`Reset password for ${member.name}`}
            title="Reset password"
            data-testid={`member-reset-password-${member.login}`}
            onClick={onResetPassword}
          >
            <KeyRoundIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            disabled={busy || role === 'owner'}
            aria-label={`Remove ${member.name}`}
            title={role === 'owner' ? 'The install owner cannot be removed' : 'Remove member'}
            data-testid={`member-remove-${member.login}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-1 pt-1" data-testid={`member-edit-${member.login}`}>
        <CapabilityForm
          preset={preset}
          capabilities={draft}
          onPreset={choosePreset}
          onToggle={toggleCapability}
        />
        <Button
          type="button"
          size="sm"
          disabled={!dirty || busy}
          className="self-start"
          onClick={() => onSave([...draft])}
          data-testid={`member-save-${member.login}`}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Row>
  );
}
