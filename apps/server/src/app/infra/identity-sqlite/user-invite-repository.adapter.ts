import { Injectable } from '@harnesys/brix';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type InsertUserInviteInput,
  type UserInviteRecord,
  UserInviteStore,
} from '../../domain/identity/user-invite-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { userInvites } from './identity.schema.ts';
import { withIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class UserInviteRepositoryAdapter extends UserInviteStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(invite: InsertUserInviteInput): void {
    withIdentitySqlite(this.layout, (db) => {
      db.insert(userInvites)
        .values({
          id: invite.id,
          orgId: invite.orgId,
          code: invite.code,
          codeHash: invite.codeHash,
          capabilitiesJson: JSON.stringify(invite.capabilities),
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          usedAt: null,
          createdBy: invite.createdBy,
        })
        .run();
    });
  }

  findByCodeHash(codeHash: string): UserInviteRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db.select().from(userInvites).where(eq(userInvites.codeHash, codeHash)).get();
      return row ? mapInvite(row) : null;
    });
  }

  markUsed(id: string, usedAt: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.update(userInvites).set({ usedAt }).where(eq(userInvites.id, id)).run();
    });
  }

  listByOrg(orgId: string): UserInviteRecord[] {
    return withIdentitySqlite(this.layout, (db) => {
      const rows = db
        .select()
        .from(userInvites)
        .where(eq(userInvites.orgId, orgId))
        .orderBy(desc(userInvites.createdAt))
        .all();
      return rows.map(mapInvite);
    });
  }

  remove(orgId: string, inviteId: string): boolean {
    return withIdentitySqlite(this.layout, (db) => {
      const removed = db
        .delete(userInvites)
        .where(
          and(
            eq(userInvites.id, inviteId),
            eq(userInvites.orgId, orgId),
            isNull(userInvites.usedAt),
          ),
        )
        .returning({ id: userInvites.id })
        .all();
      return removed.length > 0;
    });
  }
}

interface UserInviteRow {
  id: string;
  orgId: string;
  code: string | null;
  codeHash: string;
  capabilitiesJson: string;
  createdAt: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdBy: string;
}

function mapInvite(row: UserInviteRow): UserInviteRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    codeHash: row.codeHash,
    capabilities: parseCapabilities(row.capabilitiesJson),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdBy: row.createdBy,
  };
}

function parseCapabilities(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is string => typeof entry === 'string');
}
