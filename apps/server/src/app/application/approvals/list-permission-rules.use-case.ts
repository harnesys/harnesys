import { Injectable } from '@harnesys/brix';
import type { ListPermissionRulesResponse } from '@harnesys/contracts';
import type {
  PermissionRuleFilter,
  PermissionRuleKind,
} from '../../domain/permissions/permission-rule-store.port.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';

export interface ListPermissionRulesRequest {
  orgId: string;
  agentId?: string;
  kind?: PermissionRuleKind;
}

@Injectable()
export class ListPermissionRulesUseCase {
  constructor(private readonly rules: PermissionRuleStorePort) {}

  execute(request: ListPermissionRulesRequest): ListPermissionRulesResponse {
    const filter: PermissionRuleFilter = {
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      ...(request.kind === undefined ? {} : { kind: request.kind }),
    };
    return { items: this.rules.list(request.orgId, filter) };
  }
}
