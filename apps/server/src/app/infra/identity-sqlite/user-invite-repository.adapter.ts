import { Injectable } from '@harnesys/brix';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type InsertUserInviteInput,
  type UserInviteRecord,
  UserInviteStore,
} from '../../domain/identity/user-invite-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { userInvites } from './identity.schema.ts';
import { openIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class UserInviteRepositoryAdapter extends UserInviteStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(invite: InsertUserInviteInput): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db
        .insert(userInvites)
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
    } finally {
      sqlite.sqlite.close();
    }
  }

  findByCodeHash(codeHash: string): UserInviteRecord | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db
        .select()
        .from(userInvites)
        .where(eq(userInvites.codeHash, codeHash))
        .get();
      return row ? mapInvite(row) : null;
    } finally {
      sqlite.sqlite.close();
    }
  }

  markUsed(id: string, usedAt: string): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db.update(userInvites).set({ usedAt }).where(eq(userInvites.id, id)).run();
    } finally {
      sqlite.sqlite.close();
    }
  }

  listByOrg(orgId: string): UserInviteRecord[] {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const rows = sqlite.db
        .select()
        .from(userInvites)
        .where(eq(userInvites.orgId, orgId))
        .orderBy(desc(userInvites.createdAt))
        .all();
      return rows.map(mapInvite);
    } finally {
      sqlite.sqlite.close();
    }
  }

  remove(orgId: string, inviteId: string): boolean {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const removed = sqlite.db
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
    } finally {
      sqlite.sqlite.close();
    }
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
