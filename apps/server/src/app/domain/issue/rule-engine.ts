import type {
  AssignAgentAction,
  NotifyOwnerAction,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  SetStatusAction,
} from '@harnesys/contracts';
import type { BoardRuleRecord } from './board.ts';
import {
  type EngineAssign,
  type EngineIssue,
  type EngineNotification,
  type EngineOutcome,
  type EngineRefs,
  type EngineStop,
  MAX_CASCADE_TRANSITIONS,
  type RuleEvent,
  type RunRulesInput,
  type SkippedRule,
  type SkipReason,
} from './rule-engine.types.ts';

export type {
  EngineAssign,
  EngineIssue,
  EngineNotification,
  EngineOutcome,
  EngineRefs,
  EngineStop,
  EngineStopReason,
  RuleEvent,
  RunRulesInput,
  SkippedRule,
  SkipReason,
} from './rule-engine.types.ts';
export { MAX_CASCADE_TRANSITIONS };

type ConditionResult = 'matched' | 'no-match' | 'dead-ref';

interface EngineContext {
  state: EngineState;
  issue: EngineIssue;
  refs: EngineRefs;
  queue: RuleEvent[];
}

interface EngineState {
  finalStatusKey: string;
  assigns: EngineAssign[];
  unassign: boolean;
  addLabelIds: string[];
  removeLabelIds: string[];
  notifications: EngineNotification[];
  matchedRuleIds: string[];
  skippedRules: SkippedRule[];
  visited: Set<string>;
  transitions: number;
  stop: EngineStop | null;
  stopped: boolean;
}

export function triggerMatches(trigger: RuleTrigger, event: RuleEvent): boolean {
  if (trigger.type === 'issue_created') {
    return event.type === 'issue_created';
  }
  return event.type === 'status_entered' && trigger.statusKey === event.statusKey;
}

export function conditionUsesLabel(condition: RuleCondition): condition is RuleCondition & {
  labelId: string;
} {
  return condition.type === 'has_label' || condition.type === 'has_not_label';
}

function _labelConditionDeadRef(condition: RuleCondition, refs: EngineRefs): boolean {
  return conditionUsesLabel(condition) && !refs.labelExists(condition.labelId);
}

function conditionMatches(condition: RuleCondition, issue: EngineIssue): boolean {
  switch (condition.type) {
    case 'has_label':
      return issue.labels.includes(condition.labelId);
    case 'has_not_label':
      return !issue.labels.includes(condition.labelId);
    case 'has_priority':
      return issue.priority === condition.priority;
    case 'has_type':
      return issue.type === condition.issueType;
    case 'has_open_blockers':
      return issue.hasOpenBlockers === condition.value;
  }
}

export function evaluateConditions(
  conditions: RuleCondition[],
  issue: EngineIssue,
  refs: EngineRefs,
): ConditionResult {
  const hasDeadRef = conditions.some(
    (condition) => conditionUsesLabel(condition) && !refs.labelExists(condition.labelId),
  );
  if (hasDeadRef) {
    return 'dead-ref';
  }
  return conditions.every((condition) => conditionMatches(condition, issue))
    ? 'matched'
    : 'no-match';
}

export function runRules(input: RunRulesInput): EngineOutcome {
  const events = Array.isArray(input.event) ? input.event : [input.event];
  const state = createState(input, events);
  const { active, skipped } = orderRules(input.rules);
  state.skippedRules.push(...skipped);
  const queue: RuleEvent[] = [...events];
  const context: EngineContext = { state, issue: input.issue, refs: input.refs, queue };
  while (queue.length > 0 && !state.stopped) {
    const event = queue.shift() as RuleEvent;
    for (const rule of active) {
      applyRule(context, rule, event);
      if (state.stopped) {
        break;
      }
    }
  }
  return {
    finalStatusKey: state.finalStatusKey,
    assigns: state.assigns,
    unassign: state.unassign,
    addLabelIds: state.addLabelIds,
    removeLabelIds: state.removeLabelIds,
    notifications: state.notifications,
    matchedRuleIds: state.matchedRuleIds,
    skippedRules: state.skippedRules,
    stop: state.stop,
    stopped: state.stopped,
  };
}

export function orderRules(rules: BoardRuleRecord[]): {
  active: BoardRuleRecord[];
  skipped: SkippedRule[];
} {
  const ordered = [...rules].sort((left, right) => left.position - right.position);
  return {
    active: ordered.filter((rule) => rule.enabled),
    skipped: ordered
      .filter((rule) => !rule.enabled)
      .map((rule) => ({ ruleId: rule.id, reason: 'disabled' as const })),
  };
}

