import { z } from 'zod';
import { EffectivePermissionSchema } from '../permissions/permissions.ts';

export interface InitializeParams {
  platform: number;
  host: { version: string; features: string[] };
  instance: { orgId: string; generation: number; dataDir: string; locale: string };
  permissions: Array<{ id: string; scope?: Record<string, unknown> }>;
  experimental: string[];
  deprecations: string[];
}

export interface InitializeResult {
  addon: { id: string; version: string };
  handlers: string[];
  deactivateTimeoutMs?: number;
}

export const InitializeParamsSchema = z.object({
  platform: z.number().int().positive(),
  host: z.object({
    version: z.string().min(1),
    features: z.array(z.string()),
  }),
  instance: z.object({
    orgId: z.string().min(1),
    generation: z.number().int().nonnegative(),
    dataDir: z.string().min(1),
    locale: z.string().min(1),
  }),
  permissions: z.array(EffectivePermissionSchema),
  experimental: z.array(z.string()),
  deprecations: z.array(z.string()),
});

export const InitializeResultSchema = z.object({
  addon: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  handlers: z.array(z.string()),
  deactivateTimeoutMs: z.number().int().positive().optional(),
});
