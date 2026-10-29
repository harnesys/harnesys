import { Injectable } from '@harnesys/brix';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import {
  EventClaimPort,
  type EventClaimRecord,
  type GrantEventClaimInput,
} from '../../domain/fleet/event-claim.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { eventClaimsTable } from './schema/index.ts';

@Injectable()
export class EventClaimAdapter extends EventClaimPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  grant(input: GrantEventClaimInput): EventClaimRecord | null {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(eventClaimsTable)
        .where(eq(eventClaimsTable.runId, input.runId))
        .get();
      if (
        existing &&
        existing.doneAt === null &&
        existing.leaseUntil > now &&
        existing.nodeId !== input.nodeId
      ) {
        return null;
      }
      if (existing) {
        db.update(eventClaimsTable)
          .set({
            nodeId: input.nodeId,
            leaseEpoch: input.leaseEpoch,
            leaseUntil: input.leaseUntil,
            token: input.token,
            doneAt: null,
          })
          .where(eq(eventClaimsTable.runId, input.runId))
          .run();
      } else {
        db.insert(eventClaimsTable)
          .values({
            runId: input.runId,
            nodeId: input.nodeId,
            leaseEpoch: input.leaseEpoch,
            leaseUntil: input.leaseUntil,
            token: input.token,
            doneAt: null,
          })
          .run();
      }
      const row = db
        .select()
        .from(eventClaimsTable)
        .where(eq(eventClaimsTable.runId, input.runId))
        .get();
      return row ? toRecord(row) : null;
    });
  }

  findByRun(orgId: string, runId: string): EventClaimRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(eventClaimsTable).where(eq(eventClaimsTable.runId, runId)).get();
      return row ? toRecord(row) : null;
    });
  }

  findActiveByNode(orgId: string, nodeId: string, nowIso: string): EventClaimRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(eventClaimsTable)
        .where(
          and(
            eq(eventClaimsTable.nodeId, nodeId),
            isNull(eventClaimsTable.doneAt),
            sql`${eventClaimsTable.leaseUntil} > ${nowIso}`,
          ),
        )
        .all()
        .map(toRecord),
    );
  }

  findExpired(orgId: string, nowIso: string): EventClaimRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(eventClaimsTable)
        .where(and(isNull(eventClaimsTable.doneAt), lte(eventClaimsTable.leaseUntil, nowIso)))
        .all()
        .map(toRecord),
    );
  }

  countActiveByNode(orgId: string, nodeId: string, nowIso: string): number {
    return this.findActiveByNode(orgId, nodeId, nowIso).length;
  }

  renew(input: {
    orgId: string;
    runId: string;
    nodeId: string;
    leaseEpoch: number;
    leaseUntil: string;
  }): boolean {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      const row = db
        .update(eventClaimsTable)
        .set({ leaseEpoch: input.leaseEpoch, leaseUntil: input.leaseUntil })
        .where(
          and(
            eq(eventClaimsTable.runId, input.runId),
            eq(eventClaimsTable.nodeId, input.nodeId),
            isNull(eventClaimsTable.doneAt),
          ),
        )
        .returning()
        .get();
      return row !== undefined;
    });
  }

  markDone(orgId: string, runId: string, nodeId: string, doneAt: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .update(eventClaimsTable)
        .set({ doneAt })
        .where(
          and(
            eq(eventClaimsTable.runId, runId),
            eq(eventClaimsTable.nodeId, nodeId),
            isNull(eventClaimsTable.doneAt),
          ),
        )
        .returning()
        .get();
      return row !== undefined;
    });
  }

  releaseExpired(orgId: string, nowIso: string): number {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const stale = db
        .select()
        .from(eventClaimsTable)
        .where(and(isNull(eventClaimsTable.doneAt), lte(eventClaimsTable.leaseUntil, nowIso)))
        .all();
      for (const row of stale) {
        db.delete(eventClaimsTable).where(eq(eventClaimsTable.runId, row.runId)).run();
      }
      return stale.length;
    });
  }
}

function toRecord(row: typeof eventClaimsTable.$inferSelect): EventClaimRecord {
  return {
    runId: row.runId,
    nodeId: row.nodeId,
    leaseEpoch: row.leaseEpoch,
    leaseUntil: row.leaseUntil,
    token: row.token,
    doneAt: row.doneAt,
  };
}
