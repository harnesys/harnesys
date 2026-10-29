import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import {
  type AcquireWriteLeaseResult,
  SourceWriteLeasePort,
  type SourceWriteLeaseRecord,
} from '../../domain/fleet/source-write-lease.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { sourceWriteLeasesTable } from './schema/index.ts';

@Injectable()
export class SourceWriteLeaseAdapter extends SourceWriteLeasePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  acquire(input: {
    orgId: string;
    sourceId: string;
    runId: string;
    nodeId: string;
    expiresAt: string;
  }): AcquireWriteLeaseResult {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(sourceWriteLeasesTable)
        .where(eq(sourceWriteLeasesTable.sourceId, input.sourceId))
        .get();
      if (existing && existing.expiresAt > now && existing.runId !== input.runId) {
        return { ok: false as const, holder: toRecord(existing) };
      }
      if (existing) {
        const nextEpoch = existing.runId === input.runId ? existing.leaseEpoch + 1 : 1;
        db.update(sourceWriteLeasesTable)
          .set({
            runId: input.runId,
            nodeId: input.nodeId,
            leaseEpoch: nextEpoch,
            expiresAt: input.expiresAt,
          })
          .where(eq(sourceWriteLeasesTable.sourceId, input.sourceId))
          .run();
      } else {
        db.insert(sourceWriteLeasesTable)
          .values({
            sourceId: input.sourceId,
            runId: input.runId,
            nodeId: input.nodeId,
            leaseEpoch: 1,
            expiresAt: input.expiresAt,
          })
          .run();
      }
      const row = db
        .select()
        .from(sourceWriteLeasesTable)
        .where(eq(sourceWriteLeasesTable.sourceId, input.sourceId))
        .get();
      if (!row) {
        throw new Error('source write lease missing after acquire');
      }
      return { ok: true as const, lease: toRecord(row) };
    });
  }

  release(orgId: string, sourceId: string, runId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .delete(sourceWriteLeasesTable)
        .where(
          and(
            eq(sourceWriteLeasesTable.sourceId, sourceId),
            eq(sourceWriteLeasesTable.runId, runId),
          ),
        )
        .returning()
        .get();
      return row !== undefined;
    });
  }

  find(orgId: string, sourceId: string): SourceWriteLeaseRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(sourceWriteLeasesTable)
        .where(eq(sourceWriteLeasesTable.sourceId, sourceId))
        .get();
      return row ? toRecord(row) : null;
    });
  }

  renew(input: { orgId: string; sourceId: string; runId: string; expiresAt: string }): boolean {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      const row = db
        .update(sourceWriteLeasesTable)
        .set({ expiresAt: input.expiresAt })
        .where(
          and(
            eq(sourceWriteLeasesTable.sourceId, input.sourceId),
            eq(sourceWriteLeasesTable.runId, input.runId),
          ),
        )
        .returning()
        .get();
      return row !== undefined;
    });
  }
}

function toRecord(row: typeof sourceWriteLeasesTable.$inferSelect): SourceWriteLeaseRecord {
  return {
    sourceId: row.sourceId,
    runId: row.runId,
    nodeId: row.nodeId,
    leaseEpoch: row.leaseEpoch,
    expiresAt: row.expiresAt,
  };
}
