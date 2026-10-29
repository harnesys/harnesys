import { ForbiddenException, Injectable, NotFoundException } from '@harnesys/brix';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface RevokeSessionInput {
  principal: Principal;
  familyId: string;
  now?: string;
}

@Injectable()
export class RevokeSessionUseCase {
  constructor(
    private readonly sessions: SessionStore,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: RevokeSessionInput): void {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required to revoke sessions');
    }
    const now = input.now ?? new Date().toISOString();
    const owned = this.sessions.listActiveByUser(input.principal.userId);
    if (!owned.some((row) => row.familyId === input.familyId)) {
      throw new NotFoundException('Session family is unknown or already revoked');
    }
    this.sessions.revokeFamily(input.familyId, now, 'user_revoked');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: input.principal.userId,
        action: 'session_revoked',
        result: 'ok',
        reason: input.familyId,
      }),
    );
  }
}
