import { z } from 'zod';

export const JsonObjectSchema = z.record(z.string(), z.unknown());
export type JsonObject = Record<string, unknown>;

export const PermissionScopeSchema = JsonObjectSchema;
export type PermissionScope = JsonObject;

export interface PermissionRequest {
  id: string;
  scope?: JsonObject;
  reason: string;
  optional?: boolean;
}

export const PermissionRequestSchema = z.object({
  id: z.string().min(1),
  scope: PermissionScopeSchema.optional(),
  reason: z.string().min(1),
  optional: z.boolean().optional(),
});

export interface EffectivePermission {
  id: string;
  scope?: JsonObject;
}

export const EffectivePermissionSchema = z.object({
  id: z.string().min(1),
  scope: PermissionScopeSchema.optional(),
});

export const BASELINE_PERMISSION_IDS = [
  'config.read',
  'log',
  'db',
  'secrets.own',
  'events.emit.own',
] as const;

export type BaselinePermissionId = (typeof BASELINE_PERMISSION_IDS)[number];

export const KNOWN_PERMISSION_IDS = [
  ...BASELINE_PERMISSION_IDS,
  'http.fetch',
  'accounts.use',
  'accounts.credentials',
  'runs.dispatch',
  'threads.create',
  'events.subscribe',
  'bridge.inbound',
  'routes.public',
  'lifecycle.resident',
  'trigger',
  'worker',
  'source',
] as const;

export type KnownPermissionId = (typeof KNOWN_PERMISSION_IDS)[number];

export function isKnownPermissionId(id: string): boolean {
  return (KNOWN_PERMISSION_IDS as readonly string[]).includes(id);
}

export function isBaselinePermissionId(id: string): boolean {
  return (BASELINE_PERMISSION_IDS as readonly string[]).includes(id);
}
