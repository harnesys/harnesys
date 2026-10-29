import type { AgentHook } from '@harnesys/contracts';
import type { AgentGraph } from '@harnesys/studio-shared';
import type { AgentDraft } from '@/entities/agent';
import type { PackAssignmentMap } from './draft-overrides';
export interface AgentCapabilitiesDraft {
  skills?: string[];
  mcpServers?: string[];
  compaction?: unknown;
  capabilities?: PackAssignmentMap;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
}
export interface AgentConfigResult {
  fields: AgentDraft;
  capabilities: AgentCapabilitiesDraft;
  graph?: AgentGraph;
  deleted?: boolean;
}
