import type { AgentHook, AgentLevel, AgentSourceLevel, AgentStatus } from '@harnesys/contracts';

export interface AgentRecord {
  id: string;
  orgId: string;
  name: string;
  role: string;
  instructions: string;
  modelId: string;
  budgetUsdDaily: number | null;
  level: AgentLevel;
  parentId: string | null;
  executionProfileId: string | null;
  status: AgentStatus;
  sharedSourceIds: string[];
  sourceLevels: Record<string, AgentSourceLevel>;
  secretNames: string[];
  skills: string[];
  mcpServers: string[];
  enabledPlugins: Record<string, boolean>;
  defaultModeId: string | null;
  config: Record<string, unknown>;
  hooks: AgentHook[];
  createdAt: string;
  updatedAt: string;
}

export type AgentPatch = Partial<{
  name: string;
  role: string;
  instructions: string;
  modelId: string;
  budgetUsdDaily: number | null;
  level: AgentLevel;
  parentId: string | null;
  executionProfileId: string | null;
  status: AgentStatus;
  sharedSourceIds: string[];
  sourceLevels: Record<string, AgentSourceLevel>;
  secretNames: string[];
  skills: string[];
  mcpServers: string[];
  enabledPlugins: Record<string, boolean>;
  defaultModeId: string | null;
  config: Record<string, unknown>;
  hooks: AgentHook[];
}>;
