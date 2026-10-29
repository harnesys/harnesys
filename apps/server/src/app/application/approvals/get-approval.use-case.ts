import { Injectable } from '@harnesys/brix';
import type { ApprovalPublic } from '@harnesys/contracts';
import { ApprovalNotFoundException } from '../../domain/approval/approval.error.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { toApprovalPublic } from './approval.helpers.ts';

export interface GetApprovalRequest {
  orgId: string;
  approvalId: string;
}

@Injectable()
export class GetApprovalUseCase {
  constructor(private readonly store: ApprovalStorePort) {}

  execute(request: GetApprovalRequest): ApprovalPublic {
    const row = this.store.get(request.orgId, request.approvalId);
    if (!row) {
      throw new ApprovalNotFoundException(request.approvalId);
    }
    return toApprovalPublic(row);
  }
}
