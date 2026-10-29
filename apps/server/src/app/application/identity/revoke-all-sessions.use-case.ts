import { ForbiddenException, Injectable } from '@harnesys/brix';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface RevokeAllSessionsInput {
  principal: Principal;
  now?: string;
}

@Injectable()
export class RevokeAllSessionsUseCase {
  constructor(
    private readonly sessions: SessionStore,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: RevokeAllSessionsInput): void {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required to revoke sessions');
    }
    const now = input.now ?? new Date().toISOString();
    this.sessions.revokeUserFamilies(input.principal.userId, now, 'revoke_all');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: input.principal.userId,
        action: 'sessions_revoked_all',
        result: 'ok',
        reason: null,
      }),
    );
  }
}
