import type { AgentHook } from '@harnesys/contracts';
import type { Edge, Node, PackAssignment, PermissionMap } from 'harnesys';
import type { AgentGenerationSettings, PortRef, ToolOutputSettings } from './harnesys-bridge.ts';
import type { AgentMode } from './modes.ts';
export type BudgetPolicy = 'ask' | 'error';
export type SpawnBudgetMode = 'pool' | 'inherit';
export interface AgentBudget {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
  warnAtSteps?: number;
  closeOnExhaustion?: boolean;
  extendDefaultPct?: number;
  spawnBudget?: SpawnBudgetMode;
}
export type AgentGraphRankdir = 'TB' | 'LR';
export interface AgentGraphPosition {
  x: number;
  y: number;
}
export interface AgentGraphLayout {
  rankdir: AgentGraphRankdir;
  positions: Record<string, AgentGraphPosition>;
}
export interface AgentGraph {
  nodes: Record<string, Node>;
  edges: Edge[];
  layout?: AgentGraphLayout;
  toolPolicy?: 'explicit';
}
export interface AgentRecord {
  id: string;
  name: string;
  projectId: string;
  parentId?: string | null;
  modelId?: string | null;
  role: string;
  instructions: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  graph?: AgentGraph;
  budget?: AgentBudget | null;
  memoryPolicy?: Record<string, unknown> | null;
  capabilities?: Record<string, PackAssignment | null>;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
  createdAt: string;
  updatedAt: string;
}
