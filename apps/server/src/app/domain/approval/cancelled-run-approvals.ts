import type { SessionEvent } from 'harnesys';
import type { ApprovalEventsPort } from './approval-events.port.ts';
import type { ApprovalStorePort } from './approval-store.port.ts';

export interface CancelledRunApprovalsDeps {
  approvals: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
}

export function hasRunCancelledEvent(events: SessionEvent[]): boolean {
  return events.some((event) => event.type === 'run.cancelled');
}

export function observeCancelledRun(
  deps: CancelledRunApprovalsDeps,
  orgId: string,
  runId: string,
  events: SessionEvent[],
): void {
  if (!hasRunCancelledEvent(events)) {
    return;
  }
  queueMicrotask(() => {
    try {
      for (const approval of deps.approvals.markRunCancelled(orgId, runId)) {
        deps.approvalEvents?.emit(orgId, { type: 'cancelled', approval });
      }
    } catch {
      // run cancel → inbox is best-effort
    }
  });
}
