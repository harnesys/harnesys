import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import {
  type ActiveUserSessionRow,
  type ConsumedRefreshRecord,
  type CreateFamilyInput,
  type RotatedSessionInput,
  type SessionRecord,
  SessionStore,
} from '../../domain/identity/session-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { openIdentitySqlite } from './identity-sqlite-session.ts';

const SQL_INSERT_SESSION = `
INSERT INTO sessions
  (id, family_id, user_id, org_id, refresh_hash, access_hash, created_at, last_used_at,
   expires_at, absolute_expires_at, revoked_at, revoked_reason)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
`;

const SQL_INSERT_CONSUMED = `
INSERT INTO consumed_refreshes (refresh_hash, family_id, consumed_at)
VALUES (?, ?, ?) ON CONFLICT(refresh_hash) DO NOTHING
`;

const SQL_REVOKE_FAMILY = `
UPDATE sessions SET revoked_at = ?, revoked_reason = ?
WHERE family_id = ? AND revoked_at IS NULL
`;

const SQL_REVOKE_USER = `
UPDATE sessions SET revoked_at = ?, revoked_reason = ?
WHERE user_id = ? AND revoked_at IS NULL
`;

const SQL_REVOKE_USER_EXCEPT = `
UPDATE sessions SET revoked_at = ?, revoked_reason = ?
WHERE user_id = ? AND revoked_at IS NULL AND family_id <> ?
`;

const SQL_LIST_ACTIVE_BY_USER = `
SELECT id, family_id, user_id, org_id, refresh_hash, access_hash, created_at, last_used_at,
       expires_at, absolute_expires_at, revoked_at, revoked_reason
FROM sessions WHERE user_id = ? AND revoked_at IS NULL
ORDER BY last_used_at DESC, created_at DESC
`;

const SQL_SELECT_BY_ACCESS_HASH = `
SELECT id, family_id, user_id, org_id, refresh_hash, access_hash, created_at, last_used_at,
       expires_at, absolute_expires_at, revoked_at, revoked_reason
FROM sessions WHERE access_hash = ? LIMIT 1
`;

const SQL_SELECT_BY_REFRESH_HASH = `
SELECT id, family_id, user_id, org_id, refresh_hash, access_hash, created_at, last_used_at,
       expires_at, absolute_expires_at, revoked_at, revoked_reason
FROM sessions WHERE refresh_hash = ? LIMIT 1
`;

const SQL_SELECT_CONSUMED = `
SELECT refresh_hash, family_id, consumed_at
FROM consumed_refreshes WHERE refresh_hash = ? LIMIT 1
`;

const SQL_REPLACE_ACCESS_HASH = `UPDATE sessions SET access_hash = ? WHERE id = ?`;

interface SessionRow {
  id: string;
  family_id: string;
  user_id: string;
  org_id: string;
  refresh_hash: string;
  access_hash: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  absolute_expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

interface ConsumedRow {
  refresh_hash: string;
  family_id: string;
  consumed_at: string;
}

@Injectable()
export class SessionStoreAdapter extends SessionStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  createFamily(input: CreateFamilyInput): void {
    this.write((sqlite) => {
      sqlite
        .query(SQL_INSERT_SESSION)
        .run(
          input.id,
          input.familyId,
          input.userId,
          input.orgId,
          input.refreshHash,
          input.accessHash,
          input.createdAt,
          input.lastUsedAt,
          input.expiresAt,
          input.absoluteExpiresAt,
          null,
          null,
        );
    });
  }

