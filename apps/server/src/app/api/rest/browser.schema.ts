import { BrowserDefaultEngineSchema } from '@harnesys/contracts';
import { z } from 'zod';

export const BrowserInstallSchema = z.object({
  hostId: z.string().min(1),
  engine: z.string().min(1),
  stealth: z.boolean().default(false),
  version: z.string().min(1).optional(),
});
export type BrowserInstallBody = z.infer<typeof BrowserInstallSchema>;

export const BrowserToolInstallSchema = z.object({
  hostId: z.string().min(1),
  version: z.string().min(1).optional(),
});
export type BrowserToolInstallBody = z.infer<typeof BrowserToolInstallSchema>;

export const BrowserUpdateCheckSchema = z.object({
  hostId: z.string().min(1),
});
export type BrowserUpdateCheckBody = z.infer<typeof BrowserUpdateCheckSchema>;

export const BrowserSettingsSchema = z.object({
  defaultEngine: BrowserDefaultEngineSchema,
});
export type BrowserSettingsBody = z.infer<typeof BrowserSettingsSchema>;

export const BrowserAllowlistSchema = z.object({
  hostId: z.string().min(1),
  engineId: z.string().min(1),
});
export type BrowserAllowlistBody = z.infer<typeof BrowserAllowlistSchema>;

export const BrowserEngineStateSchema = z.object({
  hostId: z.string().min(1),
  enabled: z.boolean(),
});
export type BrowserEngineStateBody = z.infer<typeof BrowserEngineStateSchema>;

export const BrowserEngineRemoveQuerySchema = z.object({
  hostId: z.string().min(1),
});
export type BrowserEngineRemoveQuery = z.infer<typeof BrowserEngineRemoveQuerySchema>;

export const BrowserVersionsQuerySchema = z.object({
  hostId: z.string().min(1),
});
export type BrowserVersionsQuery = z.infer<typeof BrowserVersionsQuerySchema>;
