import { ForbiddenException, Injectable } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';

export type MemberInviteStatus = 'active' | 'expired' | 'accepted';

export interface MemberInviteView {
  inviteId: string;
  code: string | null;
  capabilities: string[];
  createdAt: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdBy: string;
  status: MemberInviteStatus;
}

export interface ListMemberInvitesInput {
  principal: Principal;
  orgId: string;
  now?: string;
}

const MEMBER_INVITES_LIMIT = 100;

const STATUS_RANK: Record<MemberInviteStatus, number> = {
  active: 0,
  expired: 1,
  accepted: 2,
};

@Injectable()
export class ListMemberInvitesUseCase {
  constructor(private readonly invites: UserInviteStore) {}

  execute(input: ListMemberInvitesInput): MemberInviteView[] {
    if (!authorize(input.principal, 'member.invite', { orgId: input.orgId })) {
      throw new ForbiddenException('member.invite capability is required');
    }
    const nowMs = Date.parse(input.now ?? new Date().toISOString());
    return this.invites
      .listByOrg(input.orgId)
      .map((row) => ({
        inviteId: row.id,
        code: row.code,
        capabilities: row.capabilities,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        createdBy: row.createdBy,
        status: inviteStatus(row.usedAt, row.expiresAt, nowMs),
      }))
      .sort(compareInvites)
      .slice(0, MEMBER_INVITES_LIMIT);
  }
}

function inviteStatus(usedAt: string | null, expiresAt: string, nowMs: number): MemberInviteStatus {
  if (usedAt !== null) {
    return 'accepted';
  }
  return Date.parse(expiresAt) <= nowMs ? 'expired' : 'active';
}

function compareInvites(left: MemberInviteView, right: MemberInviteView): number {
  const rank = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (rank !== 0) {
    return rank;
  }
  if (left.status === 'active') {
    return Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
  }
  return timestampOf(right) - timestampOf(left);
}

function timestampOf(invite: MemberInviteView): number {
  return Date.parse(invite.usedAt ?? invite.createdAt ?? invite.expiresAt);
}
