import { z } from 'zod';

export const HOOK_SCHEMA_VERSION = 1;

export interface HookDescriptor {
  id: string;
  on: { event: string } | { providerEvent: { connection: string; types?: string[] } };
}

export const HookOnSchema = z.union([
  z.object({ event: z.string().min(1) }),
  z.object({
    providerEvent: z.object({
      connection: z.string().min(1),
      types: z.array(z.string().min(1)).optional(),
    }),
  }),
]);

export const HookDescriptorSchema = z.object({
  id: z.string().min(1),
  on: HookOnSchema,
});

export const hookFamily = {
  family: 'hook',
  versions: [HOOK_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== HOOK_SCHEMA_VERSION) {
      throw new Error(`hook descriptor schema version ${v} is not supported`);
    }
    return HookDescriptorSchema;
  },
};
