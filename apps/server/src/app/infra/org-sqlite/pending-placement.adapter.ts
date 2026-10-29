import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import {
  type PendingPlacement,
  type PendingPlacementPayload,
  type PlacementTriggerKind,
  upsertPendingPlacement,
} from '../../domain/fleet/pending-placement.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { pendingPlacementsTable } from './schema/index.ts';

@Injectable()
export class PendingPlacementAdapter extends PendingPlacementPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  upsert(row: PendingPlacement): PendingPlacement {
    return withOrgSqlite(this.layout, row.orgId, (db) => {
      const existingRow = db
        .select()
        .from(pendingPlacementsTable)
        .where(eq(pendingPlacementsTable.runId, row.runId))
        .get();
      const existing = existingRow ? toRecord(row.orgId, existingRow) : null;
      const next = upsertPendingPlacement(existing, row);
      if (existingRow) {
        db.update(pendingPlacementsTable)
          .set(toInsert(next))
          .where(eq(pendingPlacementsTable.runId, next.runId))
          .run();
      } else {
        db.insert(pendingPlacementsTable).values(toInsert(next)).run();
      }
      const saved = db
        .select()
        .from(pendingPlacementsTable)
        .where(eq(pendingPlacementsTable.runId, next.runId))
        .get();
      return saved ? toRecord(row.orgId, saved) : next;
    });
  }

  findByRun(orgId: string, runId: string): PendingPlacement | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(pendingPlacementsTable)
        .where(eq(pendingPlacementsTable.runId, runId))
        .get();
      return row ? toRecord(orgId, row) : null;
    });
  }

  listByOrg(orgId: string): PendingPlacement[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(pendingPlacementsTable)
        .all()
        .map((row) => toRecord(orgId, row)),
    );
  }

  listByProfile(orgId: string, profileId: string): PendingPlacement[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(pendingPlacementsTable)
        .where(eq(pendingPlacementsTable.profileId, profileId))
        .all()
        .map((row) => toRecord(orgId, row)),
    );
  }

  remove(orgId: string, runId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(pendingPlacementsTable).where(eq(pendingPlacementsTable.runId, runId)).run();
    });
  }

  updateReason(
    orgId: string,
    runId: string,
    input: {
      lastReason: string;
      attempt: number;
      configRevision: number;
      lastCandidatesJson: string;
    },
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(pendingPlacementsTable)
        .set({
          lastReason: input.lastReason,
          attempt: input.attempt,
          configRevision: input.configRevision,
          lastCandidatesJson: input.lastCandidatesJson,
        })
        .where(eq(pendingPlacementsTable.runId, runId))
        .run();
    });
  }
}

function toInsert(row: PendingPlacement) {
  return {
    runId: row.runId,
    threadId: row.threadId,
    profileId: row.profileId,
    configRevision: row.configRevision,
    createdAt: row.createdAt,
    lastReason: row.lastReason,
    attempt: row.attempt,
    priority: row.priority,
    triggerKind: row.trigger.kind,
    triggerId: row.trigger.id,
    expiresAt: row.expiresAt,
    payloadJson: JSON.stringify(row.payload),
    lastCandidatesJson: row.lastCandidatesJson,
  };
}

function toRecord(
  orgId: string,
  row: typeof pendingPlacementsTable.$inferSelect,
): PendingPlacement {
  return {
    runId: row.runId,
    orgId,
    threadId: row.threadId,
    profileId: row.profileId,
    configRevision: row.configRevision,
    createdAt: row.createdAt,
    lastReason: row.lastReason,
    attempt: row.attempt,
    priority: row.priority,
    trigger: {
      kind: row.triggerKind as PlacementTriggerKind,
      id: row.triggerId,
    },
    expiresAt: row.expiresAt,
    payload: parsePayload(row.payloadJson),
    lastCandidatesJson: row.lastCandidatesJson,
  };
}

function parsePayload(raw: string): PendingPlacementPayload {
  try {
    const parsed = JSON.parse(raw) as PendingPlacementPayload;
    if (!parsed || typeof parsed.agentId !== 'string' || typeof parsed.text !== 'string') {
      return { agentId: '', text: '' };
    }
    return parsed;
  } catch {
    return { agentId: '', text: '' };
  }
}
