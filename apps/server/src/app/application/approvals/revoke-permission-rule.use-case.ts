import { Injectable } from '@harnesys/brix';
import { PermissionRuleNotFoundException } from '../../domain/approval/approval.error.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';

export interface RevokePermissionRuleRequest {
  orgId: string;
  ruleId: string;
}

@Injectable()
export class RevokePermissionRuleUseCase {
  constructor(private readonly rules: PermissionRuleStorePort) {}

  execute(request: RevokePermissionRuleRequest): void {
    const removed = this.rules.revoke(request.orgId, request.ruleId);
    if (!removed) {
      throw new PermissionRuleNotFoundException(request.ruleId);
    }
  }
}
