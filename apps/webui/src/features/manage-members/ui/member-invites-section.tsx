import { CopyIcon, Trash2Icon } from 'lucide-react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import type { MemberInviteStatus, MemberInviteView } from '@/shared/api/members';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowHeader } from '@/shared/ui/capability-rows';
import { SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { membershipRole } from '../model/member-access';
import { inviteAcceptUrl, inviteCodeLabel } from '../model/member-invites';
import { RoleBadge } from './role-badge';

const STATUS_LABEL: Record<MemberInviteStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  accepted: 'Accepted',
};

const STATUS_CLASS: Record<MemberInviteStatus, string> = {
  active: 'border-status-ok/30 bg-status-ok/10 text-status-ok',
  expired: 'border-border bg-muted/60 text-muted-foreground',
  accepted: 'border-status-info/30 bg-status-info/10 text-status-info',
};

interface MemberInvitesSectionProps {
  invites: MemberInviteView[];
  pending: boolean;
  error: string | null;
  memberNames: ReadonlyMap<string, string>;
  busy: boolean;
  onRetry: () => void;
  onRevoke: (invite: MemberInviteView) => void;
}

export function MemberInvitesSection({
  invites,
  pending,
  error,
  memberNames,
  busy,
  onRetry,
  onRevoke,
}: MemberInvitesSectionProps) {
  const copyLink = (invite: MemberInviteView) => {
    const code = invite.code;
    if (!code) {
      return;
    }
    void navigator.clipboard.writeText(inviteAcceptUrl(code)).then(
      () => {
        toast.add({ title: 'Invite link copied', description: inviteCodeLabel(code) });
      },
      () => {
        toast.add({ title: 'Could not copy invite link' });
      },
    );
  };

  return (
    <section className="flex min-w-0 flex-col gap-2 pt-4" data-testid="member-invites">
      <RowHeader
        label="Invites"
        count={pending ? undefined : invites.length}
        description="One-time links for new members. Copy an active link to send it again."
      />

      {pending ? <InvitesSkeleton /> : null}

      {error ? (
        <SettingsErrorBanner message={error} onRetry={onRetry} testId="member-invites-error" />
      ) : null}

      {!pending && !error && invites.length === 0 ? (
        <SettingsEmpty
          testId="member-invites-empty"
          title="No invites"
          description="Create an invite to get a one-time link you can send to a colleague."
        />
      ) : null}

      {!pending && invites.length > 0 ? (
        <div className="overflow-hidden rounded-lg border" data-testid="member-invites-table">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Invite</th>
                  <th className="w-24 px-3 py-2 font-medium">Role</th>
                  <th className="w-36 px-3 py-2 font-medium">Created</th>
                  <th className="w-36 px-3 py-2 font-medium">Expires</th>
                  <th className="w-24 px-3 py-2 font-medium">Status</th>
                  <th className="w-36 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.inviteId}
                    invite={invite}
                    memberNames={memberNames}
                    busy={busy}
                    onCopy={() => copyLink(invite)}
                    onRevoke={() => onRevoke(invite)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InviteRow({
  invite,
  memberNames,
  busy,
  onCopy,
  onRevoke,
}: {
  invite: MemberInviteView;
  memberNames: ReadonlyMap<string, string>;
  busy: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const role = membershipRole(invite.capabilities);
  const creator = memberNames.get(invite.createdBy) ?? invite.createdBy;
  const link = invite.code ? inviteAcceptUrl(invite.code) : null;
  const copyable = invite.status === 'active' && Boolean(invite.code);
  const revokable = invite.status !== 'accepted';
  const copyTitle = copyTitleOf(invite, copyable);
  return (
    <tr
      className="border-b transition-colors last:border-b-0 hover:bg-muted/30"
      data-testid={`member-invite-${invite.inviteId}`}
    >
      <td className="max-w-64 px-3 py-2">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-mono text-xs" title={link ?? undefined}>
            {invite.code ? inviteCodeLabel(invite.code) : 'No link stored'}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">by {creator}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <RoleBadge role={role} />
      </td>
      <td className="px-3 py-2 text-muted-foreground text-xs">
        {invite.createdAt ? formatDayTime(invite.createdAt, timeZone) : '—'}
      </td>
      <td className="px-3 py-2 text-muted-foreground text-xs">
        {formatDayTime(invite.expiresAt, timeZone)}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant="outline"
          className={cn('font-medium', STATUS_CLASS[invite.status])}
          data-testid="member-invite-status"
        >
          {STATUS_LABEL[invite.status]}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!copyable || busy}
            aria-label={`Copy invite link created by ${creator}`}
            title={copyTitle}
            onClick={onCopy}
            data-testid={`member-invite-copy-${invite.inviteId}`}
          >
            <CopyIcon />
            Copy link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            disabled={!revokable || busy}
            aria-label={`Revoke invite created by ${creator}`}
            title={revokable ? 'Revoke invite' : 'Accepted invites cannot be revoked'}
            onClick={onRevoke}
            data-testid={`member-invite-revoke-${invite.inviteId}`}
          >
            <Trash2Icon />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function copyTitleOf(invite: MemberInviteView, copyable: boolean): string {
  if (!invite.code) {
    return 'This invite has no stored link';
  }
  return copyable ? 'Copy invite link' : 'Only active invites have a copyable link';
}

function InvitesSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      aria-hidden="true"
      data-testid="member-invites-loading"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="ml-auto h-5 w-14 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
