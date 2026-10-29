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

export const OrgSettingsSchema = z.object({
  skillsSourceAutoLoad: z.boolean().default(true),
  timezone: z.string().refine(isIanaTimeZone, { message: 'unknown timezone' }).default('UTC'),
  browser: z
    .object({
      defaultEngine: BrowserDefaultEngineSchema.default('auto'),
    })
    .default({ defaultEngine: 'auto' }),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export const OrgSettingsPatchSchema = OrgSettingsSchema.partial();
export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatchSchema>;
