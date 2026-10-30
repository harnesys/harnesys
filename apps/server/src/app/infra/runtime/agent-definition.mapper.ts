import type { AgentHook } from '@harnesys/contracts';
import { AgentHookSchema, HookEventNameSchema, parseMemoryPolicy } from '@harnesys/contracts';
import {
  type AgentMode,
  defaultAgentCompaction,
  isModeId,
  type ModeOpPermissions,
  type PackAssignment,
} from '@harnesys/studio-shared';
import type {
  AgentBudget,
  AgentDefinition,
  AgentGenerationSettings,
  AgentGraph,
  AgentModelRef,
  AgentObservability,
  AgentPacks,
  PermissionMap,
  PortRef,
  RawRequestMode,
  ToolExposure,
  ToolOutputSettings,
} from 'harnesys';
import { normalizePackAssignment } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';

export interface AgentModelLookup {
  model: LlmModel | undefined;
  provider: LlmProvider | undefined;
}

const FALLBACK_BUDGET = { maxSteps: 50, policy: 'ask' as const };

const FALLBACK_GRAPH: AgentGraph = {
  nodes: {
    start: { type: 'core:start' },
    think: {
      type: 'llm:generate',
      prompt: 'main',
      messages: '$state.messages',
    },
    act: {
      type: 'tool:call',
      calls: '$output.toolCalls',
      concurrency: 'parallel',
    },
    end: { type: 'core:end' },
  },
  edges: [
    { from: 'start', to: 'think' },
    { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
    { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
    { from: 'think', to: 'end' },
    { from: 'act', to: 'think' },
  ],
};

export function toAgentDefinition(
  agent: AgentRecord,
  lookup: AgentModelLookup,
  onHookWarning?: (reason: string) => void,
): AgentDefinition {
  const graph = graphFromConfig(agent.config);
  const budget = budgetFromConfig(agent.config);
  const toolOutput = toolOutputFromConfig(agent.config);
  const permissions = permissionsFromConfig(agent.config);
  const observability = observabilityFromConfig(agent.config);
  const memoryPolicy = parseMemoryPolicy(agent.config.memoryPolicyJson);
  return {
    id: agent.id,
    prompts: { main: { instructions: agent.instructions } },
    level: agent.level,
    model: resolveModelRef(lookup, agent.config),
    skills: agent.skills,
    mcpServers: agent.mcpServers,
    packs: packsFromConfig(agent.config),
    enabledPlugins: Object.keys(agent.enabledPlugins).length ? agent.enabledPlugins : undefined,
    graph,
    budget,
    compaction: compactionFromConfig(agent.config),
    ...(memoryPolicy ? { memoryPolicy } : {}),
    ...hooksOfAgent(agent, onHookWarning),
    ...(toolOutput ? { toolOutput } : {}),
    ...(permissions ? { permissions } : {}),
    ...(observability ? { observability } : {}),
  };
}

const RAW_REQUEST_MODES = new Set(['meta', 'full', 'off']);

function observabilityFromConfig(config: Record<string, unknown>): AgentObservability | undefined {
  const raw =
    config.observabilityJson !== undefined ? config.observabilityJson : config.observability;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const mode = (raw as Record<string, unknown>).rawRequests;
  if (typeof mode !== 'string' || !RAW_REQUEST_MODES.has(mode)) {
    return undefined;
  }
  return { rawRequests: mode as RawRequestMode };
}

function resolveModelRef(
  lookup: AgentModelLookup,
  config: Record<string, unknown>,
): AgentModelRef | undefined {
  if (!lookup.model || !lookup.provider) {
    return undefined;
  }
  const effort = typeof config.effort === 'string' ? config.effort : undefined;
  const generation = generationFromConfig(config);
  return {
    provider: lookup.provider.name,
    model: lookup.model.name,
    ...(effort ? { effort } : {}),
    ...(generation ? { generation } : {}),
  };
}

function graphFromConfig(config: Record<string, unknown>): AgentGraph {
  const raw = config.graphJson;
  if (raw && typeof raw === 'object') {
    return raw as AgentGraph;
  }
  return FALLBACK_GRAPH;
}

function compactionFromConfig(config: Record<string, unknown>): PortRef {
  const raw = config.compactionJson !== undefined ? config.compactionJson : config.compaction;
  if (raw && typeof raw === 'object') {
    return raw as PortRef;
  }
  return defaultAgentCompaction();
}

function hooksOfAgent(
  agent: AgentRecord,
  onWarning?: (reason: string) => void,
): { hooks: AgentHook[] } | undefined {
  const raw = agent.hooks.length > 0 ? agent.hooks : legacyHooks(agent.config);
  const hooks: AgentHook[] = [];
  raw.forEach((entry, index) => {
    const hook = parseHook(entry);
    if (hook === undefined) {
      onWarning?.(`hook binding dropped: malformed hook at index ${index}`);
      return;
    }
    hooks.push(hook);
  });
  return hooks.length > 0 ? { hooks } : undefined;
}

function legacyHooks(config: Record<string, unknown>): unknown[] {
  const raw = config.hooksJson ?? config.hooks;
  return Array.isArray(raw) ? raw : [];
}

function parseHook(entry: unknown): AgentHook | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return undefined;
  }
  const row = entry as Record<string, unknown>;
  const event = typeof row.event === 'string' ? row.event : undefined;
  if (event === undefined || !HookEventNameSchema.safeParse(event).success) {
    return undefined;
  }
  const result = AgentHookSchema.safeParse({ ...row, event });
  if (!result.success) {
    return undefined;
  }
  return result.data;
}

