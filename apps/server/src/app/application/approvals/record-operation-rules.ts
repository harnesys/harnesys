import type { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';

export interface RecordOperationRulesInput {
  agentId: string;
  ops: string[];
  decidedBy?: string;
}

export function recordOperationRules(
  rules: PermissionRuleStorePort,
  orgId: string,
  input: RecordOperationRulesInput,
): void {
  for (const op of input.ops) {
    rules.record(orgId, {
      agentId: input.agentId,
      kind: 'op',
      pattern: op,
      effect: 'allow',
      ...(input.decidedBy !== undefined ? { decidedBy: input.decidedBy } : {}),
    });
  }
}
