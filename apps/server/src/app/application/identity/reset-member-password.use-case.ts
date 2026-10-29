import { EntityNotFoundException, ForbiddenException, Injectable } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';
import { generateOneTimePassword } from './one-time-password.ts';

export interface ResetMemberPasswordInput {
  principal: Principal;
  orgId: string;
  userId: string;
  now?: string;
}

export interface ResetMemberPasswordResult {
  userId: string;
  temporaryPassword: string;
}

@Injectable()
export class ResetMemberPasswordUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly hasher: PasswordHasher,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: ResetMemberPasswordInput): Promise<ResetMemberPasswordResult> {
    if (!authorize(input.principal, 'member.manage', { orgId: input.orgId })) {
      throw new ForbiddenException('member.manage capability is required');
    }
    const membership = this.memberships.findByUserAndOrg(input.userId, input.orgId);
    if (!membership) {
      throw new EntityNotFoundException(`Membership not found: ${input.userId}`);
    }
    const user = this.users.findById(input.userId);
    if (!user) {
      throw new EntityNotFoundException(`User not found: ${input.userId}`);
    }
    const now = input.now ?? new Date().toISOString();
    const temporaryPassword = generateOneTimePassword();
    this.users.updatePasswordHash(input.userId, await this.hasher.hash(temporaryPassword), now);
    this.sessions.revokeUserFamilies(input.userId, now, 'password_reset');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        action: 'member_password_reset',
        result: 'ok',
        reason: input.userId,
      }),
    );
    return { userId: input.userId, temporaryPassword };
  }
}
