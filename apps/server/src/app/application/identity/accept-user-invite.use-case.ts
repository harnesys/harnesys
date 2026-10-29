import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import {
  InvalidCredentialsException,
  UserInviteInvalidException,
} from '../../domain/identity/identity.error.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface AcceptUserInviteInput {
  code: string;
  login: string;
  password: string;
  now?: string;
}

export interface AcceptedUserInvite {
  userId: string;
  orgId: string;
}

@Injectable()
export class AcceptUserInviteUseCase {
  constructor(
    private readonly invites: UserInviteStore,
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: AcceptUserInviteInput): Promise<AcceptedUserInvite> {
    const now = input.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);
    const invite = this.invites.findByCodeHash(await hashToken(input.code));
    if (!invite || invite.usedAt !== null || Date.parse(invite.expiresAt) <= nowMs) {
      throw new UserInviteInvalidException();
    }
    const userId = await this.accountId(input, now);
    this.memberships.upsert({
      userId,
      orgId: invite.orgId,
      capabilities: invite.capabilities,
      updatedAt: now,
    });
    this.invites.markUsed(invite.id, now);
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'anonymous',
        actorId: input.login,
        action: 'invite_accepted',
        result: 'ok',
        reason: invite.id,
      }),
    );
    return { userId, orgId: invite.orgId };
  }

  private async accountId(input: AcceptUserInviteInput, now: string): Promise<string> {
    const existing = this.users.findByLogin(input.login);
    if (!existing) {
      const userId = randomUUID();
      this.users.insert({
        id: userId,
        login: input.login,
        name: input.login,
        passwordHash: await this.hasher.hash(input.password),
        createdAt: now,
      });
      return userId;
    }
    const verified = await this.hasher.verify(input.password, existing.passwordHash);
    if (!verified) {
      throw new InvalidCredentialsException();
    }
    return existing.id;
  }
}
