import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { SignalWakePort } from 'harnesys';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { hasOpenBlockers } from '../../domain/issue/dependency-cycle.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import type { IssueDomainEvent } from '../../domain/issue/issue-events.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { applyLabelMutations, resolveFire } from '../../domain/issue/resolve-fire.ts';
import { applyResolvedWakes } from './apply-resolved-wakes.ts';
import { engineRefs, issueClosedChecker, toEngineIssue } from './issue-rule-support.ts';
import { persistRuleOutcome } from './persist-rule-outcome.ts';

type IssueExecutionSettledEvent = Extract<IssueDomainEvent, { type: 'issue-execution-settled' }>;

@Injectable()
export class RunSettledRulesUseCase implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly events: IssueEventsPort,
    private readonly wake: SignalWakePort,
    logger: Logger,
  ) {
    this.log = logger.child('run-settled-rules');
  }

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((orgId, event) => {
      if (event.type !== 'issue-execution-settled') {
        return;
      }
      void this.handle(orgId, event).catch((error) => {
        this.log.warn({ error, orgId, issueId: event.issueId }, 'run_settled rules failed');
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async handle(orgId: string, event: IssueExecutionSettledEvent): Promise<void> {
    const issue = this.issues.findById(orgId, event.issueId);
    if (!issue) {
      return;
    }
    const board = this.boards.findById(orgId, issue.boardId);
    if (!board) {
      return;
    }
    const isClosed = issueClosedChecker({ orgId, issues: this.issues, boards: this.boards });
    const openBlockers = hasOpenBlockers(this.dependencies.listAll(orgId), issue.id, isClosed);
    const resolved = resolveFire({
      rules: board.rules,
      event: { type: 'run_settled' },
      issue: toEngineIssue(issue, openBlockers),
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
      explicitAssignee: null,
      hasOpenBlockers: openBlockers,
    });
    if (resolved.matchedRuleIds.length === 0) {
      return;
    }
    const finalIssue = persistRuleOutcome(
      { issues: this.issues, boards: this.boards },
      {
        orgId,
        issue,
        finalStatusKey: resolved.finalStatusKey,
        firedAgentId: null,
        labelIds: applyLabelMutations(issue.labels, resolved),
        unassign: resolved.unassign,
      },
    );
    this.events.emit(orgId, { type: 'issue', issue: finalIssue });
    for (const text of resolved.notifications) {
      this.events.emit(orgId, {
        type: 'rule-notification',
        boardId: board.id,
        issueId: issue.id,
        text,
      });
    }
    await applyResolvedWakes({ wake: this.wake }, orgId, issue.id, resolved);
  }
}
