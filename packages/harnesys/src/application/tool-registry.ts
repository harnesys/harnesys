import type { ErrorObject } from 'ajv';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { ToolDefinition } from '../ports/tools.ts';
import { resolveToolAlias } from './tool-aliases.ts';

const ajv2020 = new Ajv2020({ strict: false, allErrors: true });
const ajvDraft07 = new Ajv({ strict: false, allErrors: true });
const MAX_ERROR_LINES = 12;
const MAX_ARMS = 6;

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
  return { ok: false, errors: formatAjvErrors(ajv.errors ?? []).join('; ') };
}
export function formatAjvErrors(errors: readonly ErrorObject[]): string[] {
  const consumed = new Set<ErrorObject>();
  const collapsed = new Map<ErrorObject, string>();
  for (const error of errors) {
    if (!isCombinator(error)) {
      continue;
    }
    const arms = collectArms(error, errors, consumed);
    if (arms.length === 0) {
      continue;
    }
    const shown = arms.map((arm) => armSummary(arm, error.instancePath));
    const visible = shown.slice(0, MAX_ARMS);
    const more = shown.length > visible.length ? `, +${shown.length - visible.length} more` : '';
    collapsed.set(error, `expected one of: ${visible.join(', ')}${more} — at ${pathOf(error)}`);
  }
  const lines: string[] = [];
  for (const error of errors) {
    if (consumed.has(error)) {
      continue;
    }
    lines.push(
      collapsed.get(error) ??
        `${error.message ?? 'failed a schema constraint'} — at ${pathOf(error)}`,
    );
  }
  if (lines.length <= MAX_ERROR_LINES) {
    return lines;
  }
  return [...lines.slice(0, MAX_ERROR_LINES), `+${lines.length - MAX_ERROR_LINES} more`];
}
function isCombinator(error: ErrorObject): boolean {
  return error.keyword === 'oneOf' || error.keyword === 'anyOf';
}
function collectArms(
  parent: ErrorObject,
  flat: readonly ErrorObject[],
  consumed: Set<ErrorObject>,
): ErrorObject[][] {
  const raw: unknown = (parent as { errors?: unknown }).errors;
  const attached = Array.isArray(raw)
    ? raw
        .filter((arm): arm is ErrorObject[] => Array.isArray(arm))
        .map((arm) => arm as ErrorObject[])
    : [];
  if (attached.length > 0) {
    for (const arm of attached) {
      for (const error of arm) {
        consumed.add(error);
      }
    }
    return attached;
  }
  const prefix = `${parent.schemaPath}/`;
  const byArm = new Map<string, ErrorObject[]>();
  for (const error of flat) {
    const schemaPath: unknown = (error as { schemaPath?: unknown }).schemaPath;
    if (error === parent || typeof schemaPath !== 'string' || !schemaPath.startsWith(prefix)) {
      continue;
    }
    if (!withinPath(parent.instancePath, error.instancePath)) {
      continue;
    }
    const arm = schemaPath.slice(prefix.length).split('/')[0] ?? '';
    const bucket = byArm.get(arm) ?? [];
    bucket.push(error);
    byArm.set(arm, bucket);
    consumed.add(error);
  }
  return [...byArm.values()];
}
function withinPath(parent: string, child: string): boolean {
  return parent === '' || child === parent || child.startsWith(`${parent}/`);
}
function armSummary(arm: readonly ErrorObject[], rootPath: string): string {
  const missing = arm
    .filter((error) => error.keyword === 'required' && error.instancePath === rootPath)
    .map((error) => missingProperty(error))
    .filter((name): name is string => name !== undefined);
  if (missing.length > 0) {
    return `requires ${missing.join(', ')}`;
  }
  const first = arm.find((error) => error.instancePath === rootPath) ?? arm[0];
  return first?.message ?? 'does not match';
}
function missingProperty(error: ErrorObject): string | undefined {
  const params = error.params as { missingProperty?: unknown };
  return typeof params.missingProperty === 'string' ? params.missingProperty : undefined;
}
function pathOf(error: ErrorObject): string {
  return error.instancePath === '' ? '(root)' : error.instancePath;
}
