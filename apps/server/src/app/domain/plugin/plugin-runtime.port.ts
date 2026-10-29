import type {
  AgentDefinition,
  AgentRosterEntry,
  CursorMcpJson,
  LspServerSpec,
  PluginIr,
  SkillRegistry,
  UserConfigContentOptions,
} from 'harnesys';
import type { PluginInstallRecord } from './plugin.ts';

export interface LoadedOrgPlugin {
  record: PluginInstallRecord;
  ir: PluginIr;
  userConfig: UserConfigContentOptions;
}

export interface PluginAgentEntry {
  id: string;
  plugin: string;
  name: string;
  definition: AgentDefinition;
}

export interface PluginLspEntry {
  serverId: string;
  plugin: string;
  spec: LspServerSpec;
  disabled: boolean;
}

export interface PluginRuntimeBundle {
  entries: LoadedOrgPlugin[];
  skills: SkillRegistry;
  mcpJson: CursorMcpJson;
  agents: PluginAgentEntry[];
  lspServers: PluginLspEntry[];
}

export function bundleHasPlugins(bundle: PluginRuntimeBundle): boolean {
  return bundle.entries.length > 0;
}

export function pluginRosterEntries(agents: PluginAgentEntry[]): AgentRosterEntry[] {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    plugin: agent.plugin,
  }));
}

export abstract class PluginRuntimePort {
  abstract bundle(orgId: string): Promise<PluginRuntimeBundle>;
  abstract invalidate(orgId: string): void;
}
