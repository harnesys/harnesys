import { EntityNotFoundException, ForbiddenException, Injectable } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface RemoveMembershipInput {
  principal: Principal;
  orgId: string;
  userId: string;
  now?: string;
}

@Injectable()
export class RemoveMembershipUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly sessions: SessionStore,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: RemoveMembershipInput): void {
    if (!authorize(input.principal, 'member.manage', { orgId: input.orgId })) {
      throw new ForbiddenException('member.manage capability is required');
    }
    const membership = this.memberships.findByUserAndOrg(input.userId, input.orgId);
    if (!membership) {
      throw new EntityNotFoundException(`Membership not found: ${input.userId}`);
    }
    const now = input.now ?? new Date().toISOString();
    this.memberships.remove(input.userId, input.orgId);
    this.sessions.revokeUserFamilies(input.userId, now, 'member_removed');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        action: 'member_removed',
        result: 'ok',
        reason: input.userId,
      }),
    );
  }
}
