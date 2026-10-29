import { MAX_BATCH } from '../../constants.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { resolveToolAlias } from '../tool-aliases.ts';

export interface LoadToolsOpts {
  discover?: (name: string) => ToolDefinition | undefined;
}

export function createLoadToolsTool(
  registry: Map<string, ToolDefinition>,
  opts: LoadToolsOpts = {},
): ToolDefinition {
  const discover = opts.discover;
  return tool('load_tools', {
    description:
      'Load tool schemas by exact name. Deferred tools (e.g. browser, web search) are not listed in this session until loaded: call load_tools with their names, then call them normally.',
    sideEffect: 'read',
    revealsTools: true,
    input: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, maxItems: MAX_BATCH },
      },
      required: ['names'],
    },
    execute(input) {
      const parsed = input as {
        names: string[];
      };
      const loaded: string[] = [];
      const unknown: string[] = [];
      const tools: {
        name: string;
        description: string;
        input: unknown;
      }[] = [];
      for (const name of parsed.names ?? []) {
        const alias = resolveToolAlias(name);
        let def = registry.get(name) ?? registry.get(alias);
        if (def === undefined && discover !== undefined) {
          def = discover(name) ?? discover(alias);
          if (def !== undefined) {
            registry.set(def.name, def);
          }
        }
        if (!def) {
          unknown.push(name);
          continue;
        }
        loaded.push(def.name);
        tools.push({ name: def.name, description: def.description, input: def.input });
      }
      return { loaded, unknown, tools };
    },
  });
}
