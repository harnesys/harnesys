import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { ToolDefinition } from '../ports/tools.ts';
import { resolveToolAlias } from './tool-aliases.ts';

const ajv2020 = new Ajv2020({ strict: false, allErrors: true });
const ajvDraft07 = new Ajv({ strict: false, allErrors: true });

function ajvOf(schema: unknown): typeof ajvDraft07 {
  const dialect = (schema as { $schema?: string } | null)?.$schema ?? '';
  return dialect.includes('2020-12') ? ajv2020 : ajvDraft07;
}
export function createToolRegistry(tools: ToolDefinition[] = []): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) {
    if (map.has(t.name)) {
      throw new Error(`tool collision: ${t.name}`);
    }
    map.set(t.name, t);
  }
  return map;
}
export function mergeTools(
  base: Map<string, ToolDefinition>,
  extra: ToolDefinition[],
): Map<string, ToolDefinition> {
  const merged = new Map(base);
  for (const t of extra) {
    if (merged.has(t.name)) {
      throw new Error(`tool collision: ${t.name}`);
    }
    merged.set(t.name, t);
  }
  return merged;
}
export function subtractDeniedTools(
  registry: Map<string, ToolDefinition>,
  agent: {
    mcpServers?: string[];
    disallowedTools?: string[];
  },
): Map<string, ToolDefinition> {
  const blocked = new Set((agent.disallowedTools ?? []).map(resolveToolAlias));
  const allowedServers = new Set(agent.mcpServers ?? []);
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowedServers.has(def.group)) {
      continue;
    }
    if (blocked.has(name)) {
      continue;
    }
    out.set(name, def);
  }
  return out;
}
export function validateToolInput(
  schema: unknown,
  data: unknown,
): {
  ok: boolean;
  errors?: string;
} {
  const ajv = ajvOf(schema);
  const valid = ajv.validate(schema as never, data);
  if (valid) {
    return { ok: true };
  }
  return { ok: false, errors: ajv.errorsText(ajv.errors) };
}
