import { Injectable } from '@harnesys/brix';
import type { ListPermissionGrantsResponse } from '@harnesys/contracts';
import { PermissionGrantStorePort } from '../../domain/approval/permission-grant-store.port.ts';

export interface ListPermissionGrantsRequest {
  orgId: string;
  agentId?: string;
}

@Injectable()
export class ListPermissionGrantsUseCase {
  constructor(private readonly grants: PermissionGrantStorePort) {}

  execute(request: ListPermissionGrantsRequest): ListPermissionGrantsResponse {
    return {
      items: this.grants.list(request.orgId, request.agentId),
    };
  }
}
