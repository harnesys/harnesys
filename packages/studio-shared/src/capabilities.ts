import type { AgentRosterEntry, ExplainEntry, ToolExposure } from 'harnesys';
export interface AgentCapabilityRegistryEntry {
  name: string;
  exposure: ToolExposure;
  source: string;
}
export interface AgentCapabilitiesView {
  explain: ExplainEntry[];
  registry: AgentCapabilityRegistryEntry[];
  subagents: AgentRosterEntry[];
}
