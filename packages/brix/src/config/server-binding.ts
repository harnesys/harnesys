import { z } from 'zod';

export const ServerBindingSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(47474),
  api: z
    .object({
      prefix: z.string().default('api'),
      version: z
        .string()
        .nullable()
        .optional()
        .transform((value) => value || undefined),
    })
    .prefault({}),
});

export type ServerBinding = z.infer<typeof ServerBindingSchema>;
