import type { AgentDefinition } from 'harnesys';
import type { OrgPluginWiring } from './org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import { applyShellRulePatterns } from './org-runtime-permission-rules.ts';
import { definitionOf } from './prepare-org-target.ts';

export function createAgentsResolve(deps: OrgRuntimeDeps, plugin: OrgPluginWiring) {
  const hostRoster = () =>
    deps.agents.list(deps.orgId).map((agent) => ({
      id: agent.id,
      name: agent.name,
      parentId: agent.parentId,
    }));
  return {
    resolve: (id: string, parent?: AgentDefinition) => {
      const agent = deps.agents.findById(deps.orgId, id);
      if (agent) {
        return withDurableShellRules(deps, definitionOf(deps, agent));
      }
      return plugin.view.resolvePluginAgent(id, parent);
    },
    list: (parent?: AgentDefinition) => [...hostRoster(), ...plugin.view.roster(parent)],
  };
}

function withDurableShellRules(deps: OrgRuntimeDeps, def: AgentDefinition): AgentDefinition {
  const shellPatterns = deps.permissionRules?.shellPatterns(deps.orgId, def.id);
  return shellPatterns === undefined ? def : applyShellRulePatterns(def, shellPatterns);
}
