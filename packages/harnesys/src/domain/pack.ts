import type { MemoryPolicy } from '@harnesys/contracts';
import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';
import type { JsonSchema } from './json-schema.ts';
export interface CapabilityScope {
  orgId: string;
  agentId: string;
  agentName?: string;
  sourceIds: string[];
  threadId: string;
}
export interface PackSkill {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
}
export interface PackToolMeta {
  name: string;
  description: string;
}
export interface PackMeta {
  tools: PackToolMeta[];
  skills: string[];
  hasSettings: boolean;
}
export interface PackConfig {
  spec?: Record<string, unknown>;
}
export interface PackOverride {
  spec?: Record<string, unknown>;
  disabledTools?: string[];
  exposure?: Record<string, ToolExposure>;
}
export type PackAssignment = boolean | PackConfig | PackOverride;
export type PackName = string;
export type AgentPacks = Record<PackName, PackAssignment>;
export type PackValueIssueCode =
  | 'packs_value'
  | 'packs_spec'
  | 'packs_disabled_tools'
  | 'packs_exposure';
export interface PackValueIssue {
  code: PackValueIssueCode;

  field: string;

  requirement: string;
}
export interface PackValueCheck {
  allowNull?: boolean;
}
const PACK_OVERRIDE_KEYS: readonly string[] = ['spec', 'disabledTools', 'exposure'];
const PACK_EXPOSURES: readonly ToolExposure[] = ['direct', 'deferred'];
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function valueRequirement(allowNull: boolean): string {
  return allowNull
    ? 'must be true, false, null, or { spec?, disabledTools?, exposure? }'
    : 'must be true, false, or { spec?, disabledTools?, exposure? }';
}
function valueIssue(allowNull: boolean): PackValueIssue {
  return { code: 'packs_value', field: '', requirement: valueRequirement(allowNull) };
}
function unknownKeyIssue(): PackValueIssue {
  return {
    code: 'packs_value',
    field: '',
    requirement: 'may only have "spec", "disabledTools", or "exposure" properties',
  };
}
function isExposureMap(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => PACK_EXPOSURES.includes(entry as ToolExposure));
}
function overrideIssues(rec: Record<string, unknown>): PackValueIssue[] {
  const issues: PackValueIssue[] = [];
  if (rec.spec !== undefined && !isPlainObject(rec.spec)) {
    issues.push({ code: 'packs_spec', field: 'spec', requirement: 'must be an object' });
  }
  const disabledTools = rec.disabledTools;
  if (
    disabledTools !== undefined &&
    (!Array.isArray(disabledTools) || !disabledTools.every((tool) => typeof tool === 'string'))
  ) {
    issues.push({
      code: 'packs_disabled_tools',
      field: 'disabledTools',
      requirement: 'must be an array of strings',
    });
  }
  if (rec.exposure !== undefined && !isExposureMap(rec.exposure)) {
    issues.push({
      code: 'packs_exposure',
      field: 'exposure',
      requirement: 'must be an object of tool name to "direct" | "deferred"',
    });
  }
  return issues;
}
export function packValueIssues(value: unknown, check?: PackValueCheck): PackValueIssue[] {
  const allowNull = check?.allowNull === true;
  if (value === null) {
    return allowNull ? [] : [valueIssue(false)];
  }
  if (typeof value === 'boolean') {
    return [];
  }
  if (!isPlainObject(value)) {
    return [valueIssue(allowNull)];
  }
  const unknownKey = Object.keys(value).find((key) => !PACK_OVERRIDE_KEYS.includes(key));
  if (unknownKey !== undefined) {
    return [unknownKeyIssue()];
  }
  return overrideIssues(value);
}
export function packsShapeError(packs: unknown): string | null {
  if (!isPlainObject(packs)) {
    return 'packs must be an object';
  }
  for (const [name, value] of Object.entries(packs)) {
    const issue = packValueIssues(value, { allowNull: true })[0];
    if (issue !== undefined) {
      const path = issue.field === '' ? `packs.${name}` : `packs.${name}.${issue.field}`;
      return `${path} ${issue.requirement}`;
    }
  }
  return null;
}
export interface PackCtx<Ports, Spec> {
  ports: Ports;
  spec: Spec;
  scope: CapabilityScope;
  policy?: MemoryPolicy;
}
export interface Pack<Ports = Record<string, never>, Spec = Record<string, unknown>> {
  name: string;
  version: string;
  description: string;
  icon?: string;
  specSchema?: JsonSchema;
  meta: PackMeta;
  create: (ctx: PackCtx<Ports, Spec>) => {
    tools?: ToolDefinition[];
    skills?: PackSkill[];
    notes?: LlmNoteProvider | LlmNoteProvider[];
  };
}
export interface PackRegistration<Ports = Record<string, unknown>> {
  pack: Pack<Ports, Record<string, unknown>>;
  ports?: Ports;
  resolveScope?: () => CapabilityScope;
}
export function definePack<Ports, Spec>(pack: Pack<Ports, Spec>): Pack<Ports, Spec> {
  if (!pack.name || !pack.version || !pack.description) {
    throw new Error('pack requires name, version, description');
  }
  if (!pack.meta) {
    throw new Error(`pack "${pack.name}" requires meta for the catalog endpoint`);
  }
  return pack;
}
export function registerPack<Ports>(
  pack: Pack<Ports, Record<string, unknown>>,
  opts?: {
    ports?: Ports;
    resolveScope?: () => CapabilityScope;
  },
): PackRegistration<Ports> {
  return { pack, ports: opts?.ports, resolveScope: opts?.resolveScope };
}
export function normalizePackAssignment(value: PackAssignment): PackOverride {
  if (typeof value === 'boolean') {
    return {};
  }
  return value;
}
