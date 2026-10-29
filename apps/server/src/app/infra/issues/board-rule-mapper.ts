import type { BoardStatus, RuleTrigger } from '@harnesys/contracts';
import { RuleActionSchema, RuleConditionSchema, RuleTriggerSchema } from '@harnesys/contracts';
import { RuleValidationException } from '../../domain/issue/board.error.ts';
import type { BoardRuleRecord, BoardRuleWrite } from '../../domain/issue/board.ts';
import type { BoardRuleRow } from '../org-sqlite/schema/index.ts';

export function toRuleRecord(row: BoardRuleRow): BoardRuleRecord {
  const parsedTrigger = RuleTriggerSchema.safeParse({
    type: row.triggerType,
    ...parseObject(row.triggerPayload, `broken rule trigger: ${row.id}`),
  });
  if (!parsedTrigger.success) {
    throw new RuleValidationException(`broken rule trigger: ${row.id}`);
  }
  const parsedConditions = RuleConditionSchema.array().safeParse(parseJson(row.conditions));
  if (!parsedConditions.success) {
    throw new RuleValidationException(`broken rule conditions: ${row.id}`);
  }
  const parsedActions = RuleActionSchema.array().safeParse(parseJson(row.actions));
  if (!parsedActions.success || parsedActions.data.length === 0) {
    throw new RuleValidationException(`broken rule actions: ${row.id}`);
  }
  return {
    id: row.id,
    trigger: parsedTrigger.data,
    conditions: parsedConditions.data,
    actions: parsedActions.data,
    position: row.position,
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
  };
}

export function triggerPayload(trigger: RuleTrigger): Record<string, unknown> {
  if (trigger.type === 'status_entered') {
    return { statusKey: trigger.statusKey };
  }
  return {};
}

export function assertRuleStatusRefs(statuses: BoardStatus[], input: BoardRuleWrite): void {
  const keys = new Set(statuses.map((status) => status.key));
  if (input.trigger.type === 'status_entered' && !keys.has(input.trigger.statusKey)) {
    throw new RuleValidationException(`unknown rule status: ${input.trigger.statusKey}`);
  }
  for (const action of input.actions) {
    if (action.type === 'set_status' && !keys.has(action.statusKey)) {
      throw new RuleValidationException(`unknown rule status: ${action.statusKey}`);
    }
  }
}

function parseObject(raw: string, message: string): Record<string, unknown> {
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RuleValidationException(message);
  }
  return parsed as Record<string, unknown>;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new RuleValidationException('broken rule json');
  }
}
