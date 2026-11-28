import { createHash } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import {
  type InviteRecord,
  InviteRepository,
  type IssueInviteRecordInput,
} from '../../domain/fleet/invite-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { invites } from './org.schema.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';

function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

@Injectable()
export class InviteRepositoryAdapter extends InviteRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(orgId: string, invite: IssueInviteRecordInput): void {
    withOrgSqlite(this.layout, orgId, (db) => {
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
    });
  }

  findByCode(orgId: string, code: string): InviteRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(invites)
        .where(eq(invites.codeHash, hashInviteCode(code)))
        .get();
      return row ? mapInvite(row) : null;
    });
  }

  markUsed(orgId: string, inviteId: string, usedAt: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(invites).set({ usedAt }).where(eq(invites.id, inviteId)).run();
    });
  }

  listActive(orgId: string, nowIso: string): InviteRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(invites)
        .where(and(isNull(invites.usedAt), gt(invites.expiresAt, nowIso)))
        .orderBy(desc(invites.createdAt))
        .all();
      return rows.map(mapInvite);
    });
  }

  revoke(orgId: string, inviteId: string, usedAt: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
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
    });
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
