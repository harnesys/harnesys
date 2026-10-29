import type { BoardRuleRecord } from './board.ts';
import type { IssueFireReason } from './issue.ts';
import {
  type EngineOutcome,
  type EngineRefs,
  type EngineStop,
  type RuleEvent,
  runRules,
  type SkippedRule,
} from './rule-engine.ts';

export interface ResolvedFire {
  agentId: string | null;
  executionProfileId: string | null;
  ruleId: string | null;
  reason: IssueFireReason;
  ownerUserId: string | null;
  finalStatusKey: string;
  notifications: string[];
  skippedRules: SkippedRule[];
  stop: EngineStop | null;
}

export interface ResolveFireInput {
  rules: BoardRuleRecord[];
  event: RuleEvent | RuleEvent[];
  issue: { statusKey: string; labels: string[] };
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

function toResolvedFire(outcome: EngineOutcome, input: ResolveFireInput): ResolvedFire {
  const explicit = input.explicitAssignee;
  const lastAssign = outcome.assigns.at(-1) ?? null;
  const firstAssign = outcome.assigns[0] ?? null;
  const agentId = input.hasOpenBlockers ? null : (explicit ?? lastAssign?.agentId ?? null);
  return {
    agentId,
    executionProfileId: explicit ? null : (lastAssign?.executionProfileId ?? null),
    ruleId: explicit ? null : (lastAssign?.ruleId ?? null),
    reason: explicit ? 'override' : 'rule',
    ownerUserId: explicit ? null : (firstAssign?.createdByUserId ?? null),
    finalStatusKey: outcome.finalStatusKey,
    notifications: outcome.notifications.map((notification) => notification.text),
    skippedRules: outcome.skippedRules,
    stop: outcome.stop,
  };
}
