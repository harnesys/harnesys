import { JsonValueSchema, UpsertWidgetBodySchema } from '@harnesys/contracts';
import { z } from 'zod';

export const DashboardDraftQuerySchema = z.object({
  draft: z.enum(['true', 'false']).optional(),
});
export type DashboardDraftQuery = z.infer<typeof DashboardDraftQuerySchema>;

export const UpsertWidgetControllerBodySchema = UpsertWidgetBodySchema.extend({
  createdByAgent: z.boolean().optional(),
});
export type UpsertWidgetControllerBody = z.infer<typeof UpsertWidgetControllerBodySchema>;

export const UpdateWidgetControllerBodySchema = UpsertWidgetBodySchema.partial().extend({
  baseUpdatedAt: z.string().min(1).optional(),
});
export type UpdateWidgetControllerBody = z.infer<typeof UpdateWidgetControllerBodySchema>;

export const PutWidgetStateBodySchema = z.object({
  state: z.record(z.string().min(1).max(64), JsonValueSchema),
});
export type PutWidgetStateBody = z.infer<typeof PutWidgetStateBodySchema>;
