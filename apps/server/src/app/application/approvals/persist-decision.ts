import { dirname, sep } from 'node:path';
import type { ApprovalDecisionScope, ApprovalRule, FileApprovalRule } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type {
  ApprovalDelegatedContext,
  ApprovalFileContext,
} from '../../domain/approval/approval.ts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import type { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { denyFileRuleOf, persistFileRule } from './persist-file-rule.ts';
import { persistShellRule } from './persist-shell-rule.ts';

export interface ApprovalPersistDeps {
  orgId: string;
  agents: AgentRegistryPort;
  modes: ModePresetRegistryPort;
  fileRules: FileAccessRulePort;
  machineConfig: MachineConfigPort;
  sourceLocation: SourceLocationPort;
}

export interface PersistFileDecisionInput {
  agentId: string;
  file: ApprovalFileContext;
  blockPath: boolean;
  rule: ApprovalRule | undefined;
  scope: ApprovalDecisionScope | undefined;
}

export interface PersistShellDecisionInput {
  agentId: string;
  rule: ApprovalRule;
}

export function scopePersistsRule(
  scope: ApprovalDecisionScope | undefined,
  rule: ApprovalRule | undefined,
): boolean {
  if (scope === 'always') {
    return true;
  }
  return scope === undefined && rule !== undefined;
}

export function targetAgentIdOf(
  delegated: ApprovalDelegatedContext | undefined,
  fallback: string,
): string {
  return delegated?.agentId ?? fallback;
}

export function persistFileDecision(
  deps: ApprovalPersistDeps,
  input: PersistFileDecisionInput,
): void {
  if (input.blockPath) {
    persistFileRule(
      { fileRules: deps.fileRules, machineConfig: deps.machineConfig },
      {
        orgId: deps.orgId,
        agentId: input.agentId,
        rule: denyFileRuleOf(input.rule),
        requestedPath: input.file.canonicalPath,
        action: input.file.action,
      },
    );
    return;
  }
  if (input.rule?.kind === 'file-path') {
    persistFileRule(
      { fileRules: deps.fileRules, machineConfig: deps.machineConfig },
      {
        orgId: deps.orgId,
        agentId: input.agentId,
        rule: input.rule,
        requestedPath: input.file.canonicalPath,
        action: input.file.action,
      },
    );
    return;
  }
  if (input.scope !== 'always') {
    return;
  }
  if (upgradeSourceLevel(deps, input.agentId, input.file)) {
    return;
  }
  persistFileRule(
    { fileRules: deps.fileRules, machineConfig: deps.machineConfig },
    {
      orgId: deps.orgId,
      agentId: input.agentId,
      rule: folderRuleOf(input.file),
      requestedPath: input.file.canonicalPath,
      action: input.file.action,
    },
  );
}

export function persistShellDecision(
  deps: ApprovalPersistDeps,
  input: PersistShellDecisionInput,
): void {
  if (input.rule.kind === 'file-path') {
    return;
  }
  const agent = deps.agents.findById(deps.orgId, input.agentId);
  persistShellRule(
    { agents: deps.agents, modes: deps.modes },
    {
      orgId: deps.orgId,
      agentId: input.agentId,
      defaultModeId: agent?.defaultModeId ?? null,
      rule: input.rule,
    },
  );
}

function upgradeSourceLevel(
  deps: ApprovalPersistDeps,
  agentId: string,
  file: ApprovalFileContext,
): boolean {
  const agent = deps.agents.findById(deps.orgId, agentId);
  if (!agent) {
    return false;
  }
  const hostId = deps.machineConfig.get().id;
  for (const sourceId of agent.sharedSourceIds) {
    let root: string;
    try {
      root = deps.sourceLocation.resolve({ orgId: deps.orgId, sourceId, hostId }).absoluteRoot;
    } catch {
      continue;
    }
    if (!isInsideRoot(file.canonicalPath, root)) {
      continue;
    }
    if (agent.sourceLevels[sourceId] === 'read' && file.action === 'edit') {
      deps.agents.update(deps.orgId, agentId, {
        sourceLevels: { ...agent.sourceLevels, [sourceId]: 'edit' },
      });
    }
    return true;
  }
  return false;
}

function folderRuleOf(file: ApprovalFileContext): FileApprovalRule {
  return {
    kind: 'file-path',
    target: 'agent',
    effect: 'allow',
    pattern: dirname(file.canonicalPath),
  };
}

function isInsideRoot(path: string, root: string): boolean {
  const normalized = root.endsWith(sep) ? root : root + sep;
  return path.startsWith(normalized);
}
