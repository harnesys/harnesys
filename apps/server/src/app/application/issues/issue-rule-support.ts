import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import type { EngineRefs } from '../../domain/issue/rule-engine.ts';

export function engineRefs(input: {
  board: IssueBoardRecord;
  labels: IssueLabelRepositoryPort;
  agents: AgentRegistryPort;
  orgId: string;
}): EngineRefs {
  const keys = new Set(input.board.statuses.map((status) => status.key));
  return {
    statusExists: (statusKey) => keys.has(statusKey),
    labelExists: (labelId) => input.labels.findById(input.orgId, labelId) !== undefined,
    agentExists: (agentId) => input.agents.findById(input.orgId, agentId) !== undefined,
  };
}

export function issueClosedChecker(input: {
  orgId: string;
  issues: IssueRepositoryPort;
  boards: IssueBoardRepositoryPort;
}): (issueId: string) => boolean {
  return (issueId) => {
    const issue = input.issues.findById(input.orgId, issueId);
    if (!issue) {
      return true;
    }
    const board = input.boards.findById(input.orgId, issue.boardId);
    if (!board) {
      return true;
    }
    const category = board.statuses.find((status) => status.key === issue.statusKey)?.category;
    return category === 'finished' || category === 'cancelled';
  };
}
