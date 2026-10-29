import { Injectable } from '@harnesys/brix';
import type {
  GetIssueResponse,
  IssueExecutionPublic,
  IssueLaunchPreview,
  IssuePlacementCandidate,
  IssuePlacementDiagnosis,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueCommentRepositoryPort } from '../../domain/issue/issue-comment-repository.port.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution } from '../../domain/issue/issue-execution.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { pickAssignment } from '../../domain/issue/rule-engine.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { toPublicWorktree } from '../source/to-public-worktree.ts';
import {
  toAttachmentPublic,
  toCommentPublic,
  toDependencyPublic,
  toIssuePublic,
  toRulePublic,
} from './issue-mappers.ts';
import { engineRefs } from './issue-rule-support.ts';

export interface GetIssueRequest {
  orgId: string;
  issueId: string;
}

@Injectable()
export class GetIssueUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly comments: IssueCommentRepositoryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly executions: IssueExecutionPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly pending: PendingPlacementPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  execute(request: GetIssueRequest): GetIssueResponse {
    const { orgId, issueId } = request;
    const issue = this.issues.findById(orgId, issueId);
    if (!issue) {
      throw new IssueNotFoundException(issueId);
    }
    const board = this.boards.findById(orgId, issue.boardId);
    const execution = this.executions.findActiveByIssue(orgId, issueId);
    const worktreeRow =
      this.pickWorktree(orgId, issueId, execution?.worktreeId ?? null) ??
      this.worktrees.listForIssue(orgId, issueId).find((row) => row.state !== 'removing') ??
      null;
    const publicDeps = {
      worktrees: this.worktrees,
      layout: this.layout,
      hostId: this.machineConfig.get().id,
    };
    return {
      issue: toIssuePublic(issue, publicDeps),
      comments: this.comments.listByIssue(orgId, issueId).map(toCommentPublic),
      subtasks: this.issues
        .listChildren(orgId, issueId)
        .map((row) => toIssuePublic(row, publicDeps)),
      dependencies: this.dependencies.listByIssue(orgId, issueId).map(toDependencyPublic),
      dependents: this.dependencies.listDependents(orgId, issueId).map(toDependencyPublic),
      attachments: this.attachments.listByIssue(orgId, issueId).map(toAttachmentPublic),
      rules: board?.rules.map(toRulePublic) ?? [],
      execution: execution ? toExecutionPublic(execution) : null,
      worktree: worktreeRow ? toPublicWorktree(worktreeRow, null) : null,
      placement: this.placementDiagnosis(orgId, execution),
      launchPreview:
        board !== undefined
          ? this.launchPreview({
              orgId,
              board,
              issue,
            })
          : { agentId: null, ruleId: null, profileId: null, profileSource: null },
    };
  }

  private pickWorktree(orgId: string, issueId: string, worktreeId: string | null) {
    if (worktreeId) {
      return this.worktrees.findById(orgId, worktreeId);
    }
    return (
      this.worktrees
        .listForIssue(orgId, issueId)
        .find((row) => row.state === 'ready' || row.state === 'creating') ?? null
    );
  }

  private placementDiagnosis(
    orgId: string,
    execution: IssueExecution | null,
  ): IssuePlacementDiagnosis | null {
    if (!execution?.runId) {
      return null;
    }
    const pending = this.pending.findByRun(orgId, execution.runId);
    if (!pending) {
      return {
        summary:
          execution.state === 'active' ? 'Run placed and active' : `Execution ${execution.state}`,
        profileId: execution.profileId,
        profileSource: null,
        selectedNodeId: null,
        unavailableReason: null,
        waiting: false,
        candidates: [],
      };
    }
    let candidates: IssuePlacementCandidate[] = [];
    try {
      const parsed = JSON.parse(pending.lastCandidatesJson) as IssuePlacementCandidate[];
      if (Array.isArray(parsed)) {
        candidates = parsed.map((item) => ({
          nodeId: String(item.nodeId),
          eligible: Boolean(item.eligible),
          reasons: Array.isArray(item.reasons) ? item.reasons.map(String) : [],
          activeClaims: typeof item.activeClaims === 'number' ? item.activeClaims : 0,
        }));
      }
    } catch {
      candidates = [];
    }
    return {
      summary: pending.lastReason,
      profileId: pending.profileId,
      profileSource: null,
      selectedNodeId: null,
      unavailableReason: pending.lastReason,
      waiting: true,
      candidates,
    };
  }

  private launchPreview(input: {
    orgId: string;
    board: IssueBoardRecord;
    issue: IssueRecord;
  }): IssueLaunchPreview {
    const { orgId, board, issue } = input;
    if (issue.assigneeAgentId !== null) {
      const agent = this.agents.findById(orgId, issue.assigneeAgentId);
      const effective = resolveEffectiveProfile({
        issueRuleProfileId: null,
        agentProfileId: agent?.executionProfileId ?? null,
        orgDefaultProfileId: this.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
      });
      return {
        agentId: issue.assigneeAgentId,
        ruleId: null,
        profileId: effective.profileId,
        profileSource: effective.selectedBy,
      };
    }
    const picked = pickAssignment({
      rules: board.rules,
      issue: { statusKey: issue.statusKey, labels: issue.labels },
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
    });
    const agent = picked ? this.agents.findById(orgId, picked.agentId) : undefined;
    const effective = resolveEffectiveProfile({
      issueRuleProfileId: picked?.executionProfileId ?? null,
      agentProfileId: agent?.executionProfileId ?? null,
      orgDefaultProfileId: this.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
    });
    return {
      agentId: picked?.agentId ?? null,
      ruleId: picked?.ruleId ?? null,
      profileId: effective.profileId,
      profileSource: effective.selectedBy,
    };
  }
}

function toExecutionPublic(execution: IssueExecution): IssueExecutionPublic {
  return {
    id: execution.id,
    issueId: execution.issueId,
    runId: execution.runId,
    agentId: execution.agentId,
    worktreeId: execution.worktreeId,
    state: execution.state,
    requestedStatus: execution.requestedStatus,
    ruleId: execution.ruleId,
    profileId: execution.profileId,
    correlationId: execution.correlationId,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
  };
}
