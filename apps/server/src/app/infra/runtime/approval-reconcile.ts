import type { Logger } from '@harnesys/brix';
import type { ApprovalBudget } from '@harnesys/contracts';
import { desc, eq, inArray } from 'drizzle-orm';
import type { RunRecord } from 'harnesys';
import type { ApprovalDelegatedContext } from '../../domain/approval/approval.ts';
import type { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import type { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import {
  APPROVAL_PARK_SOURCE_SET,
  type ObservedPark,
  type ObservedParkTool,
  type ParkFileRuntime,
} from '../../domain/approval/park-observer.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, runsTable } from '../org-sqlite/schema/index.ts';
import { requestApprovalForPark } from './request-approval-for-park.ts';

const RECONCILE_LIMIT = 50;
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'dead_lettered',
]);

export interface ApprovalReconcileDeps {
  db: OrgSqliteDb;
  orgId: string;
  threads: ThreadRepositoryPort;
  approvals?: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
  logger?: Logger;
  fileRuntime?: (threadId: string) => ParkFileRuntime | undefined;
}

export interface ApprovalReconcile {
  reconcile: () => Promise<void>;
  shouldReap: (record: RunRecord) => Promise<boolean>;
}

export function createApprovalReconcile(deps: ApprovalReconcileDeps): ApprovalReconcile {
  return {
    reconcile: () => reconcileRuns(deps),
    shouldReap: (record) => shouldReapRecord(deps, record),
  };
}

export function runStatusOf(db: OrgSqliteDb, runId: string): string | undefined {
  return db
    .select({ status: runsTable.status })
    .from(runsTable)
    .where(eq(runsTable.runId, runId))
    .get()?.status;
}

function reconcileRuns(deps: ApprovalReconcileDeps): Promise<void> {
  const approvals = deps.approvals;
  if (approvals === undefined) {
    return Promise.resolve();
  }
  try {
    restoreMissingApprovals(deps, approvals);
    discardApprovalsOfTerminalRuns(deps, approvals);
  } catch (error) {
    deps.logger?.warn({ error, orgId: deps.orgId }, 'approval reconcile sweep failed');
  }
  return Promise.resolve();
}

function restoreMissingApprovals(deps: ApprovalReconcileDeps, approvals: ApprovalStorePort): void {
  const parked = deps.db
    .select({ runId: runsTable.runId, threadId: runsTable.threadId })
    .from(runsTable)
    .where(eq(runsTable.status, 'needs_input'))
    .orderBy(desc(runsTable.updatedAt))
    .limit(RECONCILE_LIMIT)
    .all();
  for (const row of parked) {
    const park = lastParkAskOf(deps.db, row.runId, row.threadId);
    if (park === null) {
      continue;
    }
    if (approvals.getByRunInterrupt(deps.orgId, row.runId, park.askId) !== null) {
      continue;
    }
    requestApprovalForPark({
      orgId: deps.orgId,
      threads: deps.threads,
      approvals,
      ...(deps.approvalEvents === undefined ? {} : { approvalEvents: deps.approvalEvents }),
      park,
      ...runtimeOf(deps, row.threadId),
    });
  }
}

function discardApprovalsOfTerminalRuns(
  deps: ApprovalReconcileDeps,
  approvals: ApprovalStorePort,
): void {
  const pending = approvals.list(deps.orgId, { status: 'pending', limit: RECONCILE_LIMIT });
  if (pending.length === 0) {
    return;
  }
  const runIds = [...new Set(pending.map((approval) => approval.runId))];
  const rows = deps.db
    .select({ runId: runsTable.runId, status: runsTable.status })
    .from(runsTable)
    .where(inArray(runsTable.runId, runIds))
    .all();
  const terminal = new Set(
    rows.filter((row) => TERMINAL_RUN_STATUSES.has(row.status)).map((row) => row.runId),
  );
  for (const runId of terminal) {
    for (const approval of approvals.markRunCancelled(deps.orgId, runId)) {
      deps.approvalEvents?.emit(deps.orgId, { type: 'cancelled', approval });
    }
  }
}

function shouldReapRecord(deps: ApprovalReconcileDeps, record: RunRecord): Promise<boolean> {
  const approvals = deps.approvals;
  if (approvals === undefined) {
    return Promise.resolve(true);
  }
  try {
    const park = lastParkAskOf(deps.db, record.runId, record.threadId);
    if (park === null) {
      return Promise.resolve(true);
    }
    return Promise.resolve(
      approvals.getByRunInterrupt(deps.orgId, record.runId, park.askId) === null,
    );
  } catch (error) {
    deps.logger?.warn({ error, orgId: deps.orgId, runId: record.runId }, 'reap guard failed');
    return Promise.resolve(true);
  }
}

interface RunEventMetaRow {
  type: string;
  metadata: string | null;
}

interface AskEventMeta {
  askId?: unknown;
  source?: unknown;
  prompt?: unknown;
  budget?: unknown;
  tool?: unknown;
  delegated?: unknown;
}

function lastParkAskOf(db: OrgSqliteDb, runId: string, threadId: string): ObservedPark | null {
  const row = db
    .select({ type: runEventsTable.type, metadata: runEventsTable.metadata })
    .from(runEventsTable)
    .where(eq(runEventsTable.runId, runId))
    .orderBy(desc(runEventsTable.seq))
    .limit(1)
    .get() as RunEventMetaRow | undefined;
  if (row === undefined || row.type !== 'ask' || row.metadata === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.metadata);
  } catch {
    return null;
  }
  const meta = (parsed ?? {}) as AskEventMeta;
  if (typeof meta.askId !== 'string' || typeof meta.source !== 'string') {
    return null;
  }
  if (!APPROVAL_PARK_SOURCE_SET.has(meta.source)) {
    return null;
  }
  return {
    runId,
    threadId,
    askId: meta.askId,
    source: meta.source,
    ...(typeof meta.prompt === 'string' ? { prompt: meta.prompt } : {}),
    ...(isRecord(meta.budget) ? { budget: meta.budget as ApprovalBudget } : {}),
    ...(isRecord(meta.tool) ? { tool: meta.tool as ObservedParkTool } : {}),
    ...(isRecord(meta.delegated) ? { delegated: meta.delegated as ApprovalDelegatedContext } : {}),
  };
}

function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function runtimeOf(
  deps: ApprovalReconcileDeps,
  threadId: string,
): { fileRuntime: ParkFileRuntime } | undefined {
  const runtime = deps.fileRuntime?.(threadId);
  return runtime === undefined ? undefined : { fileRuntime: runtime };
}