  rotate(session: RotatedSessionInput, oldRefreshHash: string): void {
    this.write((sqlite) => {
      const previous = sqlite
        .query(SQL_SELECT_BY_REFRESH_HASH)
        .get(oldRefreshHash) as SessionRow | null;
      if (!previous) {
        throw new Error(`session not found for rotation: ${oldRefreshHash}`);
      }
      sqlite
        .query(SQL_INSERT_CONSUMED)
        .run(previous.refresh_hash, previous.family_id, session.lastUsedAt);
      sqlite.query('DELETE FROM sessions WHERE id = ?').run(previous.id);
      sqlite
        .query(SQL_INSERT_SESSION)
        .run(
          session.id,
          session.familyId,
          session.userId,
          session.orgId,
          session.refreshHash,
          session.accessHash,
          session.lastUsedAt,
          session.lastUsedAt,
          session.expiresAt,
          session.absoluteExpiresAt,
          null,
          null,
        );
    });
  }

  consumeRefresh(refreshHash: string, familyId: string, consumedAt: string): void {
    this.write((sqlite) => {
      sqlite.query(SQL_INSERT_CONSUMED).run(refreshHash, familyId, consumedAt);
    });
  }

  revokeFamily(familyId: string, revokedAt: string, reason: string): void {
    this.write((sqlite) => {
      sqlite.query(SQL_REVOKE_FAMILY).run(revokedAt, reason, familyId);
    });
  }

  revokeUserFamilies(userId: string, revokedAt: string, reason: string): void {
    this.write((sqlite) => {
      sqlite.query(SQL_REVOKE_USER).run(revokedAt, reason, userId);
    });
  }

  revokeUserFamiliesExcept(
    userId: string,
    exceptFamilyId: string,
    revokedAt: string,
    reason: string,
  ): void {
    this.write((sqlite) => {
      sqlite.query(SQL_REVOKE_USER_EXCEPT).run(revokedAt, reason, userId, exceptFamilyId);
    });
  }

  listActiveByUser(userId: string): ActiveUserSessionRow[] {
    const rows = this.readAll<SessionRow>(SQL_LIST_ACTIVE_BY_USER, [userId]);
    return rows.map((row) => {
      const session = mapSession(row);
      return {
        familyId: session.familyId,
        userId: session.userId,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      };
    });
  }

  findByAccessHash(accessHash: string): SessionRecord | null {
    const row = this.read<SessionRow>(SQL_SELECT_BY_ACCESS_HASH, [accessHash]);
    return row ? mapSession(row) : null;
  }

  findByRefreshHash(refreshHash: string): SessionRecord | null {
    const row = this.read<SessionRow>(SQL_SELECT_BY_REFRESH_HASH, [refreshHash]);
    return row ? mapSession(row) : null;
  }

  findConsumedRefresh(refreshHash: string): ConsumedRefreshRecord | null {
    const row = this.read<ConsumedRow>(SQL_SELECT_CONSUMED, [refreshHash]);
    if (!row) {
      return null;
    }
    return {
      refreshHash: row.refresh_hash,
      familyId: row.family_id,
      consumedAt: row.consumed_at,
    };
  }

  replaceAccessHash(sessionId: string, accessHash: string): void {
    this.write((sqlite) => {
      sqlite.query(SQL_REPLACE_ACCESS_HASH).run(accessHash, sessionId);
    });
  }

  private read<T>(sql: string, params: SQLQueryBindings[]): T | null {
    const session = openIdentitySqlite(this.layout);
    try {
      const row = session.sqlite.query(sql).get(...params) as T | null;
      return row ?? null;
    } finally {
      session.sqlite.close();
    }
  }

  private readAll<T>(sql: string, params: SQLQueryBindings[]): T[] {
    const session = openIdentitySqlite(this.layout);
    try {
      return session.sqlite.query(sql).all(...params) as T[];
    } finally {
      session.sqlite.close();
    }
  }

  private write(fn: (sqlite: Database) => void): void {
    const session = openIdentitySqlite(this.layout);
    try {
      fn(session.sqlite);
    } finally {
      session.sqlite.close();
    }
  }
}

export function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    userId: row.user_id,
    orgId: row.org_id,
    refreshHash: row.refresh_hash,
    accessHash: row.access_hash,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}
