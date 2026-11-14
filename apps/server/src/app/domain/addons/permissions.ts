import type { EffectivePermission, JsonObject, L10n, PermissionRequest } from '@harnesys/sdk';
import { z } from 'zod';

export type PermissionRisk = 'low' | 'medium' | 'high';

export interface PermissionDefinition {
  readonly id: string;
  readonly risk: PermissionRisk;
  readonly baseline?: boolean;
  readonly scope?: z.ZodType;
  covers(granted: JsonObject | undefined, needed: JsonObject | undefined): boolean;
  describe(scope?: JsonObject): L10n;
}

export interface GrantEntry {
  id: string;
  scope?: JsonObject;
}

export interface GrantRecord {
  addonId: string;
  version: string;
  declaredDigest: string;
  grants: GrantEntry[];
  grantedAt: string;
  grantedBy: string;
}

export type EffectiveGrants = EffectivePermission[];

export interface AddonOrgPolicy {
  forbiddenPermissions?: readonly string[];
  forbiddenHosts?: readonly string[];
}

export interface AddonHostPolicy {
  forbiddenPermissions?: readonly string[];
  forbiddenHosts?: readonly string[];
  allowedSources?: readonly string[];
  allowUnsandboxedExternal?: boolean;
}

export interface ComputePermissionsInput {
  declaration: readonly PermissionRequest[];
  grant: GrantRecord | null;
  orgPolicy?: AddonOrgPolicy;
  hostPolicy?: AddonHostPolicy;
  definitions?: readonly PermissionDefinition[];
}

const SCOPE_ARRAY_KEYS = ['hosts', 'connections', 'patterns'] as const;

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function scopeIsSubset(
  narrow: JsonObject | undefined,
  broad: JsonObject | undefined,
): boolean {
  if (narrow === undefined) {
    return broad === undefined;
  }
  if (broad === undefined) {
    return true;
  }
  for (const key of Object.keys(narrow)) {
    const narrowValue = narrow[key];
    const broadValue = broad[key];
    const narrowList = stringArray(narrowValue);
    const broadList = stringArray(broadValue);
    if (narrowList && broadList) {
      const broadSet = new Set(broadList);
      if (!narrowList.every((entry) => broadSet.has(entry))) {
        return false;
      }
      continue;
    }
    if (JSON.stringify(narrowValue) !== JSON.stringify(broadValue)) {
      return false;
    }
  }
  return true;
}

function narrowScopeArrays(
  scope: JsonObject | undefined,
  forbidden: readonly string[],
): JsonObject | undefined {
  if (scope === undefined || forbidden.length === 0) {
    return scope;
  }
  const narrowed: JsonObject = { ...scope };
  let touched = false;
  for (const key of SCOPE_ARRAY_KEYS) {
    const list = stringArray(scope[key]);
    if (!list) {
      continue;
    }
    const kept = list.filter((entry) => !forbidden.includes(entry));
    if (kept.length !== list.length) {
      narrowed[key] = kept;
      touched = true;
    }
  }
  return touched ? narrowed : scope;
}

/**
 * Intersects already-granted permissions with the host policy (§7.3): drops
 * forbidden permission ids, narrows forbidden hosts out of scopes, and drops
 * grants whose host scope becomes empty. Used at the dispatch point so policy
 * changes apply to running add-ons immediately.
 */
export function applyHostPolicyToGrants(
  grants: EffectiveGrants,
  policy: AddonHostPolicy,
): EffectiveGrants {
  const forbiddenPermissions = policy.forbiddenPermissions ?? [];
  const forbiddenHosts = policy.forbiddenHosts ?? [];
  const result: EffectiveGrants = [];
  for (const grant of grants) {
    if (forbiddenPermissions.includes(grant.id)) {
      continue;
    }
    if (forbiddenHosts.length === 0) {
      result.push(grant);
      continue;
    }
    const narrowed = narrowScopeArrays(grant.scope, forbiddenHosts);
    if (narrowed !== undefined && stringArray(narrowed.hosts)?.length === 0) {
      continue;
    }
    result.push(narrowed === grant.scope ? grant : { ...grant, scope: narrowed });
  }
  return result;
}

function scopeFromGrant(
  declaration: JsonObject | undefined,
  granted: JsonObject | undefined,
  definitions: ReadonlyMap<string, PermissionDefinition>,
  id: string,
): JsonObject | undefined | null {
  if (granted === undefined) {
    return declaration;
  }
  const definition = definitions.get(id);
  if (definition) {
    return definition.covers(granted, declaration) ? declaration : null;
  }
  return scopeIsSubset(declaration, granted) ? declaration : null;
}

