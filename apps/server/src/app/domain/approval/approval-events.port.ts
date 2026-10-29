import type { ApprovalRecord } from './approval.ts';

export type ApprovalEvent =
  | { type: 'requested'; approval: ApprovalRecord }
  | { type: 'decided'; approval: ApprovalRecord }
  | { type: 'cancelled'; approval: ApprovalRecord };

export type ApprovalEventListener = (orgId: string, event: ApprovalEvent) => void;

export abstract class ApprovalEventsPort {
  abstract subscribe(listener: ApprovalEventListener): () => void;
  abstract emit(orgId: string, event: ApprovalEvent): void;
}
