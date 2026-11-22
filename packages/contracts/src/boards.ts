import { z } from 'zod';
import { ExecutionProfileIdSchema } from './execution-profile.ts';
import { IssuePrioritySchema, IssueTypeSchema } from './issue-fields.ts';

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

export const RULE_TRIGGER_TYPES = ['status_entered', 'issue_created', 'run_settled'] as const;
export type RuleTriggerType = (typeof RULE_TRIGGER_TYPES)[number];

export const RULE_CONDITION_TYPES = [
  'has_label',
  'has_not_label',
  'has_priority',
  'has_type',
  'has_open_blockers',
] as const;
export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];

export const RULE_ACTION_TYPES = [
  'assign_agent',
  'set_status',
  'notify_owner',
  'add_label',
  'remove_label',
  'unassign',
  'stop',
  'wake_agent',
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export const StatusEnteredTriggerSchema = z.object({
  type: z.literal(RULE_TRIGGER_TYPES[0]),
  statusKey: z.string().min(1),
});
export type StatusEnteredTrigger = z.infer<typeof StatusEnteredTriggerSchema>;

export const IssueCreatedTriggerSchema = z.object({ type: z.literal(RULE_TRIGGER_TYPES[1]) });
export type IssueCreatedTrigger = z.infer<typeof IssueCreatedTriggerSchema>;

export const RunSettledTriggerSchema = z.object({ type: z.literal(RULE_TRIGGER_TYPES[2]) });
export type RunSettledTrigger = z.infer<typeof RunSettledTriggerSchema>;

export const RuleTriggerSchema = z.discriminatedUnion('type', [
  StatusEnteredTriggerSchema,
  IssueCreatedTriggerSchema,
  RunSettledTriggerSchema,
]);
export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

export const HasLabelConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[0]),
  labelId: z.string().uuid(),
});
export type HasLabelCondition = z.infer<typeof HasLabelConditionSchema>;

export const HasNotLabelConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[1]),
  labelId: z.string().uuid(),
});
export type HasNotLabelCondition = z.infer<typeof HasNotLabelConditionSchema>;

export const HasPriorityConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[2]),
  priority: IssuePrioritySchema,
});
export type HasPriorityCondition = z.infer<typeof HasPriorityConditionSchema>;

export const HasTypeConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[3]),
  issueType: IssueTypeSchema,
});
export type HasTypeCondition = z.infer<typeof HasTypeConditionSchema>;

export const HasOpenBlockersConditionSchema = z.object({
  type: z.literal(RULE_CONDITION_TYPES[4]),
  value: z.boolean(),
});
export type HasOpenBlockersCondition = z.infer<typeof HasOpenBlockersConditionSchema>;

export const RuleConditionSchema = z.discriminatedUnion('type', [
  HasLabelConditionSchema,
  HasNotLabelConditionSchema,
  HasPriorityConditionSchema,
  HasTypeConditionSchema,
  HasOpenBlockersConditionSchema,
]);
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

export const AddLabelActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[3]),
  labelId: z.string().uuid(),
});
export type AddLabelAction = z.infer<typeof AddLabelActionSchema>;

export const RemoveLabelActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[4]),
  labelId: z.string().uuid(),
});
export type RemoveLabelAction = z.infer<typeof RemoveLabelActionSchema>;

export const UnassignActionSchema = z.object({ type: z.literal(RULE_ACTION_TYPES[5]) });
export type UnassignAction = z.infer<typeof UnassignActionSchema>;

export const StopActionSchema = z.object({ type: z.literal(RULE_ACTION_TYPES[6]) });
export type StopAction = z.infer<typeof StopActionSchema>;

export const WakeAgentActionSchema = z.object({
  type: z.literal(RULE_ACTION_TYPES[7]),
  agentId: z.string().uuid(),
});
export type WakeAgentAction = z.infer<typeof WakeAgentActionSchema>;

export const RuleActionSchema = z.discriminatedUnion('type', [
  AssignAgentActionSchema,
  SetStatusActionSchema,
  NotifyOwnerActionSchema,
  AddLabelActionSchema,
  RemoveLabelActionSchema,
  UnassignActionSchema,
  StopActionSchema,
  WakeAgentActionSchema,
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

export const RuleSkipReasonSchema = z.enum(['dead-ref', 'disabled']);
export type RuleSkipReason = z.infer<typeof RuleSkipReasonSchema>;

export const BoardRulePreviewSchema = z.object({
  agentId: z.string().uuid().nullable(),
  executionProfileId: ExecutionProfileIdSchema.nullable(),
  ruleId: z.string().uuid().nullable(),
  finalStatusKey: z.string().min(1),
  addLabelIds: z.array(z.string().uuid()),
  removeLabelIds: z.array(z.string().uuid()),
  unassign: z.boolean(),
  notifications: z.array(z.string()),
  matchedRuleIds: z.array(z.string().uuid()),
  skippedRules: z.array(z.object({ ruleId: z.string().uuid(), reason: RuleSkipReasonSchema })),
  stopped: z.boolean(),
});
export type BoardRulePreview = z.infer<typeof BoardRulePreviewSchema>;

export const PreviewBoardRulesBodySchema = z.object({ issueId: z.string().uuid() });
export type PreviewBoardRulesBody = z.infer<typeof PreviewBoardRulesBodySchema>;

export const PreviewBoardRulesResponseSchema = z.object({ preview: BoardRulePreviewSchema });
export type PreviewBoardRulesResponse = z.infer<typeof PreviewBoardRulesResponseSchema>;

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
