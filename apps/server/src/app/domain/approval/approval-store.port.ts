import type {
  ApprovalDecideInput,
  ApprovalListFilter,
  ApprovalRecord,
  ApprovalRequestInput,
  ApprovalResumeState,
  ApprovalStatus,
} from './approval.ts';

export abstract class ApprovalStorePort {
  abstract request(orgId: string, input: ApprovalRequestInput): { id: string };
  abstract decide(
    orgId: string,
    input: ApprovalDecideInput,
  ): { winner: boolean; status: ApprovalStatus };
  abstract list(orgId: string, filter?: ApprovalListFilter): ApprovalRecord[];
  abstract get(orgId: string, approvalId: string): ApprovalRecord | null;
  abstract getByRunInterrupt(
    orgId: string,
    runId: string,
    interruptId: string,
  ): ApprovalRecord | null;
  abstract markRunCancelled(orgId: string, runId: string): ApprovalRecord[];
  abstract listResumable(orgId: string, olderThan: string, limit: number): ApprovalRecord[];
  abstract markResumeApplied(orgId: string, approvalId: string): ApprovalRecord | null;
  abstract markResumeCancelled(orgId: string, approvalId: string): ApprovalRecord | null;
}

export type { ApprovalResumeState };
