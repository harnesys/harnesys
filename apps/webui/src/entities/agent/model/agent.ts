import type { AgentHook, AgentSourceLevel } from '@harnesys/contracts';
import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentGraph,
  AgentMode,
  PackAssignment,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { PermissionMap } from 'harnesys';
export const AGENT_STATUSES = ['idle', 'running', 'waiting', 'error', 'offline'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export interface Agent {
  id: string;
  orgId: string;
  parentId: string | null;
  name: string;
  modelId: string | null;
  role: string;
  instructions: string;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  budget: AgentBudget | null;
  budgetUsdDaily: number | null;
  memoryPolicy: Record<string, unknown> | null;
  compaction: PortRef;
  skills: string[];
  mcpServers: string[];
  graph: AgentGraph;
  capabilities: Record<string, PackAssignment | null>;
  permissions: PermissionMap | null;
  sharedSourceIds: string[];
  sourceLevels: Record<string, AgentSourceLevel>;
  color: string | null;
  hooks: AgentHook[];
  enabledPlugins: Record<string, boolean>;
  defaultModeId: string | null;
  executionProfileId: string | null;
  modes: AgentMode[];
  createdAt: string;
  updatedAt: string;
  status: AgentStatus;
  initials: string;
  lastActiveAt: string;
  currentTask: string;
}
export interface AgentDraft {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  parentId?: string | null;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  budgetUsdDaily?: number | null;
  memoryPolicy?: Record<string, unknown> | null;
  compaction?: PortRef;
  capabilities?: Record<string, PackAssignment | null>;
  graph?: AgentGraph;
  permissions?: PermissionMap | null;
  sharedSourceIds?: string[];
  sourceLevels?: Record<string, AgentSourceLevel>;
  color?: string | null;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  executionProfileId?: string | null;
  modes?: AgentMode[];
}
export type AgentPatch = Partial<
  Pick<
    Agent,
    | 'name'
    | 'role'
    | 'instructions'
    | 'modelId'
    | 'effort'
    | 'generation'
    | 'toolOutput'
    | 'budget'
    | 'budgetUsdDaily'
    | 'compaction'
    | 'skills'
    | 'mcpServers'
    | 'graph'
    | 'capabilities'
    | 'hooks'
    | 'enabledPlugins'
    | 'defaultModeId'
    | 'executionProfileId'
    | 'modes'
  >
>;
export interface AgentCapabilitiesPatch {
  skills?: string[];
  mcpServers?: string[];
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
  capabilities?: Record<string, PackAssignment | null>;
  compaction?: unknown;
}
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AG';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
export function statusTone(status: AgentStatus): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'running':
      return 'live';
    case 'waiting':
      return 'wait';
    case 'error':
      return 'danger';
    case 'offline':
      return 'off';
    case 'idle':
      return 'idle';
  }
}
export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Waiting';
    case 'error':
      return 'Error';
    case 'offline':
      return 'Offline';
  }
}
export function formatContextWindow(value: number): string {
  if (value >= 1000000) {
    return `${value / 1000000}M`;
  }
  if (value >= 1000) {
    return `${value / 1000}k`;
  }
  return String(value);
}
export function agentStarters(agent: Agent): string[] {
  return [
    `What would you do first as ${agent.name}?`,
    'Give me a plan before we touch anything.',
    'Inspect the project and list key files.',
  ];
}
