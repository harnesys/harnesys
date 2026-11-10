import type { JsonObject } from '@harnesys/sdk';
import type { z } from 'zod';
import type { EffectiveGrants } from './permissions.ts';

export type PermissionRef = string;

export interface RateSpec {
  perSec: number;
  burst: number;
}

export interface HostMethodLimits {
  rate?: RateSpec;
  timeoutMs?: number;
  maxResultKb?: number;
}

export interface HostCallContext {
  orgId: string;
  addonId: string;
  instanceId: string;
  generation: number;
  correlationId: string;
  grants: EffectiveGrants;
  now(): number;
  signal: AbortSignal;
}

export interface HostMethodSpec<P = unknown, R = unknown> {
  readonly name: string;
  readonly params: z.ZodType<P>;
  readonly result: z.ZodType<R>;
  readonly permission: PermissionRef | null;
  readonly limits?: HostMethodLimits;
  handle(ctx: HostCallContext, params: P): Promise<R>;
}

export interface HostServiceModule {
  readonly namespace: string;
  readonly methods: readonly HostMethodSpec[];
}

export interface HostServiceViolation {
  namespace: string;
  method: string;
  code: 'duplicate_method' | 'missing_schema' | 'unknown_permission';
}

export function coversGrant(
  grants: EffectiveGrants,
  permission: PermissionRef | null,
  scope?: JsonObject,
): boolean {
  if (permission === null) {
    return true;
  }
  const granted = grants.find((entry) => entry.id === permission);
  if (!granted) {
    return false;
  }
  if (!scope) {
    return true;
  }
  return coversScope(granted.scope, scope);
}

function coversScope(grantedScope: JsonObject | undefined, needed: JsonObject): boolean {
  if (!grantedScope) {
    return true;
  }
  return Object.keys(needed).every((key) => coversScopeValue(grantedScope[key], needed[key]));
}

function coversScopeValue(granted: unknown, needed: unknown): boolean {
  if (Array.isArray(granted) && Array.isArray(needed)) {
    const grantedSet = new Set(granted.map(String));
    return needed.map(String).every((entry) => grantedSet.has(entry));
  }
  return granted === needed;
}
