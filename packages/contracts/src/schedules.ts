import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';
import { ThreadPublicSchema } from './thread.ts';

export const ScheduleStatusSchema = z.enum(['active', 'paused', 'failed']);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

export const ScheduleHistorySchema = z.enum(['none', 'last', 'all']);
export type ScheduleHistory = z.infer<typeof ScheduleHistorySchema>;

export const ScheduleMissPolicySchema = z.enum(['catch-up', 'skip', 'escalate']);
export type ScheduleMissPolicy = z.infer<typeof ScheduleMissPolicySchema>;

export const SchedulePublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  status: ScheduleStatusSchema,
  targetAgentId: z.string().uuid(),
  detail: z.string(),
  cron: z.string().min(1),
  modeId: z.string().min(1).max(48),
  history: ScheduleHistorySchema,
  historyLast: z.number().int().min(1).max(99),
  missPolicy: ScheduleMissPolicySchema,
  threadId: z.string().uuid(),
  nextRunAt: z.string().nullable(),
  lastFiredAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type SchedulePublic = z.infer<typeof SchedulePublicSchema>;

export const CreateScheduleBodySchema = z.object({
  name: z.string().trim().min(1),
  targetAgentId: z.string().uuid(),
  detail: z.string().trim().optional(),
  cron: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).max(48).optional(),
  history: ScheduleHistorySchema.optional(),
  historyLast: z.number().int().min(1).max(99).optional(),
  missPolicy: ScheduleMissPolicySchema.optional(),
  threadId: z.string().uuid().optional(),
});
export type CreateScheduleBody = z.infer<typeof CreateScheduleBodySchema>;

export const UpdateScheduleBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: ScheduleStatusSchema.optional(),
  targetAgentId: z.string().uuid().optional(),
  detail: z.string().trim().optional(),
  cron: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).max(48).optional(),
  history: ScheduleHistorySchema.optional(),
  historyLast: z.number().int().min(1).max(99).optional(),
  missPolicy: ScheduleMissPolicySchema.optional(),
  threadId: z.string().uuid().optional(),
});
export type UpdateScheduleBody = z.infer<typeof UpdateScheduleBodySchema>;

export const ListSchedulesResponseSchema = z.object({
  items: z.array(SchedulePublicSchema),
});
export type ListSchedulesResponse = z.infer<typeof ListSchedulesResponseSchema>;

export const CreateScheduleResponseSchema = z.object({
  schedule: SchedulePublicSchema,
  thread: ThreadPublicSchema,
});
export type CreateScheduleResponse = z.infer<typeof CreateScheduleResponseSchema>;
