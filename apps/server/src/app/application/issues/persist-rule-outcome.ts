import type { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import type { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';

export interface PersistRuleOutcomeDeps {
  issues: IssueRepositoryPort;
  boards: IssueBoardRepositoryPort;
}

export interface PersistRuleOutcomeInput {
  orgId: string;
  issue: IssueRecord;
  finalStatusKey: string;
  firedAgentId: string | null;
  labelIds: string[];
  unassign: boolean;
}

export function persistRuleOutcome(
  deps: PersistRuleOutcomeDeps,
  input: PersistRuleOutcomeInput,
): IssueRecord {
  const { orgId, issue, finalStatusKey, firedAgentId, labelIds, unassign } = input;
  const labelsChanged =
    labelIds.length !== issue.labels.length ||
    labelIds.some((labelId) => !issue.labels.includes(labelId));
  if (finalStatusKey === issue.statusKey && firedAgentId === null && !unassign && !labelsChanged) {
    return issue;
  }
  const board = deps.boards.findById(orgId, issue.boardId);
  const category = board?.statuses.find((status) => status.key === finalStatusKey)?.category;
  const now = new Date().toISOString();
  let assigneeAgentId = issue.assigneeAgentId;
  if (firedAgentId !== null) {
    assigneeAgentId = firedAgentId;
  } else if (unassign) {
    assigneeAgentId = null;
  }
  return deps.issues.update(orgId, issue.id, {
    statusKey: finalStatusKey,
    labels: labelIds,
    assigneeAgentId,
    closedAt: category === 'finished' || category === 'cancelled' ? (issue.closedAt ?? now) : null,
    updatedAt: now,
  });
}
