import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import {
  SessionExpiredException,
  SessionReuseException,
} from '../../domain/identity/identity.error.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type SessionRecord, SessionStore } from '../../domain/identity/session-store.port.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';
import { mintOpaqueToken } from './mint-token.ts';
import { ACCESS_TTL_SEC, isoAt, REFRESH_IDLE_SEC, type SessionTokens } from './session-tokens.ts';

export interface RefreshSessionInput {
  refreshToken: string;
  now?: string;
}

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: SessionStore,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: RefreshSessionInput): Promise<SessionTokens> {
    const now = input.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);
    const refreshHash = await hashToken(input.refreshToken);
    const consumed = this.sessions.findConsumedRefresh(refreshHash);
    if (consumed) {
      this.sessions.revokeFamily(consumed.familyId, now, 'reuse');
      this.audit.append(
        identityAuditRow(now, {
          actorKind: 'anonymous',
          actorId: consumed.familyId,
          action: 'reuse_revoked',
          result: 'family_revoked',
          reason: 'refresh token reuse',
        }),
      );
      throw new SessionReuseException();
    }
    const session = this.sessions.findByRefreshHash(refreshHash);
    if (!session) {
      throw new SessionExpiredException();
    }
    this.assertAlive(session, nowMs);
    const accessToken = mintOpaqueToken();
    const refreshToken = mintOpaqueToken();
    this.sessions.rotate(
      {
        id: randomUUID(),
        familyId: session.familyId,
        userId: session.userId,
        orgId: session.orgId,
        refreshHash: await hashToken(refreshToken),
        accessHash: await hashToken(accessToken),
        lastUsedAt: now,
        expiresAt: isoAt(nowMs + REFRESH_IDLE_SEC * 1000),
        absoluteExpiresAt: session.absoluteExpiresAt,
      },
      refreshHash,
    );
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: session.userId,
        action: 'refresh',
        result: 'ok',
        reason: null,
      }),
    );
    return {
      accessToken,
      accessExpiresAt: isoAt(nowMs + ACCESS_TTL_SEC * 1000),
      refreshToken,
      refreshExpiresAt: session.absoluteExpiresAt,
    };
  }

  private assertAlive(session: SessionRecord, nowMs: number): void {
    if (session.revokedAt) {
      throw new SessionExpiredException();
    }
    if (Date.parse(session.lastUsedAt) + REFRESH_IDLE_SEC * 1000 < nowMs) {
      throw new SessionExpiredException();
    }
    if (Date.parse(session.absoluteExpiresAt) < nowMs) {
      throw new SessionExpiredException();
    }
  }
}
