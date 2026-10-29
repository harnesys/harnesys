import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { ApprovalKind, ApprovalOption, ApprovalStatus } from '@harnesys/contracts';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { ApprovalNotFoundException } from '../../domain/approval/approval.error.ts';
import {
  APPROVAL_LIST_DEFAULT_LIMIT,
  APPROVAL_LIST_MAX_LIMIT,
  type ApprovalContext,
  type ApprovalDecideInput,
  type ApprovalListFilter,
  type ApprovalRecord,
  type ApprovalRequestInput,
  type ApprovalResumeState,
} from '../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ApprovalRow, approvalsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class ApprovalStoreAdapter extends ApprovalStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  request(orgId: string, input: ApprovalRequestInput): { id: string } {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx): { id: string } => {
        const existing = tx
          .select({ id: approvalsTable.id })
          .from(approvalsTable)
          .where(
            and(
              eq(approvalsTable.runId, input.runId),
              eq(approvalsTable.interruptId, input.interruptId),
              ne(approvalsTable.status, 'superseded'),
            ),
          )
          .get();
        if (existing) {
          return { id: existing.id };
        }
        tx.update(approvalsTable)
          .set({ status: 'superseded' })
          .where(
            and(
              eq(approvalsTable.runId, input.runId),
              eq(approvalsTable.status, 'pending'),
              ne(approvalsTable.interruptId, input.interruptId),
            ),
          )
          .run();
        const id = randomUUID();
        const now = new Date().toISOString();
        tx.insert(approvalsTable)
          .values({
            id,
            runId: input.runId,
            agentId: input.agentId,
            threadId: input.threadId,
            interruptId: input.interruptId,
            kind: input.kind,
            question: input.question,
            options: JSON.stringify(input.options),
            context: JSON.stringify(input.context),
            status: 'pending',
            resumeState: 'pending',
            decisionSeq: 0,
            createdAt: now,
          })
          .run();
        return { id };
      }),
    );
  }

  decide(orgId: string, input: ApprovalDecideInput): { winner: boolean; status: ApprovalStatus } {
    return withOrgSqlite(this.layout, orgId, (db) => db.transaction((tx) => decideInTx(tx, input)));
  }

  list(orgId: string, filter: ApprovalListFilter = {}): ApprovalRecord[] {
    const limit = Math.min(filter.limit ?? APPROVAL_LIST_DEFAULT_LIMIT, APPROVAL_LIST_MAX_LIMIT);
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(approvalsTable)
        .where(filter.status === undefined ? undefined : eq(approvalsTable.status, filter.status))
        .orderBy(desc(approvalsTable.createdAt))
        .limit(limit)
        .all();
      return rows.map(rowToRecord);
    });
  }

  get(orgId: string, approvalId: string): ApprovalRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId)).get();
      return row ? rowToRecord(row) : null;
    });
  }

  getByRunInterrupt(orgId: string, runId: string, interruptId: string): ApprovalRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(approvalsTable)
        .where(
          and(
            eq(approvalsTable.runId, runId),
            eq(approvalsTable.interruptId, interruptId),
            eq(approvalsTable.status, 'pending'),
          ),
        )
        .get();
      return row ? rowToRecord(row) : null;
    });
  }

  markRunCancelled(orgId: string, runId: string): ApprovalRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx): ApprovalRecord[] => {
        const now = new Date().toISOString();
        const rows = tx
          .update(approvalsTable)
          .set({
            status: 'cancelled',
            decidedBy: 'system',
            decidedAt: now,
            decisionSeq: sql`${approvalsTable.decisionSeq} + 1`,
          })
          .where(and(eq(approvalsTable.runId, runId), eq(approvalsTable.status, 'pending')))
          .returning()
          .all();
        return rows.map(rowToRecord);
      }),
    );
  }

  listResumable(orgId: string, olderThan: string, limit: number): ApprovalRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(approvalsTable)
        .where(
          and(
            eq(approvalsTable.resumeState, 'decided'),
            inArray(approvalsTable.status, ['approved', 'denied']),
            lte(approvalsTable.decidedAt, olderThan),
          ),
        )
        .orderBy(asc(approvalsTable.decidedAt))
        .limit(limit)
        .all();
      return rows.map(rowToRecord);
    });
  }

  markResumeApplied(orgId: string, approvalId: string): ApprovalRecord | null {
    return this.markResume(orgId, approvalId, { resumeState: 'applied' });
  }

  markResumeCancelled(orgId: string, approvalId: string): ApprovalRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx): ApprovalRecord | null => {
        const updated = tx
          .update(approvalsTable)
          .set({
            status: 'cancelled',
            decidedBy: 'system',
            decidedAt: new Date().toISOString(),
            decisionSeq: sql`${approvalsTable.decisionSeq} + 1`,
            resumeState: 'applied',
          })
          .where(and(eq(approvalsTable.id, approvalId), eq(approvalsTable.resumeState, 'decided')))
          .returning()
          .all();
        const row = updated[0];
        return row ? rowToRecord(row) : null;
      }),
    );
  }

  private markResume(
    orgId: string,
    approvalId: string,
    patch: { resumeState: ApprovalResumeState },
  ): ApprovalRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const updated = db
        .update(approvalsTable)
        .set(patch)
        .where(and(eq(approvalsTable.id, approvalId), eq(approvalsTable.resumeState, 'decided')))
        .returning()
        .all();
      const row = updated[0];
      return row ? rowToRecord(row) : null;
    });
  }
}

