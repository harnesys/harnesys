import { z } from 'zod';
import { ExecutionProfileIdSchema } from './execution-profile.ts';

export const StatusCategorySchema = z.enum(['backlog', 'started', 'finished', 'cancelled']);
export type StatusCategory = z.infer<typeof StatusCategorySchema>;

export const BoardStatusKeySchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,38}$/);

export const BoardStatusSchema = z.object({
  key: BoardStatusKeySchema,
  label: z.string().trim().min(1),
  category: StatusCategorySchema,
  order: z.number().int().nonnegative(),
  color: z.string().optional(),
  isEntry: z.boolean(),
});
export type BoardStatus = z.infer<typeof BoardStatusSchema>;

export const BoardStatusInputSchema = z.object({
  key: BoardStatusKeySchema.optional(),
  label: z.string().trim().min(1).optional(),
  category: StatusCategorySchema.optional(),
  order: z.number().int().nonnegative().optional(),
  color: z.string().optional(),
  isEntry: z.boolean().optional(),
});
export type BoardStatusInput = z.infer<typeof BoardStatusInputSchema>;

export const RULE_TRIGGER_TYPES = ['status_entered', 'issue_created'] as const;
export type RuleTriggerType = (typeof RULE_TRIGGER_TYPES)[number];

export const RULE_CONDITION_TYPES = ['has_label'] as const;
export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];

export const RULE_ACTION_TYPES = ['assign_agent', 'set_status', 'notify_owner'] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export const StatusEnteredTriggerSchema = z.object({
  type: z.literal(RULE_TRIGGER_TYPES[0]),
  statusKey: z.string().min(1),
});
export type StatusEnteredTrigger = z.infer<typeof StatusEnteredTriggerSchema>;

export const IssueCreatedTriggerSchema = z.object({ type: z.literal(RULE_TRIGGER_TYPES[1]) });
export type IssueCreatedTrigger = z.infer<typeof IssueCreatedTriggerSchema>;

export const RuleTriggerSchema = z.discriminatedUnion('type', [
  StatusEnteredTriggerSchema,
  IssueCreatedTriggerSchema,
]);
export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

export const HasLabelConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[0]),
  labelId: z.string().uuid(),
});
export type HasLabelCondition = z.infer<typeof HasLabelConditionSchema>;

export const RuleConditionSchema = z.discriminatedUnion('type', [HasLabelConditionSchema]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export const AssignAgentActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[0]),
  agentId: z.string().uuid(),
  executionProfileId: ExecutionProfileIdSchema.optional(),
});
export type AssignAgentAction = z.infer<typeof AssignAgentActionSchema>;

export const SetStatusActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[1]),
  statusKey: z.string().min(1),
});
export type SetStatusAction = z.infer<typeof SetStatusActionSchema>;

export const NotifyOwnerActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[2]),
  text: z.string().trim().min(1).max(2000),
});
export type NotifyOwnerAction = z.infer<typeof NotifyOwnerActionSchema>;

export const RuleActionSchema = z.discriminatedUnion('type', [
  AssignAgentActionSchema,
  SetStatusActionSchema,
  NotifyOwnerActionSchema,
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const BoardRuleSchema = z.object({
  id: z.string().uuid(),
  trigger: RuleTriggerSchema,
  conditions: z.array(RuleConditionSchema),
  actions: z.array(RuleActionSchema).min(1),
  position: z.number().int().nonnegative(),
  enabled: z.boolean(),
});
export type BoardRule = z.infer<typeof BoardRuleSchema>;

export const BoardRuleInputSchema = BoardRuleSchema.omit({ id: true });
export type BoardRuleInput = z.infer<typeof BoardRuleInputSchema>;

export const BoardDefinitionSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  color: z.string().trim().optional(),
  statuses: z.array(BoardStatusSchema).min(2),
  rules: z.array(BoardRuleInputSchema),
});
export type BoardDefinition = z.infer<typeof BoardDefinitionSchema>;

export const BoardTemplateKeySchema = z.enum(['dev', 'simple', 'crm', 'blank']);
export type BoardTemplateKey = z.infer<typeof BoardTemplateKeySchema>;

export const ReorderBoardStatusesBodySchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});
export type ReorderBoardStatusesBody = z.infer<typeof ReorderBoardStatusesBodySchema>;

export const ReorderBoardRulesBodySchema = z.object({
  order: z.array(z.string().uuid()),
});
export type ReorderBoardRulesBody = z.infer<typeof ReorderBoardRulesBodySchema>;
