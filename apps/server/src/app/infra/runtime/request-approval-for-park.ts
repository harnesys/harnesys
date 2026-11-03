import type { SessionEvent } from 'harnesys';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import {
  approvalRequestForPark,
  type ObservedPark,
  observeParks,
  type ParkFileRuntime,
} from '../../domain/approval/park-observer.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runAgentIdOf, runStatusOf } from './run-row-queries.ts';

export function requestApprovalForPark(input: {
  orgId: string;
  approvals: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
  park: ObservedPark;
  runAgentId?: string;
  fileRuntime?: ParkFileRuntime;
}): void {
  const request = approvalRequestForPark(input.park, input.runAgentId, input.fileRuntime);
  const { id } = input.approvals.request(input.orgId, request);
  const row = input.approvals.get(input.orgId, id);
  if (row) {
    input.approvalEvents?.emit(input.orgId, { type: 'requested', approval: row });
  }
}

export function requestRunParkApprovals(input: {
  orgId: string;
  db: OrgSqliteDb;
  approvals: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
  runId: string;
  threadId: string;
  events: SessionEvent[];
  fileRuntime?: (threadId: string) => ParkFileRuntime | undefined;
  onError?: (error: unknown, park: ObservedPark) => void;
}): void {
  observeParks(input.threadId, input.runId, input.events, (park) => {
    if (runStatusOf(input.db, input.runId) !== 'needs_input') {
      return;
    }
    try {
      const runtime = input.fileRuntime?.(input.threadId);
      const runAgentId = runAgentIdOf(input.db, input.runId);
      requestApprovalForPark({
        orgId: input.orgId,
        approvals: input.approvals,
        approvalEvents: input.approvalEvents,
        park,
        ...(runAgentId === undefined ? {} : { runAgentId }),
        ...(runtime === undefined ? {} : { fileRuntime: runtime }),
      });
    } catch (error) {
      input.onError?.(error, park);
    }
  });
}
