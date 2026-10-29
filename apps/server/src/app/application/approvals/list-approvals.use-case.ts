import { Injectable } from '@harnesys/brix';
import type { ListApprovalsQuery, ListApprovalsResponse } from '@harnesys/contracts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { toApprovalPublic } from './approval.helpers.ts';

export interface ListApprovalsRequest {
  orgId: string;
  query?: ListApprovalsQuery;
}

@Injectable()
export class ListApprovalsUseCase {
  constructor(private readonly store: ApprovalStorePort) {}

  execute(request: ListApprovalsRequest): ListApprovalsResponse {
    const items = this.store.list(request.orgId, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return { items: items.map(toApprovalPublic) };
  }
}