interface PolicyTerms {
  forbiddenIds: readonly string[];
  forbiddenHosts: readonly string[];
}

function policyTerms(input: ComputePermissionsInput): PolicyTerms {
  return {
    forbiddenIds: [
      ...(input.orgPolicy?.forbiddenPermissions ?? []),
      ...(input.hostPolicy?.forbiddenPermissions ?? []),
    ],
    forbiddenHosts: [
      ...(input.orgPolicy?.forbiddenHosts ?? []),
      ...(input.hostPolicy?.forbiddenHosts ?? []),
    ],
  };
}

function resolveDeclared(
  declared: PermissionRequest,
  grantIndex: ReadonlyMap<string, GrantEntry>,
  terms: PolicyTerms,
  definitions: ReadonlyMap<string, PermissionDefinition>,
): EffectivePermission | null {
  if (terms.forbiddenIds.includes(declared.id)) {
    return null;
  }
  const granted = grantIndex.get(declared.id);
  if (!granted) {
    return null;
  }
  const scope = scopeFromGrant(declared.scope, granted.scope, definitions, declared.id);
  if (scope === null) {
    return null;
  }
  const narrowed = narrowScopeArrays(scope, terms.forbiddenHosts);
  if (narrowed && stringArray(narrowed.hosts)?.length === 0) {
    return null;
  }
  return narrowed === undefined ? { id: declared.id } : { id: declared.id, scope: narrowed };
}

export function computeEffectivePermissions(input: ComputePermissionsInput): EffectiveGrants {
  const { declaration, grant } = input;
  const definitions = new Map(
    (input.definitions ?? []).map((definition) => [definition.id, definition]),
  );
  const terms = policyTerms(input);
  const grantIndex = new Map((grant?.grants ?? []).map((entry) => [entry.id, entry]));
  const declared = declaration
    .map((entry) => resolveDeclared(entry, grantIndex, terms, definitions))
    .filter((entry): entry is EffectivePermission => entry !== null);
  const baseline = (input.definitions ?? [])
    .filter((definition) => definition.baseline && !terms.forbiddenIds.includes(definition.id))
    .map((definition): EffectivePermission => ({ id: definition.id }));
  return [...declared, ...baseline];
}

function canonicalizeScope(scope: JsonObject): JsonObject {
  const sorted: JsonObject = {};
  for (const key of Object.keys(scope).sort()) {
    const value = scope[key];
    const list = stringArray(value);
    sorted[key] = list ? [...list].sort() : value;
  }
  return sorted;
}

export function canonicalDeclaration(declaration: readonly PermissionRequest[]): string {
  const canonical = [...declaration]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => ({
      id: entry.id,
      ...(entry.scope ? { scope: canonicalizeScope(entry.scope) } : {}),
    }));
  return JSON.stringify(canonical);
}

export function grantDigest(declaration: readonly PermissionRequest[]): string {
  return Bun.CryptoHasher.hash('sha256', canonicalDeclaration(declaration)).toString('hex');
}

export interface GrantDiffEntry {
  id: string;
  scope?: JsonObject;
  reason?: string;
  optional?: boolean;
}

export interface GrantDiff {
  unchanged: GrantDiffEntry[];
  added: GrantDiffEntry[];
  removed: GrantDiffEntry[];
}

export function grantDiff(
  previous: readonly PermissionRequest[],
  next: readonly PermissionRequest[],
): GrantDiff {
  const prevIndex = new Map(previous.map((entry) => [entry.id, entry]));
  const diff: GrantDiff = { unchanged: [], added: [], removed: [] };
  for (const entry of next) {
    const prev = prevIndex.get(entry.id);
    if (prev && scopeIsSubset(entry.scope, prev.scope)) {
      diff.unchanged.push(entry);
      continue;
    }
    diff.added.push(entry);
  }
  const nextIds = new Set(next.map((entry) => entry.id));
  for (const entry of previous) {
    if (!nextIds.has(entry.id)) {
      diff.removed.push(entry);
    }
  }
  return diff;
}

export function needsConsent(diff: GrantDiff): boolean {
  return diff.added.length > 0;
}

export function grantInherits(
  diff: GrantDiff,
  previousDigest: string,
  nextDigest: string,
): boolean {
  return !needsConsent(diff) && previousDigest === nextDigest;
}
