import { Injectable } from '@harnesys/brix';
import type { IssuePublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
  IssueExecutionActiveException,
  IssueNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { type PickedAssignment, pickAssignment } from '../../domain/issue/rule-engine.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { dispatchIssueExecution } from './dispatch-issue-execution.ts';
import { toIssuePublic } from './issue-mappers.ts';
import { engineRefs } from './issue-rule-support.ts';

interface NudgeTarget {
  agentId: string;
  assigned: PickedAssignment | null;
}

export interface NudgeIssueRequest {
  orgId: string;
  issueId: string;
  actorAgentId?: string | null;
}

@Injectable()
export class NudgeIssueUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly executions: IssueExecutionPort,
    private readonly fire: IssueFirePort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly driver: SourceDriverPort,
    private readonly contentProxy: FleetContentProxyPort,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly events: IssueEventsPort,
  ) {}

  async execute(request: NudgeIssueRequest): Promise<IssuePublic> {
    const { orgId } = request;
    const issue = this.loadIssue(orgId, request.issueId);
    const board = this.loadBoard(orgId, issue);
    this.assertStarted(board, issue);
    const target = this.resolveTarget(orgId, board, issue);
    this.assertNoActiveExecution(orgId, issue);
    const agent = this.agents.findById(orgId, target.agentId);
    const issueRuleProfileId = target.assigned?.executionProfileId ?? null;
    const effective = resolveEffectiveProfile({
      issueRuleProfileId,
      agentProfileId: agent?.executionProfileId ?? null,
      orgDefaultProfileId: this.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
    });
    this.issues.update(orgId, issue.id, {
      assigneeAgentId: target.agentId,
      updatedAt: new Date().toISOString(),
    });
    const refreshed = this.issues.findById(orgId, issue.id) ?? issue;
    await dispatchIssueExecution({
      orgId,
      issue: refreshed,
      board,
      statusKey: refreshed.statusKey,
      agentId: target.agentId,
      reason: 'override',
      matchedLabelId: null,
      ownerUserId: target.assigned?.ownerUserId ?? null,
      ruleId: target.assigned?.ruleId ?? null,
      issueRuleProfileId,
      profileId: effective.profileId,
      executions: this.executions,
      fire: this.fire,
      issues: this.issues,
      sources: this.sources,
      materializations: this.materializations,
      events: this.events,
      worktrees: this.worktrees,
      machineConfig: this.machineConfig,
      layout: this.layout,
      driver: this.driver,
      contentProxy: this.contentProxy,
    });
    return toIssuePublic(this.issues.findById(orgId, issue.id) ?? refreshed, {
      worktrees: this.worktrees,
      layout: this.layout,
      hostId: this.machineConfig.get().id,
    });
  }

  private loadIssue(orgId: string, issueId: string): IssueRecord {
    const issue = this.issues.findById(orgId, issueId);
    if (!issue) {
      throw new IssueNotFoundException(issueId);
    }
    return issue;
  }

  private loadBoard(orgId: string, issue: IssueRecord): IssueBoardRecord {
    const board = this.boards.findById(orgId, issue.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(issue.boardId);
    }
    if (board.status === 'archived') {
      throw new IssueBoardArchivedException(board.id);
    }
    return board;
  }

  private assertStarted(board: IssueBoardRecord, issue: IssueRecord): void {
    const status = board.statuses.find((row) => row.key === issue.statusKey);
    if (status?.category !== 'started') {
      throw new IssueValidationException(`cannot nudge issue in status: ${issue.statusKey}`);
    }
  }

  private resolveTarget(orgId: string, board: IssueBoardRecord, issue: IssueRecord): NudgeTarget {
    if (issue.assigneeAgentId !== null) {
      return { agentId: issue.assigneeAgentId, assigned: null };
    }
    const assigned = pickAssignment({
      rules: board.rules,
      issue: { statusKey: issue.statusKey, labels: issue.labels },
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
    });
    const agentId = assigned?.agentId ?? null;
    if (agentId === null) {
      throw new IssueValidationException('no assignee or rule to resolve nudge target');
    }
    return { agentId, assigned };
  }

  private assertNoActiveExecution(orgId: string, issue: IssueRecord): void {
    const active = this.executions.findActiveByIssue(orgId, issue.id);
    if (active) {
      throw new IssueExecutionActiveException(issue.id, active.id);
    }
  }
}
