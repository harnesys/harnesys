import type { IssuePriority, IssueType } from '@harnesys/contracts';
import type { BoardRuleRecord } from './board.ts';

export const MAX_CASCADE_TRANSITIONS = 5;

export type RuleEvent =
  | { type: 'issue_created' }
  | { type: 'status_entered'; statusKey: string }
  | { type: 'run_settled' };

export interface EngineRefs {
  statusExists(statusKey: string): boolean;
  labelExists(labelId: string): boolean;
  agentExists(agentId: string): boolean;
}

export interface EngineIssue {
  statusKey: string;
  labels: string[];
  priority: IssuePriority;
  type: IssueType;
  hasOpenBlockers: boolean;
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

export interface EngineWake {
  agentId: string;
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
  unassign: boolean;
  addLabelIds: string[];
  removeLabelIds: string[];
  notifications: EngineNotification[];
  wakes: EngineWake[];
  matchedRuleIds: string[];
  skippedRules: SkippedRule[];
  stop: EngineStop | null;
  stopped: boolean;
}

export interface RunRulesInput {
  rules: BoardRuleRecord[];
  event: RuleEvent | RuleEvent[];
  issue: EngineIssue;
  refs: EngineRefs;
}