function decideInTx(
  tx: OrgSqliteDb,
  input: ApprovalDecideInput,
): { winner: boolean; status: ApprovalStatus } {
  const row = tx.select().from(approvalsTable).where(eq(approvalsTable.id, input.approvalId)).get();
  if (!row) {
    throw new ApprovalNotFoundException(input.approvalId);
  }
  if (row.status !== 'pending') {
    return { winner: false, status: row.status as ApprovalStatus };
  }
  const status: ApprovalStatus =
    input.decision === 'deny' || input.decision === 'block_path' ? 'denied' : 'approved';
  const updated = tx
    .update(approvalsTable)
    .set({
      status,
      decidedBy: input.surface,
      decidedAt: new Date().toISOString(),
      decisionSeq: row.decisionSeq + 1,
      resumeState: 'decided',
      context: JSON.stringify(contextForDecision(row, input)),
    })
    .where(and(eq(approvalsTable.id, input.approvalId), eq(approvalsTable.status, 'pending')))
    .returning({ id: approvalsTable.id })
    .get();
  if (!updated) {
    return { winner: false, status: statusOf(tx, input.approvalId) };
  }
  return { winner: true, status };
}

function contextForDecision(row: ApprovalRow, input: ApprovalDecideInput): ApprovalContext {
  const context = parseContext(row.context);
  if (input.note !== undefined) {
    context.note = input.note;
  }
  if (input.decision === 'approve' || input.decision === 'approve_once') {
    context.override = { ops: context.ops ?? [] };
  }
  if (input.resume !== undefined) {
    context.resume = input.resume;
  }
  return context;
}

function statusOf(tx: OrgSqliteDb, approvalId: string): ApprovalStatus {
  const fresh = tx
    .select({ status: approvalsTable.status })
    .from(approvalsTable)
    .where(eq(approvalsTable.id, approvalId))
    .get();
  if (!fresh) {
    throw new ApprovalNotFoundException(approvalId);
  }
  return fresh.status as ApprovalStatus;
}

function parseContext(raw: string): ApprovalContext {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ApprovalContext) : { source: '' };
  } catch {
    return { source: '' };
  }
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToRecord(row: typeof approvalsTable.$inferSelect): ApprovalRecord {
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    threadId: row.threadId,
    interruptId: row.interruptId,
    kind: row.kind as ApprovalKind,
    question: row.question,
    options: parseJsonArray(row.options) as ApprovalOption[],
    context: parseContext(row.context),
    status: row.status as ApprovalStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionSeq: row.decisionSeq,
    resumeState: (row.resumeState ?? 'pending') as ApprovalResumeState,
    createdAt: row.createdAt,
  };
}
