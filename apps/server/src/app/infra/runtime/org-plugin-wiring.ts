import type { McpServerInfo, SkillRegistry, StdioEntry, ToolDefinition, UrlEntry } from 'harnesys';
import {
  aliasTool,
  CONSOLE_LOGGER,
  createLoadSkillTool,
  createToolRegistry,
  McpRegistry as McpRegistryClass,
} from 'harnesys';
import type { PluginRuntimeBundle } from '../../domain/plugin/plugin-runtime.port.ts';
import { createOrgPluginView, type OrgPluginView } from './org-plugin-view.ts';

export interface OrgPluginWiring {
  view: OrgPluginView;
  skills: SkillRegistry;
  baseTools: ToolDefinition[];
  makeRegistry: () => Map<string, ToolDefinition>;
  makeLoadSkill: (registry: SkillRegistry) => ToolDefinition[];
  listMcp: () => Promise<McpServerInfo[]>;
  applyMcp: (serverId: string, entry: StdioEntry | UrlEntry | null) => Promise<void>;
  close: () => Promise<void>;
}

export interface OrgPluginRuntimeSource {
  bundle(orgId: string): Promise<PluginRuntimeBundle>;
}

export async function wireOrgPlugins(
  plugins: OrgPluginRuntimeSource,
  orgId: string,
): Promise<OrgPluginWiring> {
  const bundle = await plugins.bundle(orgId);
  const mcpRegistry = new McpRegistryClass(undefined, CONSOLE_LOGGER);
  await mcpRegistry.loadJson(bundle.mcpJson);
  const registry = createToolRegistry(mcpRegistry.tools());

  function refreshRegistry(): void {
    registry.clear();
    for (const def of mcpRegistry.tools()) {
      registry.set(def.name, def);
    }
  }

  return {
    view: createOrgPluginView(bundle),
    skills: bundle.skills,
    baseTools: mcpRegistry.tools(),
    makeRegistry: () => registry,
    makeLoadSkill: (skills: SkillRegistry) => {
      const loadSkill = createLoadSkillTool(skills);
      return [loadSkill, aliasTool(loadSkill, 'Skill')];
    },
    listMcp: () => mcpRegistry.list(),
    applyMcp: async (serverId, entry) => {
      if (entry === null) {
        await mcpRegistry.forget(serverId);
      } else {
        await mcpRegistry.disable(serverId);
        await mcpRegistry.loadJson({ mcpServers: { [serverId]: entry } });
      }
      refreshRegistry();
    },
    close: () => mcpRegistry.closeAll(),
  };
}
