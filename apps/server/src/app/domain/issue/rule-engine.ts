import type {
  AssignAgentAction,
  NotifyOwnerAction,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  SetStatusAction,
} from '@harnesys/contracts';
import type { BoardRuleRecord } from './board.ts';

export const MAX_CASCADE_TRANSITIONS = 5;

export type RuleEvent = { type: 'issue_created' } | { type: 'status_entered'; statusKey: string };

export interface EngineRefs {
  statusExists(statusKey: string): boolean;
  labelExists(labelId: string): boolean;
  agentExists(agentId: string): boolean;
}

export interface EngineIssue {
  statusKey: string;
  labels: string[];
}

export interface EngineAssign {
  agentId: string;
  executionProfileId: string | null;
  ruleId: string;
  createdByUserId: string | null;
}

export interface EngineNotification {
  ruleId: string;
  text: string;
}

export type SkipReason = 'dead-ref' | 'disabled';

export interface SkippedRule {
  ruleId: string;
  reason: SkipReason;
}

export type EngineStopReason = 'cascade-cap' | 'status-repeat';

export interface EngineStop {
  reason: EngineStopReason;
  statusKey: string;
}

export interface EngineOutcome {
  finalStatusKey: string;
  assigns: EngineAssign[];
  notifications: EngineNotification[];
  skippedRules: SkippedRule[];
  stop: EngineStop | null;
}

export interface RunRulesInput {
  rules: BoardRuleRecord[];
  event: RuleEvent | RuleEvent[];
  issue: EngineIssue;
  refs: EngineRefs;
}

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
  notifications: EngineNotification[];
  skippedRules: SkippedRule[];
  visited: Set<string>;
  transitions: number;
  stop: EngineStop | null;
}

export function triggerMatches(trigger: RuleTrigger, event: RuleEvent): boolean {
  if (trigger.type === 'issue_created') {
    return event.type === 'issue_created';
  }
  return event.type === 'status_entered' && trigger.statusKey === event.statusKey;
}

export function evaluateConditions(
  conditions: RuleCondition[],
  labels: string[],
  refs: EngineRefs,
): ConditionResult {
  if (conditions.some((condition) => !refs.labelExists(condition.labelId))) {
    return 'dead-ref';
  }
  return conditions.every((condition) => labels.includes(condition.labelId))
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
  while (queue.length > 0) {
    const event = queue.shift() as RuleEvent;
    for (const rule of active) {
      applyRule(context, rule, event);
    }
  }
  return {
    finalStatusKey: state.finalStatusKey,
    assigns: state.assigns,
    notifications: state.notifications,
    skippedRules: state.skippedRules,
    stop: state.stop,
  };
}

export function pickAssignment(input: PickAssignmentInput): PickedAssignment | null {
  const event: RuleEvent = { type: 'status_entered', statusKey: input.issue.statusKey };
  const { active } = orderRules(input.rules);
  let picked: PickedAssignment | null = null;
  let ownerUserId: string | null = null;
  for (const rule of active) {
    if (!triggerMatches(rule.trigger, event)) {
      continue;
    }
    if (evaluateConditions(rule.conditions, input.issue.labels, input.refs) !== 'matched') {
      continue;
    }
    for (const action of rule.actions) {
      if (action.type !== 'assign_agent' || !input.refs.agentExists(action.agentId)) {
        continue;
      }
      ownerUserId = ownerUserId ?? rule.createdByUserId;
      picked = {
        agentId: action.agentId,
        executionProfileId: action.executionProfileId ?? null,
        ruleId: rule.id,
        ownerUserId,
      };
    }
  }
  return picked;
}

function orderRules(rules: BoardRuleRecord[]): {
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
    notifications: [],
    skippedRules: [],
    visited,
    transitions: 0,
    stop: null,
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
  const conditions = evaluateConditions(rule.conditions, context.issue.labels, context.refs);
  if (conditions === 'dead-ref') {
    markSkipped(context.state, rule.id, 'dead-ref');
    return;
  }
  if (conditions !== 'matched') {
    return;
  }
  for (const action of rule.actions) {
    applyAction(context, rule, action);
  }
}

function applyAction(context: EngineContext, rule: BoardRuleRecord, action: RuleAction): void {
  if (action.type === 'assign_agent') {
    if (!context.refs.agentExists(action.agentId)) {
      markSkipped(context.state, rule.id, 'dead-ref');
      return;
    }
    applyAssign(context.state, rule, action);
    return;
  }
  if (action.type === 'notify_owner') {
    applyNotify(context.state, rule, action);
    return;
  }
  applyStatus(context, rule, action);
}

function applyAssign(state: EngineState, rule: BoardRuleRecord, action: AssignAgentAction): void {
  state.assigns.push({
    agentId: action.agentId,
    executionProfileId: action.executionProfileId ?? null,
    ruleId: rule.id,
    createdByUserId: rule.createdByUserId,
  });
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
