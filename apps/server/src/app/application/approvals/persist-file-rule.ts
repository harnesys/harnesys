import type { ApprovalRule, FileApprovalRule } from '@harnesys/contracts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';

export interface PersistFileRuleDeps {
  fileRules: FileAccessRulePort;
  machineConfig: MachineConfigPort;
}

export interface PersistFileRuleInput {
  orgId: string;
  agentId: string;
  rule: FileApprovalRule;
  requestedPath: string;
  action: 'read' | 'edit';
}

export function persistFileRule(deps: PersistFileRuleDeps, input: PersistFileRuleInput): void {
  deps.fileRules.insert({
    orgId: input.orgId,
    agentId: input.rule.target === 'global' ? null : input.agentId,
    hostId: input.rule.hostId ?? deps.machineConfig.get().id,
    pathPattern: input.rule.pattern ?? input.requestedPath,
    action: input.action,
    effect: input.rule.effect,
  });
}

export function denyFileRuleOf(rule: ApprovalRule | undefined): FileApprovalRule {
  if (rule?.kind !== 'file-path') {
    return { kind: 'file-path', target: 'agent', effect: 'deny' };
  }
  return { ...rule, effect: 'deny' };
}