function createState(input: RunRulesInput, events: RuleEvent[]): EngineState {
  const visited = new Set<string>([input.issue.statusKey]);
  for (const event of events) {
    if (event.type === 'status_entered') {
      visited.add(event.statusKey);
    }
  }
  return {
    finalStatusKey: entryStatusKey(events, input.issue.statusKey),
    assigns: [],
    unassign: false,
    addLabelIds: [],
    removeLabelIds: [],
    notifications: [],
    matchedRuleIds: [],
    skippedRules: [],
    visited,
    transitions: 0,
    stop: null,
    stopped: false,
  };
}

function entryStatusKey(events: RuleEvent[], fallback: string): string {
  const entered = events.find((event) => event.type === 'status_entered');
  return entered ? entered.statusKey : fallback;
}

function applyRule(context: EngineContext, rule: BoardRuleRecord, event: RuleEvent): void {
  if (!triggerMatches(rule.trigger, event)) {
    return;
  }
  const conditions = evaluateConditions(rule.conditions, context.issue, context.refs);
  if (conditions === 'dead-ref') {
    markSkipped(context.state, rule.id, 'dead-ref');
    return;
  }
  if (conditions !== 'matched') {
    return;
  }
  if (!context.state.matchedRuleIds.includes(rule.id)) {
    context.state.matchedRuleIds.push(rule.id);
  }
  for (const action of rule.actions) {
    applyAction(context, rule, action);
    if (context.state.stopped) {
      return;
    }
  }
}

function applyAction(context: EngineContext, rule: BoardRuleRecord, action: RuleAction): void {
  switch (action.type) {
    case 'assign_agent':
      applyAssign(context, rule, action);
      return;
    case 'unassign':
      applyUnassign(context.state);
      return;
    case 'add_label':
    case 'remove_label': {
      if (!context.refs.labelExists(action.labelId)) {
        markSkipped(context.state, rule.id, 'dead-ref');
        return;
      }
      if (action.type === 'add_label') {
        applyAddLabel(context.state, action.labelId);
      } else {
        applyRemoveLabel(context.state, action.labelId);
      }
      return;
    }
    case 'notify_owner':
      applyNotify(context.state, rule, action);
      return;
    case 'stop':
      context.state.stopped = true;
      return;
    case 'set_status':
      applyStatus(context, rule, action);
      return;
  }
}

function assignmentDecided(state: EngineState): boolean {
  return state.assigns.length > 0 || state.unassign;
}

function applyAssign(
  context: EngineContext,
  rule: BoardRuleRecord,
  action: AssignAgentAction,
): void {
  const { state, refs } = context;
  if (assignmentDecided(state)) {
    return;
  }
  if (!refs.agentExists(action.agentId)) {
    markSkipped(state, rule.id, 'dead-ref');
    return;
  }
  state.assigns.push({
    agentId: action.agentId,
    executionProfileId: action.executionProfileId ?? null,
    ruleId: rule.id,
    createdByUserId: rule.createdByUserId,
  });
}

function applyUnassign(state: EngineState): void {
  if (assignmentDecided(state)) {
    return;
  }
  state.unassign = true;
}

function applyAddLabel(state: EngineState, labelId: string): void {
  state.removeLabelIds = state.removeLabelIds.filter((id) => id !== labelId);
  if (!state.addLabelIds.includes(labelId)) {
    state.addLabelIds.push(labelId);
  }
}

function applyRemoveLabel(state: EngineState, labelId: string): void {
  state.addLabelIds = state.addLabelIds.filter((id) => id !== labelId);
  if (!state.removeLabelIds.includes(labelId)) {
    state.removeLabelIds.push(labelId);
  }
}

function applyNotify(state: EngineState, rule: BoardRuleRecord, action: NotifyOwnerAction): void {
  state.notifications.push({ ruleId: rule.id, text: action.text });
}

function applyStatus(context: EngineContext, rule: BoardRuleRecord, action: SetStatusAction): void {
  const { state, refs, queue } = context;
  if (!refs.statusExists(action.statusKey)) {
    markSkipped(state, rule.id, 'dead-ref');
    return;
  }
  if (state.stop !== null) {
    return;
  }
  if (state.transitions >= MAX_CASCADE_TRANSITIONS) {
    state.stop = { reason: 'cascade-cap', statusKey: action.statusKey };
    return;
  }
  if (state.visited.has(action.statusKey)) {
    state.stop = { reason: 'status-repeat', statusKey: action.statusKey };
    return;
  }
  state.transitions += 1;
  state.finalStatusKey = action.statusKey;
  state.visited.add(action.statusKey);
  queue.push({ type: 'status_entered', statusKey: action.statusKey });
}

function markSkipped(state: EngineState, ruleId: string, reason: SkipReason): void {
  const known = state.skippedRules.some(
    (entry) => entry.ruleId === ruleId && entry.reason === reason,
  );
  if (!known) {
    state.skippedRules.push({ ruleId, reason });
  }
}
