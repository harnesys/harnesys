import { EntityNotFoundException, ForbiddenException, Injectable } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface RevokeMemberInviteInput {
  principal: Principal;
  orgId: string;
  inviteId: string;
  now?: string;
}

@Injectable()
export class RevokeMemberInviteUseCase {
  constructor(
    private readonly invites: UserInviteStore,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: RevokeMemberInviteInput): void {
    if (!authorize(input.principal, 'member.invite', { orgId: input.orgId })) {
      throw new ForbiddenException('member.invite capability is required');
    }
    if (!this.invites.remove(input.orgId, input.inviteId)) {
      throw new EntityNotFoundException('Invite not found or already accepted');
    }
    const now = input.now ?? new Date().toISOString();
    this.audit.append(
      identityAuditRow(now, {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        action: 'invite_revoked',
        result: 'ok',
        reason: input.inviteId,
      }),
    );
  }
}
