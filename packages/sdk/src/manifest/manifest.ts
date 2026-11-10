import { z } from 'zod';
import type { PermissionRequest } from '../permissions/permissions.ts';
import { PermissionRequestSchema } from '../permissions/permissions.ts';
import { type ConnectionRequirement, ConnectionRequirementSchema } from './connections.ts';
import { type L10n, L10nSchema } from './l10n.ts';

export type { ConnectionRequirement, L10n, PermissionRequest };

export interface AddonRuntimeSpec {
  entry: string;
  profile: 'trusted' | 'restricted';
}

export interface AddonDataSpec {
  migrations: string;
  quotaMb?: number;
}

export interface Contribution {
  id: string;
  family: string;
  v?: number;
  optional?: boolean;
  descriptor: Record<string, unknown>;
}

export interface AddonManifest {
  id: string;
  version: string;
  platform: number;
  title: L10n;
  description: L10n;
  icon?: string;
  homepage?: string;
  license?: string;
  runtime: AddonRuntimeSpec;
  activation: 'lazy' | 'resident';
  permissions: PermissionRequest[];
  connections: ConnectionRequirement[];
  data?: AddonDataSpec;
  features?: string[];
  contributions: Contribution[];
}

export const AddonIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, 'addon id must be <publisher>.<name>');

export const ContributionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const AddonRuntimeSpecSchema = z.object({
  entry: z.string().min(1),
  profile: z.enum(['trusted', 'restricted']),
});

export const AddonDataSpecSchema = z.object({
  migrations: z.string().min(1),
  quotaMb: z.number().int().positive().optional(),
});

export const ContributionSchema = z.object({
  id: ContributionIdSchema,
  family: z.string().min(1),
  v: z.number().int().positive().optional(),
  optional: z.boolean().optional(),
  descriptor: z.record(z.string(), z.unknown()),
});

export const AddonManifestSchema = z.object({
  id: AddonIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver'),
  platform: z.number().int().positive(),
  title: L10nSchema,
  description: L10nSchema,
  icon: z.string().optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  runtime: AddonRuntimeSpecSchema,
  activation: z.enum(['lazy', 'resident']),
  permissions: z.array(PermissionRequestSchema),
  connections: z.array(ConnectionRequirementSchema),
  data: AddonDataSpecSchema.optional(),
  features: z.array(z.string()).optional(),
  contributions: z.array(ContributionSchema),
});

export function parseAddonManifest(raw: unknown): AddonManifest {
  return AddonManifestSchema.parse(raw);
}
