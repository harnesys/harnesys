import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import {
  approvalRequestForPark,
  type ObservedPark,
  type ParkFileRuntime,
} from '../../domain/approval/park-observer.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export function requestApprovalForPark(input: {
  orgId: string;
  threads: ThreadRepositoryPort;
  approvals: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
  park: ObservedPark;
  fileRuntime?: ParkFileRuntime;
}): void {
  const thread = input.threads.findById(input.orgId, input.park.threadId);
  const request = approvalRequestForPark(input.park, thread, input.fileRuntime);
  const { id } = input.approvals.request(input.orgId, request);
  const row = input.approvals.get(input.orgId, id);
  if (row) {
    input.approvalEvents?.emit(input.orgId, { type: 'requested', approval: row });
  }
}
