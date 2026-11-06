import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const AutomationStatusSchema = z.enum(['active', 'paused', 'failed']);
export type AutomationStatus = z.infer<typeof AutomationStatusSchema>;

export const AutomationConnectionSchema = z.object({
  required: z.boolean(),
  connected: z.boolean(),
  label: z.string().optional(),
  detail: z.string().optional(),
});
export type AutomationConnection = z.infer<typeof AutomationConnectionSchema>;

export const AutomationItemSchema = z.object({
  id: z.string().min(1),
  orgId: OrgIdSchema,
  integrationId: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  status: AutomationStatusSchema,
  threadId: z.string().uuid().nullable().default(null),
  targetAgentId: z.string().uuid().nullable().default(null),
  connection: AutomationConnectionSchema,
  meta: z.record(z.string(), z.string()).default({}),
  availableAt: z.string().nullable().default(null),
  updatedAt: z.string().min(1),
});
export type AutomationItem = z.infer<typeof AutomationItemSchema>;

export const ListAutomationsResponseSchema = z.object({
  items: z.array(AutomationItemSchema),
});
export type ListAutomationsResponse = z.infer<typeof ListAutomationsResponseSchema>;

export const AutomationKindSchema = z.object({
  kind: z.string().min(1),
  integrationId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default('zap'),
  requiresConnection: z.boolean().default(false),
  connected: z.boolean().default(true),
});
export type AutomationKind = z.infer<typeof AutomationKindSchema>;

export const ListAutomationKindsResponseSchema = z.object({
  items: z.array(AutomationKindSchema),
});
export type ListAutomationKindsResponse = z.infer<typeof ListAutomationKindsResponseSchema>;
