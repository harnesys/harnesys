import { Injectable } from '@harnesys/brix';
import type { PreviewBoardRulesResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { hasOpenBlockers } from '../../domain/issue/dependency-cycle.ts';
import {
  IssueBoardNotFoundException,
  IssueNotFoundException,
} from '../../domain/issue/issue.error.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { runRules } from '../../domain/issue/rule-engine.ts';
import { engineRefs, issueClosedChecker, toEngineIssue } from './issue-rule-support.ts';

export interface PreviewBoardRulesRequest {
  orgId: string;
  boardId: string;
  issueId: string;
}

@Injectable()
export class PreviewBoardRulesUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly issues: IssueRepositoryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
  ) {}

  execute(request: PreviewBoardRulesRequest): PreviewBoardRulesResponse {
    const { orgId } = request;
    const board = this.boards.findById(orgId, request.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(request.boardId);
    }
    const issue = this.issues.findById(orgId, request.issueId);
    if (!issue || issue.boardId !== board.id) {
      throw new IssueNotFoundException(request.issueId);
    }
    const isClosed = issueClosedChecker({ orgId, issues: this.issues, boards: this.boards });
    const openBlockers = hasOpenBlockers(this.dependencies.listAll(orgId), issue.id, isClosed);
    const outcome = runRules({
      rules: board.rules,
      event: { type: 'status_entered', statusKey: issue.statusKey },
      issue: toEngineIssue(issue, openBlockers),
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
    });
    const assign = outcome.assigns[0] ?? null;
    return {
      preview: {
        agentId: assign?.agentId ?? null,
        executionProfileId: assign?.executionProfileId ?? null,
        ruleId: assign?.ruleId ?? null,
        finalStatusKey: outcome.finalStatusKey,
        addLabelIds: outcome.addLabelIds,
        removeLabelIds: outcome.removeLabelIds,
        unassign: outcome.unassign,
        notifications: outcome.notifications.map((notification) => notification.text),
        matchedRuleIds: outcome.matchedRuleIds,
        skippedRules: outcome.skippedRules,
        stopped: outcome.stopped,
      },
    };
  }
}
