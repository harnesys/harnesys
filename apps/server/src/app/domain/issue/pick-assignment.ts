import type { BoardRuleRecord } from './board.ts';
import {
  type EngineIssue,
  type EngineRefs,
  evaluateConditions,
  orderRules,
  type RuleEvent,
  triggerMatches,
} from './rule-engine.ts';

export interface PickedAssignment {
  agentId: string;
  executionProfileId: string | null;
  ruleId: string;
  ownerUserId: string | null;
}

export interface PickAssignmentInput {
  rules: BoardRuleRecord[];
  issue: EngineIssue;
  refs: EngineRefs;
}

export function pickAssignment(input: PickAssignmentInput): PickedAssignment | null {
  const event: RuleEvent = { type: 'status_entered', statusKey: input.issue.statusKey };
  const { active } = orderRules(input.rules);
  for (const rule of active) {
    const picked = pickFromRule(rule, event, input);
    if (picked !== undefined) {
      return picked;
    }
  }
  return null;
}

function pickFromRule(
  rule: BoardRuleRecord,
  event: RuleEvent,
  input: PickAssignmentInput,
): PickedAssignment | null | undefined {
  if (!triggerMatches(rule.trigger, event)) {
    return undefined;
  }
  if (evaluateConditions(rule.conditions, input.issue, input.refs) !== 'matched') {
    return undefined;
  }
  for (const action of rule.actions) {
    if (action.type === 'unassign') {
      return null;
    }
    if (action.type === 'assign_agent' && input.refs.agentExists(action.agentId)) {
      return {
        agentId: action.agentId,
        executionProfileId: action.executionProfileId ?? null,
        ruleId: rule.id,
        ownerUserId: rule.createdByUserId,
      };
    }
  }
  if (rule.actions.some((action) => action.type === 'stop')) {
    return null;
  }
  return undefined;
}
