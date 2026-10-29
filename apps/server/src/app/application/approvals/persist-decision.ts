import { dirname, sep } from 'node:path';
import type { ApprovalDecisionScope, ApprovalRule, FileApprovalRule } from '@harnesys/contracts';
import { DEFAULT_PERMISSIONS } from 'harnesys';
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

export interface PersistOpAllowInput {
  agentId: string;
  ops: string[];
}

const PERMISSIONS_CONFIG_KEY = 'permissionsJson';

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

export function persistOpAllow(deps: ApprovalPersistDeps, input: PersistOpAllowInput): void {
  if (input.ops.length === 0) {
    return;
  }
  const agent = deps.agents.findById(deps.orgId, input.agentId);
  if (!agent) {
    return;
  }
  const key = permissionsKeyOf(agent.config);
  const stored = permissionsOf(agent.config, key);
  const next: Record<string, unknown> = { ...stored };
  let changed = false;
  for (const op of input.ops) {
    if (effectiveGateOf(stored, op) !== 'ask') {
      continue;
    }
    next[op] = 'allow';
    changed = true;
  }
  if (!changed) {
    return;
  }
  deps.agents.update(deps.orgId, input.agentId, {
    config: { ...agent.config, [key]: next },
  });
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

function permissionsKeyOf(config: Record<string, unknown>): string {
  const legacy = config.permissions;
  if (
    (config[PERMISSIONS_CONFIG_KEY] === undefined || config[PERMISSIONS_CONFIG_KEY] === null) &&
    legacy !== null &&
    typeof legacy === 'object' &&
    !Array.isArray(legacy)
  ) {
    return 'permissions';
  }
  return PERMISSIONS_CONFIG_KEY;
}

function permissionsOf(config: Record<string, unknown>, key: string): Record<string, unknown> {
  const raw = config[key];
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function effectiveGateOf(stored: Record<string, unknown>, op: string): string {
  const gate = stored[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
  return typeof gate === 'string' ? gate : 'ask';
}
