import type { AgentPublic } from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/contracts';
import {
  AgentNotFoundException,
  AgentValidationException,
} from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';

export function toAgentPublic(record: AgentRecord): AgentPublic {
  const publicRecord: AgentPublic = {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    role: record.role,
    instructions: record.instructions,
    modelId: record.modelId,
    budgetUsdDaily: record.budgetUsdDaily,
    level: record.level,
    parentId: record.parentId,
    executionProfileId: record.executionProfileId,
    status: record.status,
    sharedSourceIds: record.sharedSourceIds,
    secretNames: record.secretNames,
    skills: record.skills,
    mcpServers: record.mcpServers,
    enabledPlugins: record.enabledPlugins,
    defaultModeId: record.defaultModeId,
    hooks: record.hooks,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (Object.keys(record.config).length > 0) {
    publicRecord.config = record.config;
  }
  if (Object.keys(record.sourceLevels).length > 0) {
    publicRecord.sourceLevels = record.sourceLevels;
  }
  return publicRecord;
}

const HOOK_CONFIG_KEYS = ['hooksJson', 'hooks'];

export function stripHookConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!HOOK_CONFIG_KEYS.includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

export function requireAgent(
  agents: AgentRegistryPort,
  orgId: string,
  agentId: string,
): AgentRecord {
  const found = agents.findById(orgId, agentId);
  if (!found) {
    throw new AgentNotFoundException(agentId);
  }
  return found;
}

export function validateDefaultModeId(
  presets: ModePresetRegistryPort,
  orgId: string,
  defaultModeId: string | null,
): void {
  if (defaultModeId === null || defaultModeId === DEFAULT_MODE_ID) {
    return;
  }
  if (!presets.findById(orgId, defaultModeId)) {
    throw new AgentValidationException(`unknown defaultModeId: ${defaultModeId}`);
  }
}

export function validateExecutionProfileId(
  profiles: ExecutionProfilePort,
  orgId: string,
  executionProfileId: string | null,
): string | null {
  if (executionProfileId === null) {
    return null;
  }
  if (!profiles.findById(orgId, executionProfileId)) {
    throw new AgentValidationException(`unknown executionProfileId: ${executionProfileId}`);
  }
  return executionProfileId;
}

export function uniqueAgentName(
  agents: AgentRegistryPort,
  orgId: string,
  baseName: string,
): string {
  const base = baseName.trim();
  if (!agents.findByName(orgId, base)) {
    return base;
  }
  let n = 2;
  while (agents.findByName(orgId, `${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}

export function assertNonEmptyName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new AgentValidationException('agent name is required');
  }
  return trimmed;
}
