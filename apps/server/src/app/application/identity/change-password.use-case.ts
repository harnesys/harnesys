import { ForbiddenException, Injectable, ValidationException } from '@harnesys/brix';
import {
  InvalidCredentialsException,
  SessionExpiredException,
} from '../../domain/identity/identity.error.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface ChangePasswordInput {
  principal: Principal;
  currentPassword: string;
  newPassword: string;
  currentAccessToken: string;
  now?: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly hasher: PasswordHasher,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required to change a password');
    }
    const userId = input.principal.userId;
    const now = input.now ?? new Date().toISOString();
    const user = this.users.findById(userId);
    if (!user) {
      throw new InvalidCredentialsException();
    }
    const verified = await this.hasher.verify(input.currentPassword, user.passwordHash);
    if (!verified) {
      this.audit.append(
        identityAuditRow(now, {
          actorKind: 'user',
          actorId: userId,
          action: 'password_change_failed',
          result: 'denied',
          reason: 'current password mismatch',
        }),
      );
      throw new InvalidCredentialsException();
    }
    const unchanged = await this.hasher.verify(input.newPassword, user.passwordHash);
    if (unchanged) {
      throw new ValidationException('New password must differ from the current one');
    }
    const currentFamilyId = await this.currentFamilyId(input.currentAccessToken);
    this.users.updatePasswordHash(user.id, await this.hasher.hash(input.newPassword), now);
    this.sessions.revokeUserFamiliesExcept(userId, currentFamilyId, now, 'password_change');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: userId,
        action: 'password_change',
        result: 'ok',
        reason: null,
      }),
    );
  }

  private async currentFamilyId(currentAccessToken: string): Promise<string> {
    const session = this.sessions.findByAccessHash(await hashToken(currentAccessToken));
    if (!session) {
      throw new SessionExpiredException();
    }
    return session.familyId;
  }
}
