import { KeyRoundIcon, MoreHorizontalIcon, SlidersHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import type { MemberView } from '@/shared/api/members';
import { formatDayTime, formatShortDate } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';
import {
  accessSummary,
  accessTitle,
  capabilityCoverage,
  type MemberRole,
  membershipRole,
} from '../model/member-access';
import { RoleBadge } from './role-badge';

interface MembersTableProps {
  members: MemberView[];
  currentUserId?: string;
  canManage: boolean;
  busy: boolean;
  onEdit: (member: MemberView) => void;
  onResetPassword: (member: MemberView) => void;
  onRemove: (member: MemberView) => void;
}

export function MembersTable({
  members,
  currentUserId,
  canManage,
  busy,
  onEdit,
  onResetPassword,
  onRemove,
}: MembersTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="members-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="w-24 px-3 py-2 font-medium">Role</th>
              <th className="w-48 px-3 py-2 font-medium">Access</th>
              <th className="hidden w-28 px-3 py-2 font-medium md:table-cell">Updated</th>
              {canManage ? (
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isSelf={member.userId === currentUserId}
                canManage={canManage}
                busy={busy}
                onEdit={() => onEdit(member)}
                onResetPassword={() => onResetPassword(member)}
                onRemove={() => onRemove(member)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  canManage,
  busy,
  onEdit,
  onResetPassword,
  onRemove,
}: {
  member: MemberView;
  isSelf: boolean;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onRemove: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const role = membershipRole(member.capabilities);
  const displayName = member.name.trim() || member.login;
  const identity = (
    <>
      <UserAvatar name={displayName} seed={member.userId} color={member.color} size="md" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-sm">{displayName}</span>
          {isSelf ? <RowChip>You</RowChip> : null}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{member.login}</span>
      </span>
    </>
  );
  return (
    <tr
      className="border-b transition-colors last:border-b-0 hover:bg-muted/30"
      data-testid={`member-${member.login}`}
    >
      <td className="max-w-64 px-3 py-2">
        {canManage ? (
          <button
            type="button"
            className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={onEdit}
            data-testid={`member-open-${member.login}`}
          >
            {identity}
          </button>
        ) : (
          <div className="flex min-w-0 max-w-full items-center gap-2">{identity}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <RoleBadge role={role} />
      </td>
      <td className="px-3 py-2">
        <AccessCell capabilities={member.capabilities} />
      </td>
      <td className="hidden px-3 py-2 text-muted-foreground text-xs md:table-cell">
        <span title={`Access updated ${formatDayTime(member.updatedAt, timeZone)}`}>
          {formatShortDate(member.updatedAt, timeZone)}
        </span>
      </td>
      {canManage ? (
        <td className="px-3 py-2 text-right">
          <MemberActions
            member={member}
            role={role}
            busy={busy}
            onEdit={onEdit}
            onResetPassword={onResetPassword}
            onRemove={onRemove}
          />
        </td>
      ) : null}
    </tr>
  );
}

function AccessCell({ capabilities }: { capabilities: readonly string[] }) {
  const coverage = capabilityCoverage(capabilities);
  return (
    <div className="flex items-center gap-2" title={accessTitle(capabilities)}>
      <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
        {coverage.map((area) => (
          <span
            key={area.label}
            className={cn(
              'size-1.5 rounded-[2px]',
              area.granted > 0 ? 'bg-primary/70' : 'bg-border',
            )}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-muted-foreground text-xs">
        {accessSummary(capabilities)}
      </span>
    </div>
  );
}

function MemberActions({
  member,
  role,
  busy,
  onEdit,
  onResetPassword,
  onRemove,
}: {
  member: MemberView;
  role: MemberRole;
  busy: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onRemove: () => void;
}) {
  const owner = role === 'owner';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Actions for ${member.name}`}
            data-testid={`member-actions-${member.login}`}
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit} data-testid={`member-edit-${member.login}`}>
          <SlidersHorizontalIcon />
          Edit access
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onResetPassword}
          data-testid={`member-reset-password-${member.login}`}
        >
          <KeyRoundIcon />
          Reset password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={owner || busy}
          onClick={onRemove}
          data-testid={`member-remove-${member.login}`}
        >
          <Trash2Icon />
          Remove member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MembersTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      data-testid="members-loading"
      aria-hidden="true"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="ml-auto h-5 w-14 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
