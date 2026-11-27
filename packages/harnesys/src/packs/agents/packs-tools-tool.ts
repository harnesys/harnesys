import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';

export function createPacksToolsTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('packs_tools', {
    group: 'agents',
    operations: ['agents'],
    sideEffect: 'read',
    description:
      'What each tool source actually grants: [{source: "pack:<name>" | "host" | "mcp:<server>", tools: [{name, description, sideEffect, operations, interactive}]}]. ' +
      'Read it before composing packs for agents_create / agents_create_subagent: enabling a pack grants ALL tools it carries, so trim per task with the object assignment — ' +
      'packs: { files: { disabledTools: ["write_file"] } } removes single tools, ' +
      'packs: { files: { exposure: { edit_file: "deferred" } } } hides tools from the system prompt until load_tools reveals them. ' +
      'A smaller toolset is cheaper per step and harder to mis-click.',
    input: {
      type: 'object',
      properties: {
        pack: {
          type: 'string',
          description:
            'Optional filter: pack name ("files"), "host", or an exact source ("mcp:<server>").',
        },
      },
    },
    execute: async (raw) =>
      runGuard(async () => {
        const port = deps.agents;
        if (port.packInventory === undefined) {
          return { error: 'pack inventory is not available in this deployment' };
        }
        const groups = await port.packInventory();
        const pack = (raw as { pack?: string }).pack;
        const filtered =
          pack === undefined
            ? groups
            : groups.filter((g) => g.source === pack || g.source === `pack:${pack}`);
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
