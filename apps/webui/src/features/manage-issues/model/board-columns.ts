import type { BoardRuleRecord, BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { cn } from '@/shared/lib/utils';

export function isClosedCategory(status: BoardStatus): boolean {
  return status.category === 'finished' || status.category === 'cancelled';
}

export function canQuickCreate(status: BoardStatus): boolean {
  return !isClosedCategory(status);
}

export function sortedStatuses(statuses: BoardStatus[]): BoardStatus[] {
  return [...statuses].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

export function statusOf(statuses: BoardStatus[], statusKey: string): BoardStatus | undefined {
  return statuses.find((status) => status.key === statusKey);
}

function ruleTriggerStatusKey(rule: BoardRuleRecord): string | null {
  return rule.trigger.type === 'status_entered' ? rule.trigger.statusKey : null;
}

export function rulesForStatus(rules: BoardRuleRecord[], statusKey: string): BoardRuleRecord[] {
  return rules
    .filter((rule) => rule.enabled && ruleTriggerStatusKey(rule) === statusKey)
    .sort((a, b) => a.position - b.position);
}

export function ruleAssignActions(rule: BoardRuleRecord) {
  return rule.actions.filter((action) => action.type === 'assign_agent');
}

export function issueHasRule(
  rules: BoardRuleRecord[],
  statuses: BoardStatus[],
  issue: IssueRecord,
): boolean {
  const matched = rulesForStatus(rules, issue.statusKey).filter((rule) =>
    rule.conditions.every(
      (condition) => condition.type !== 'has_label' || issue.labels.includes(condition.labelId),
    ),
  );
  if (matched.length === 0) {
    return false;
  }
  const started = statusOf(statuses, issue.statusKey)?.category === 'started';
  return started && matched.some((rule) => ruleAssignActions(rule).length > 0);
}

export function parseIssueCardDragId(dataTransfer: DataTransfer): string | null {
  const raw = dataTransfer.getData('text/plain');
  if (!raw.startsWith('issue:')) {
    return null;
  }
  return raw.slice('issue:'.length) || null;
}

export function columnDropClassName(over: boolean): string {
  return cn(over && 'bg-sidebar-accent/40 ring-1 ring-ring/40 ring-inset');
}

export function issueCode(issueId: string): string {
  return `ISSUE-${issueId.slice(0, 8).toUpperCase()}`;
}
