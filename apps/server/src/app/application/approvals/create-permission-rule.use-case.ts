import { Injectable } from '@harnesys/brix';
import type { CommandApprovalRule, CreatePermissionRuleBody } from '@harnesys/contracts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';
import { shellRulePatternsOf } from './persist-shell-rule.ts';

export interface CreatePermissionRuleRequest {
  orgId: string;
  body: CreatePermissionRuleBody;
}

@Injectable()
export class CreatePermissionRuleUseCase {
  constructor(private readonly rules: PermissionRuleStorePort) {}

  execute(request: CreatePermissionRuleRequest): void {
    const { body, orgId } = request;
    const scope = body.agentId === undefined ? {} : { agentId: body.agentId };
    const hostScope = body.hostId === undefined ? {} : { hostId: body.hostId };
    if (body.kind === 'shell-cmd' && body.effect === 'allow') {
      for (const pattern of shellRulePatternsOf(commandRuleOf(body.pattern))) {
        this.rules.record(orgId, { kind: 'shell-cmd', pattern, effect: 'allow', ...scope });
      }
      return;
    }
    this.rules.record(orgId, {
      kind: body.kind,
      pattern: body.pattern,
      effect: body.effect,
      ...scope,
      ...hostScope,
      ...(body.action === undefined ? {} : { action: body.action }),
    });
  }
}

function commandRuleOf(pattern: string): CommandApprovalRule {
  return {
    kind: 'exact',
    pattern,
    target: 'agent',
    commandScope: 'exact',
  };
}
