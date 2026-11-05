import { z } from 'zod';

export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ENGINE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const BrowserDefaultEngineSchema = z.union([
  z.literal('auto'),
  z.string().regex(ENGINE_ID_PATTERN, { message: 'invalid engine id' }),
]);
export type BrowserDefaultEngine = z.infer<typeof BrowserDefaultEngineSchema>;

export const ToolchainModeSchema = z.enum(['auto', 'custom']);
export type ToolchainMode = z.infer<typeof ToolchainModeSchema>;

export const ToolchainSettingsSchema = z.object({
  mode: ToolchainModeSchema.default('auto'),
  shell: z.string().default('auto'),
  node: z.string().default('auto'),
  extraPathDirs: z.array(z.string()).default([]),
  commandOverrides: z.record(z.string(), z.string()).default({}),
});
export type ToolchainSettings = z.infer<typeof ToolchainSettingsSchema>;

export const LIVE_FLUSH_MS_MIN = 50;
export const LIVE_FLUSH_MS_MAX = 2000;
export const LIVE_FLUSH_MS_DEFAULT = 100;
export const JOURNAL_BATCH_MIN = 1;
export const JOURNAL_BATCH_MAX = 64;
export const JOURNAL_BATCH_DEFAULT = 16;

export const DeliverySettingsSchema = z.object({
  liveFlushMs: z
    .number()
    .int()
    .min(LIVE_FLUSH_MS_MIN)
    .max(LIVE_FLUSH_MS_MAX)
    .default(LIVE_FLUSH_MS_DEFAULT),
  journalBatch: z
    .number()
    .int()
    .min(JOURNAL_BATCH_MIN)
    .max(JOURNAL_BATCH_MAX)
    .default(JOURNAL_BATCH_DEFAULT),
});
export type DeliverySettings = z.infer<typeof DeliverySettingsSchema>;

export const DELIVERY_DEFAULTS: DeliverySettings = DeliverySettingsSchema.parse({});

export const OrgSettingsSchema = z.object({
  skillsSourceAutoLoad: z.boolean().default(true),
  timezone: z.string().refine(isIanaTimeZone, { message: 'unknown timezone' }).default('UTC'),
  browser: z
    .object({
      defaultEngine: BrowserDefaultEngineSchema.default('auto'),
    })
    .default({ defaultEngine: 'auto' }),
  toolchain: ToolchainSettingsSchema.default({
    mode: 'auto',
    shell: 'auto',
    node: 'auto',
    extraPathDirs: [],
    commandOverrides: {},
  }),
  delivery: DeliverySettingsSchema.default(DELIVERY_DEFAULTS),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export const OrgSettingsPatchSchema = OrgSettingsSchema.partial();
export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatchSchema>;
