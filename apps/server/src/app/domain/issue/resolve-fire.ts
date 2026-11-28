import type { BoardRuleRecord } from './board.ts';
import type { IssueFireReason } from './issue.ts';
import {
  type EngineIssue,
  type EngineOutcome,
  type EngineRefs,
  type EngineStop,
  type RuleEvent,
  runRules,
  type SkippedRule,
} from './rule-engine.ts';

export interface ResolvedFire {
  agentId: string | null;
  fireBlockedByBlockers: boolean;
  executionProfileId: string | null;
  ruleId: string | null;
  reason: IssueFireReason;
  ownerUserId: string | null;
  finalStatusKey: string;
  addLabelIds: string[];
  removeLabelIds: string[];
  unassign: boolean;
  notifications: string[];
  wakes: string[];
  matchedRuleIds: string[];
  skippedRules: SkippedRule[];
  stop: EngineStop | null;
  stopped: boolean;
}

export interface ResolveFireInput {
  rules: BoardRuleRecord[];
  event: RuleEvent | RuleEvent[];
  issue: EngineIssue;
  refs: EngineRefs;
  explicitAssignee: string | null;
  hasOpenBlockers: boolean;
}

export function resolveFire(input: ResolveFireInput): ResolvedFire {
  const outcome = runRules({
    rules: input.rules,
    event: input.event,
    issue: input.issue,
    refs: input.refs,
  });
  return toResolvedFire(outcome, input);
}

export function applyLabelMutations(labels: string[], resolved: ResolvedFire): string[] {
  const removed = new Set(resolved.removeLabelIds);
  const next = labels.filter((labelId) => !removed.has(labelId));
  for (const labelId of resolved.addLabelIds) {
    if (!next.includes(labelId)) {
      next.push(labelId);
    }
  }
  return next;
}

function toResolvedFire(outcome: EngineOutcome, input: ResolveFireInput): ResolvedFire {
  const explicit = input.explicitAssignee;
  const assign = outcome.assigns[0] ?? null;
  const intent = explicit ?? assign?.agentId ?? null;
  return {
    agentId: input.hasOpenBlockers ? null : intent,
    fireBlockedByBlockers: input.hasOpenBlockers && intent !== null,
    executionProfileId: explicit ? null : (assign?.executionProfileId ?? null),
    ruleId: explicit ? null : (assign?.ruleId ?? null),
    reason: explicit ? 'override' : 'rule',
    ownerUserId: explicit ? null : (assign?.createdByUserId ?? null),
    finalStatusKey: outcome.finalStatusKey,
    addLabelIds: outcome.addLabelIds,
    removeLabelIds: outcome.removeLabelIds,
    unassign: outcome.unassign,
    notifications: outcome.notifications.map((notification) => notification.text),
    wakes: outcome.wakes.map((wake) => wake.agentId),
    matchedRuleIds: outcome.matchedRuleIds,
    skippedRules: outcome.skippedRules,
    stop: outcome.stop,
    stopped: outcome.stopped,
  };
}
