import type { AgentPublic, AgentSourceLevel } from '@harnesys/contracts';
import {
  type AgentBudget,
  type AgentGenerationSettings,
  type AgentGraph,
  type AgentGraphLayout,
  type AgentMode,
  type AgentRecord,
  DEFAULT_MODE_ID,
  defaultAgentCompaction,
  isModeId,
  type PackAssignment,
  type PortRef,
  type ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { Edge, Node, PermissionMap } from 'harnesys';
import { type Agent, initialsFromName } from './agent';

export function toClientAgent(record: AgentRecord): Agent {
  return {
    id: record.id,
    orgId: record.projectId,
    parentId: record.parentId ?? null,
    name: record.name,
    modelId: record.modelId ?? null,
    role: record.role,
    instructions: record.instructions,
    effort: record.effort ?? null,
    generation: record.generation ?? null,
    toolOutput: record.toolOutput ?? null,
    budget: record.budget ?? null,
    budgetUsdDaily: null,
    memoryPolicy: record.memoryPolicy ?? null,
    compaction: parseCompaction(record.compaction),
    skills: record.skills ?? [],
    mcpServers: record.mcpServers ?? [],
    graph: record.graph ?? { nodes: {}, edges: [] },
    capabilities: record.capabilities ?? {},
    permissions: record.permissions ?? null,
    sharedSourceIds: [],
    sourceLevels: {},
    color: record.color ?? null,
    hooks: record.hooks ?? [],
    enabledPlugins: record.enabledPlugins ?? {},
    defaultModeId: record.defaultModeId ?? null,
    executionProfileId: null,
    modes: parseModes(record.modes),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: 'idle',
    initials: initialsFromName(record.name),
    currentTask: record.modelId ? 'Ready.' : 'Pick a model to chat.',
    lastActiveAt: new Date().toISOString(),
  };
}

export function toClientAgentFromPublic(record: AgentPublic): Agent {
  const config = record.config ?? {};
  return {
    id: record.id,
    orgId: record.orgId,
    parentId: record.parentId,
    name: record.name,
    modelId: record.modelId || null,
    role: record.role,
    instructions: record.instructions,
    effort: typeof config.effort === 'string' ? config.effort : null,
    generation: asObject(config.generation) as AgentGenerationSettings | null,
    toolOutput: asObject(config.toolOutput) as ToolOutputSettings | null,
    budget: asObject(config.budgetJson) as AgentBudget | null,
    budgetUsdDaily: record.budgetUsdDaily ?? null,
    memoryPolicy: asObject(config.memoryPolicyJson),
    compaction: parseCompaction(config.compactionJson),
    skills: record.skills ?? [],
    mcpServers: record.mcpServers ?? [],
    graph: parseGraph(config.graphJson),
    capabilities: parseCapabilities(config.capabilitiesJson),
    permissions: parsePermissions(config.permissionsJson),
    sharedSourceIds: record.sharedSourceIds ?? [],
    sourceLevels: sanitizeLevels(record.sourceLevels),
    color: typeof config.color === 'string' ? config.color : null,
    hooks: record.hooks ?? [],
    enabledPlugins: record.enabledPlugins ?? {},
    defaultModeId: record.defaultModeId,
    executionProfileId: record.executionProfileId ?? null,
    modes: parseModes(config.modesJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: 'idle',
    initials: initialsFromName(record.name),
    currentTask: record.modelId ? 'Ready.' : 'Pick a model to chat.',
    lastActiveAt: new Date().toISOString(),
  };
}

function parseModes(modes: unknown): AgentMode[] {
  if (!Array.isArray(modes)) {
    return [];
  }
  return modes.filter(
    (mode): mode is AgentMode =>
      isModeId(mode?.id) &&
      mode.id !== DEFAULT_MODE_ID &&
      typeof mode?.name === 'string' &&
      mode.name.trim() !== '',
  );
}

function parseCompaction(value: unknown): PortRef {
  const parsed = asObject(value);
  return parsed ? (parsed as PortRef) : defaultAgentCompaction();
}

function parseGraph(value: unknown): AgentGraph {
  const parsed = asObject(value);
  if (!parsed) {
    return { nodes: {}, edges: [] };
  }
  const nodes = (asObject(parsed.nodes) ?? {}) as Record<string, Node>;
  const edges = (Array.isArray(parsed.edges) ? parsed.edges : []) as Edge[];
  const layout = asObject(parsed.layout) as AgentGraphLayout | null;
  return {
    nodes,
    edges,
    ...(layout ? { layout } : {}),
    ...(parsed.toolPolicy === 'explicit' ? { toolPolicy: 'explicit' as const } : {}),
  };
}

function parseCapabilities(value: unknown): Record<string, PackAssignment | null> {
  const parsed = asObject(value);
  if (!parsed) {
    return {};
  }
  return parsed as Record<string, PackAssignment | null>;
}

function parsePermissions(value: unknown): PermissionMap | null {
  const parsed = asObject(value);
  if (!parsed) {
    return null;
  }
  const out: PermissionMap = {};
  for (const [op, gate] of Object.entries(parsed)) {
    if (gate === 'allow' || gate === 'ask' || gate === 'deny') {
      out[op] = gate;
    }
  }
  return out;
}

function sanitizeLevels(
  value: Record<string, AgentSourceLevel> | undefined,
): Record<string, AgentSourceLevel> {
  const out: Record<string, AgentSourceLevel> = {};
  for (const [id, level] of Object.entries(value ?? {})) {
    if (level === 'read' || level === 'edit') {
      out[id] = level;
    }
  }
  return out;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
