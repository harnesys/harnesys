import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import {
  type InviteRecord,
  InviteRepository,
  type IssueInviteRecordInput,
} from '../../domain/fleet/invite-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { invites } from './org.schema.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import { configureOrgSqlite } from './org-sqlite-session.ts';

function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

@Injectable()
export class InviteRepositoryAdapter extends InviteRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(orgId: string, invite: IssueInviteRecordInput): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { invites } });
      db.insert(invites)
        .values({
          id: invite.id,
          codeHash: hashInviteCode(invite.code),
          nodeName: invite.nodeName,
          expiresAt: invite.expiresAt,
          usedAt: null,
          createdAt: invite.createdAt,
        })
        .run();
    } finally {
      sqlite.close();
    }
  }

  findByCode(orgId: string, code: string): InviteRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { invites } });
      const row = db
        .select()
        .from(invites)
        .where(eq(invites.codeHash, hashInviteCode(code)))
        .get();
      return row ? mapInvite(row) : null;
    } finally {
      sqlite.close();
    }
  }

  markUsed(orgId: string, inviteId: string, usedAt: string): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { invites } });
      db.update(invites).set({ usedAt }).where(eq(invites.id, inviteId)).run();
    } finally {
      sqlite.close();
    }
  }

  listActive(orgId: string, nowIso: string): InviteRecord[] {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { invites } });
      const rows = db
        .select()
        .from(invites)
        .where(and(isNull(invites.usedAt), gt(invites.expiresAt, nowIso)))
        .orderBy(desc(invites.createdAt))
        .all();
      return rows.map(mapInvite);
    } finally {
      sqlite.close();
    }
  }

  revoke(orgId: string, inviteId: string, usedAt: string): boolean {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { invites } });
      const row = db
        .select({ id: invites.id })
        .from(invites)
        .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)))
        .get();
      if (!row) {
        return false;
      }
      db.update(invites).set({ usedAt }).where(eq(invites.id, inviteId)).run();
      return true;
    } finally {
      sqlite.close();
    }
  }

  private open(orgId: string): Database {
    const sqlite = new Database(this.layout.orgDbPath(orgId), { create: true });
    configureOrgSqlite(sqlite);
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    return sqlite;
  }
}

function mapInvite(row: {
  id: string;
  nodeName: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}): InviteRecord {
  return {
    id: row.id,
    nodeName: row.nodeName,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}
