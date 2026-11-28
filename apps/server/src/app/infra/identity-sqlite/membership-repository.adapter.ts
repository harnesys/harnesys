import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import type { MembershipRecord } from '../../domain/identity/membership-repository.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import type { UpsertMembershipInput } from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { memberships } from './identity.schema.ts';
import { withIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class MembershipRepositoryAdapter extends MembershipRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  upsert(membership: UpsertMembershipInput): void {
    withIdentitySqlite(this.layout, (db) => {
      const capabilities = JSON.stringify(membership.capabilities);
      db.insert(memberships)
        .values({
          userId: membership.userId,
          orgId: membership.orgId,
          capabilitiesJson: capabilities,
          updatedAt: membership.updatedAt,
        })
        .onConflictDoUpdate({
          target: [memberships.userId, memberships.orgId],
          set: { capabilitiesJson: capabilities, updatedAt: membership.updatedAt },
        })
        .run();
    });
  }

  findByUserAndOrg(userId: string, orgId: string): MembershipRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
        .get();
      return row ? mapMembership(row) : null;
    });
  }
  listByUser(userId: string): MembershipRecord[] {
    return withIdentitySqlite(this.layout, (db) => {
      const rows = db.select().from(memberships).where(eq(memberships.userId, userId)).all();
      return rows.map(mapMembership);
    });
  }

  listByOrg(orgId: string): MembershipRecord[] {
    return withIdentitySqlite(this.layout, (db) => {
      const rows = db.select().from(memberships).where(eq(memberships.orgId, orgId)).all();
      return rows.map(mapMembership);
    });
  }

  remove(userId: string, orgId: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.delete(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
        .run();
    });
  }

  upsertSync(membership: MembershipRecord): void {
    const existing = withIdentitySqlite(this.layout, (db) =>
      db
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.userId, membership.userId), eq(memberships.orgId, membership.orgId)),
        )
        .get(),
    );
    if (existing && existing.updatedAt >= membership.updatedAt) {
      return;
    }
    this.upsert(membership);
  }
}

interface MembershipRow {
  userId: string;
  orgId: string;
  capabilitiesJson: string;
  updatedAt: string;
}

function mapMembership(row: MembershipRow): MembershipRecord {
  return {
    userId: row.userId,
    orgId: row.orgId,
    capabilities: parseCapabilities(row.capabilitiesJson),
    updatedAt: row.updatedAt,
  };
}

function parseCapabilities(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is string => typeof entry === 'string');
}