function budgetFromConfig(config: Record<string, unknown>): AgentBudget | undefined {
  const raw = config.budgetJson;
  if (raw && typeof raw === 'object') {
    return raw as AgentBudget;
  }
  return FALLBACK_BUDGET;
}

function generationFromConfig(
  config: Record<string, unknown>,
): AgentGenerationSettings | undefined {
  const raw = config.generation;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as AgentGenerationSettings;
}

function toolOutputFromConfig(config: Record<string, unknown>): ToolOutputSettings | undefined {
  const raw = config.toolOutput;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as ToolOutputSettings;
}

export function permissionsFromConfig(config: Record<string, unknown>): PermissionMap | undefined {
  const raw = config.permissionsJson ?? config.permissions;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as PermissionMap;
}

export function packsFromConfig(config: Record<string, unknown>): AgentPacks {
  const raw = config.capabilitiesJson ?? config.packs ?? config.capabilities;
  if (!raw || typeof raw !== 'object') {
    return { core: true, files: true, shell: true };
  }
  const packs: AgentPacks = {};
  for (const [name, assignment] of Object.entries(raw as Record<string, unknown>)) {
    if (assignment === undefined || assignment === null || assignment === false) {
      continue;
    }
    packs[name] = normalizePackAssignment(assignment as boolean | Record<string, unknown>);
  }
  if (Object.keys(packs).length === 0) {
    return { core: true, files: true, shell: true };
  }
  return packs;
}

export function modesFromConfig(config: Record<string, unknown>): AgentMode[] {
  const raw = config.modesJson;
  if (!Array.isArray(raw)) {
    return [];
  }
  const modes: AgentMode[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : undefined;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (id === undefined || id === 'default' || !isModeId(id) || name === '') {
      continue;
    }
    modes.push(shapeMode(row, id, name));
  }
  return modes;
}

export function modeByIdOf(modes: AgentMode[], id: string | undefined): AgentMode | undefined {
  if (id === undefined || id === 'default') {
    return undefined;
  }
  return modes.find((mode) => mode.id === id);
}

function shapeMode(row: Record<string, unknown>, id: string, name: string): AgentMode {
  const mode: AgentMode = { id, name };
  if (typeof row.description === 'string' && row.description !== '') {
    mode.description = row.description;
  }
  if (typeof row.instructions === 'string' && row.instructions !== '') {
    mode.instructions = row.instructions;
  }
  if (Array.isArray(row.skills)) {
    mode.skills = row.skills.filter((skill): skill is string => typeof skill === 'string');
  }
  if (row.packs && typeof row.packs === 'object' && !Array.isArray(row.packs)) {
    mode.packs = row.packs as Record<string, PackAssignment | null>;
  }
  if (Array.isArray(row.disabledTools)) {
    mode.disabledTools = row.disabledTools.filter(
      (tool): tool is string => typeof tool === 'string',
    );
  }
  if (isExposureMap(row.exposure)) {
    mode.exposure = row.exposure as Record<string, ToolExposure>;
  }
  if (isPermissionsMap(row.permissions)) {
    mode.permissions = row.permissions as ModeOpPermissions;
  }
  return mode;
}

function isExposureMap(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => entry === 'direct' || entry === 'deferred');
}

function isPermissionsMap(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (gate) => gate === 'allow' || gate === 'ask' || gate === 'deny',
  );
}
