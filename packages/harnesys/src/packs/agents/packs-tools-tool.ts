import { PACK_PREFIX } from '../../application/capability-set.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

export function createPacksToolsTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('packs_tools', {
    group: 'agents',
    operations: ['agents'],
    sideEffect: 'read',
    description:
      'What each tool source actually grants: [{source: "pack:<name>" | "host" | "mcp:<server>", tools: [{name, description, sideEffect, operations, interactive}], enabled?, disabled?}]. ' +
      'Read it before composing packs for agents_create / agents_create_subagent: enabling a pack grants ALL tools it carries, so trim per task with the object assignment — ' +
      'packs: { files: { disabledTools: ["write_file"] } } removes single tools, ' +
      'packs: { files: { exposure: { edit_file: "deferred" } } } hides tools from the system prompt until load_tools reveals them. ' +
      "With agentId (default: you) the view is that agent's reality: per-pack overrides from its row are applied and trimmed tools are listed in disabled; enabled: false marks packs not granted to it (listed for reference, what enabling them would carry). " +
      'A smaller toolset is cheaper per step and harder to mis-click.',
    input: {
      type: 'object',
      properties: {
        pack: {
          type: 'string',
          description:
            'Optional filter: pack name ("files"), "host", or an exact source ("mcp:<server>").',
        },
        agentId: {
          type: 'string',
          description:
            "Optional agent id: apply that agent's real packs assignments (disabledTools/exposure trims, enabled marks, mcpServers). Defaults to the calling agent.",
        },
      },
    },
    execute: async (raw, execCtx) =>
      runGuard(async () => {
        const port = deps.agents;
        if (port.packInventory === undefined) {
          return { error: 'pack inventory is not available in this deployment' };
        }
        const rec = (raw ?? {}) as { pack?: string; agentId?: string };
        const scope = scopeFor(deps, execCtx);
        const target =
          rec.agentId !== undefined && rec.agentId !== scope.agentId
            ? { ...scope, agentId: rec.agentId }
            : scope;
        const groups = await port.packInventory(target);
        const filtered =
          rec.pack === undefined
            ? groups
            : groups.filter(
                (g) => g.source === rec.pack || g.source === `${PACK_PREFIX}${rec.pack}`,
              );
        return {
          sources: filtered,
          totals: {
            sources: filtered.length,
            tools: filtered.reduce((sum, g) => sum + g.tools.length, 0),
          },
        };
      }),
  });
}
