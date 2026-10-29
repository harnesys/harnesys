import type { AgentDefinition, AgentRosterEntry, HookBinding } from 'harnesys';
import { effectivePlugins } from '../../application/plugins/effective-plugins.ts';
import {
  agentHookBindings,
  pluginHookBindings,
} from '../../application/plugins/plugin-grant-gate.ts';
import type {
  LoadedOrgPlugin,
  PluginRuntimeBundle,
} from '../../domain/plugin/plugin-runtime.port.ts';
import { pluginRosterEntries } from '../../domain/plugin/plugin-runtime.port.ts';

const SESSION_START_HOOK_TIMEOUT_S = 30;

export interface OrgPluginView {
  roster(parent?: AgentDefinition): AgentRosterEntry[];
  resolvePluginAgent(id: string, parent?: AgentDefinition): AgentDefinition | undefined;
  hooksFor(agent: AgentDefinition, cwd: string): HookBinding[];
  binDirsFor(agent: AgentDefinition): string[];
}

export function createOrgPluginView(bundle: PluginRuntimeBundle): OrgPluginView {
  function effectiveAgentPlugins(agent: AgentDefinition): LoadedOrgPlugin[] {
    return effectivePlugins(bundle.entries, agent.enabledPlugins);
  }

  return {
    roster(parent?: AgentDefinition): AgentRosterEntry[] {
      if (parent === undefined) {
        return [];
      }
      return pluginRosterEntries(bundle.agents).filter(
        (entry) => entry.plugin !== undefined && parent.enabledPlugins?.[entry.plugin] === true,
      );
    },
    resolvePluginAgent(id: string, parent?: AgentDefinition): AgentDefinition | undefined {
      const agent = bundle.agents.find((entry) => entry.id === id);
      if (agent === undefined) {
        return undefined;
      }
      if (parent !== undefined && parent.enabledPlugins?.[agent.plugin] !== true) {
        return undefined;
      }
      return agent.definition;
    },
    hooksFor(agent: AgentDefinition, cwd: string): HookBinding[] {
      const pluginBindings = effectiveAgentPlugins(agent)
        .toSorted((a, b) => a.record.name.localeCompare(b.record.name))
        .flatMap((entry) => pluginHookBindings(entry.ir, entry.userConfig));
      const bindings = [
        ...pluginBindings,
        ...agentHookBindings(agent.id, agent.hooks ?? [], cwd, agent.permissions),
      ];
      return bindings.map(lowerSessionStartTimeout);
    },
    binDirsFor(agent: AgentDefinition): string[] {
      const dirs: string[] = [];
      for (const entry of effectiveAgentPlugins(agent)) {
        for (const component of entry.ir.components) {
          if (component.kind === 'path-entry' && component.status === 'native') {
            dirs.push((component.spec as { dir: string }).dir);
          }
        }
      }
      return dirs;
    },
  };
}

function lowerSessionStartTimeout(binding: HookBinding): HookBinding {
  if (binding.event !== 'SessionStart' || binding.handler.type === 'inline') {
    return binding;
  }
  if (binding.handler.timeoutS !== undefined) {
    return binding;
  }
  return {
    ...binding,
    handler: { ...binding.handler, timeoutS: SESSION_START_HOOK_TIMEOUT_S },
  };
}
