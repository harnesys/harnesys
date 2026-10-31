import { Injectable } from '@harnesys/brix';
import { PermissionGrantNotFoundException } from '../../domain/approval/approval.error.ts';
import { PermissionGrantStorePort } from '../../domain/approval/permission-grant-store.port.ts';

export interface RevokePermissionGrantRequest {
  orgId: string;
  grantId: string;
}

@Injectable()
export class RevokePermissionGrantUseCase {
  constructor(private readonly grants: PermissionGrantStorePort) {}

  execute(request: RevokePermissionGrantRequest): void {
    const removed = this.grants.revoke(request.orgId, request.grantId);
    if (!removed) {
      throw new PermissionGrantNotFoundException(request.grantId);
    }
  }
}
