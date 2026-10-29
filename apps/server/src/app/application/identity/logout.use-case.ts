import { Injectable } from '@harnesys/brix';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface LogoutInput {
  refreshToken: string;
  now?: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionStore,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    const refreshHash = await hashToken(input.refreshToken);
    const session = this.sessions.findByRefreshHash(refreshHash);
    if (!session) {
      return;
    }
    this.sessions.revokeFamily(session.familyId, now, 'logout');
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: session.userId,
        action: 'logout',
        result: 'ok',
        reason: null,
      }),
    );
  }
}
