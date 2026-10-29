import { Injectable } from '@harnesys/brix';
import { and, eq, lte } from 'drizzle-orm';
import {
  type PendingRunEvent,
  PendingRunEventPort,
} from '../../domain/fleet/pending-run-event.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { runAttributionOf, runAttributionValues } from './run-attribution.ts';
import { pendingRunEventsTable } from './schema/index.ts';

@Injectable()
export class PendingRunEventAdapter extends PendingRunEventPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(orgId: string, event: PendingRunEvent): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(pendingRunEventsTable)
        .where(
          and(
            eq(pendingRunEventsTable.runId, event.runId),
            eq(pendingRunEventsTable.leaseEpoch, event.leaseEpoch),
            eq(pendingRunEventsTable.seq, event.seq),
          ),
        )
        .get();
      if (existing) {
        return;
      }
      db.insert(pendingRunEventsTable)
        .values({
          runId: event.runId,
          leaseEpoch: event.leaseEpoch,
          seq: event.seq,
          ...runAttributionValues(event.attribution),
          payloadJson: event.payloadJson,
          createdAt: event.createdAt,
        })
        .run();
    });
  }

  listPending(orgId: string, runId: string, leaseEpoch: number): PendingRunEvent[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(pendingRunEventsTable)
        .where(
          and(
            eq(pendingRunEventsTable.runId, runId),
            eq(pendingRunEventsTable.leaseEpoch, leaseEpoch),
          ),
        )
        .all()
        .map(toEvent)
        .sort((a, b) => a.seq - b.seq),
    );
  }

  ackThrough(orgId: string, runId: string, leaseEpoch: number, lastSeq: number): number {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const before = db
        .select()
        .from(pendingRunEventsTable)
        .where(
          and(
            eq(pendingRunEventsTable.runId, runId),
            eq(pendingRunEventsTable.leaseEpoch, leaseEpoch),
            lte(pendingRunEventsTable.seq, lastSeq),
          ),
        )
        .all();
      db.delete(pendingRunEventsTable)
        .where(
          and(
            eq(pendingRunEventsTable.runId, runId),
            eq(pendingRunEventsTable.leaseEpoch, leaseEpoch),
            lte(pendingRunEventsTable.seq, lastSeq),
          ),
        )
        .run();
      return before.length;
    });
  }

  listAllPending(orgId: string): PendingRunEvent[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(pendingRunEventsTable)
        .all()
        .map(toEvent)
        .sort((a, b) => a.seq - b.seq),
    );
  }

  deleteRun(orgId: string, runId: string, leaseEpoch: number): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(pendingRunEventsTable)
        .where(
          and(
            eq(pendingRunEventsTable.runId, runId),
            eq(pendingRunEventsTable.leaseEpoch, leaseEpoch),
          ),
        )
        .run();
    });
  }
}

function toEvent(row: {
  runId: string;
  leaseEpoch: number;
  seq: number;
  startedByUserId: string | null;
  via: string | null;
  onNodeId: string | null;
  payloadJson: string;
  createdAt: string;
}): PendingRunEvent {
  return {
    runId: row.runId,
    leaseEpoch: row.leaseEpoch,
    seq: row.seq,
    attribution: runAttributionOf(row),
    payloadJson: row.payloadJson,
    createdAt: row.createdAt,
  };
}
