import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type {
  AcceptedRunResponse,
  RunEnvironment,
  SendThreadRunBody,
  WorkspaceRef,
} from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import type { PlacementResult } from '../../domain/fleet/placement.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';
import { IssueRemoteRunUseCase } from '../fleet/issue-remote-run.use-case.ts';
import { IssueWaitingRunUseCase } from '../fleet/issue-waiting-run.use-case.ts';
import { GetEffectiveSkillsUseCase } from '../skills/get-effective-skills.use-case.ts';
import { requestedSkillsBlock } from '../skills/requested-skills.ts';
import { assertDailyBudget } from '../usage/assert-daily-budget.ts';
import type { ResolveRunEnvironmentDeps } from './resolve-run-environment.ts';
import { resolveRunEnvironment } from './resolve-run-environment.ts';
import { resolveRunPlacement } from './resolve-run-placement.ts';
import {
  assertRunStart,
  attributedRun,
  auditRunStart,
  type RunStartAttribution,
} from './run-attribution.ts';
import { sendGroupThread } from './send-group-thread.ts';
import { mapSendError, resolveAttachmentsOf } from './send-thread-attachments.ts';
import { dispatchPlacedRun, explicitWorkspaceRef } from './send-thread-dispatch.ts';
import { SendThreadMessageUseCase } from './send-thread-message.use-case.ts';
import {
  assertRequestedSkills,
  chatMentionGateBlocked,
  storeUnaddressedMessage,
} from './send-thread-run-helpers.ts';
import { applyDerivedThreadTitle } from './thread.helpers.ts';

export interface SendThreadRunRequest {
  orgId: string;
  threadId: string;
  body: SendThreadRunBody;
  attribution: RunStartAttribution;
  issueRuleProfileId?: string | null;
  priority?: number;
  trigger?: { kind: 'chat' | 'issue' | 'schedule' | 'webhook' | 'connector'; id: string };
  expiresAt?: string | null;
  branch?: string;
}

@Injectable()
export class SendThreadRunUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly issues: IssueRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    readonly _layout: HostFsLayoutPort,
    private readonly agents: AgentRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly hub: FleetHubPort,
    private readonly claims: EventClaimPort,
    private readonly executor: LocalExecutorPort,
    private readonly audit: OrgAudit,
    private readonly issueRemote: IssueRemoteRunUseCase,
    private readonly issueWaiting: IssueWaitingRunUseCase,
    private readonly effectiveSkills: GetEffectiveSkillsUseCase,
    private readonly usage: UsagePort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly users: UserRepository,
    private readonly sendMessage: SendThreadMessageUseCase,
    private readonly events: EventBusPort,
  ) {}

  async execute(request: SendThreadRunRequest): Promise<AcceptedRunResponse> {
    assertRunStart(request.attribution);
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (thread.kind === 'group') {
      return await sendGroupThread(
        {
          threadAgents: this.threadAgents,
          agents: this.agents,
          attachments: this.attachments,
          users: this.users,
          layout: this._layout,
          sendMessage: this.sendMessage,
        },
        request,
        thread,
      );
    }
    const agentId = this.threadAgents.listByThread(request.orgId, thread.id)[0]?.agentId;
    if (!agentId) {
      throw new ThreadValidationException('thread has no agent');
    }
    const agent = this.agents.findById(request.orgId, agentId);
    if (!agent) {
      throw new ThreadValidationException('agent not found for thread');
    }
    if (!agent.modelId) {
      throw new ThreadValidationException('agent has no model');
    }
    assertDailyBudget({
      usage: this.usage,
      orgId: request.orgId,
      agent,
      timezone: this.orgSettings.get(request.orgId).timezone,
    });
    const explicit = this.workspaceIntent(request, thread);
    const runEnvironmentDeps = this.runEnvironmentDeps(request.orgId);
    const { decision, environment } = this.prepareDispatch(
      request,
      thread,
      agent,
      explicit,
      runEnvironmentDeps,
    );
    const resolvedAttachments = resolveAttachmentsOf(
      this.attachments,
      request.orgId,
      request.threadId,
      request.body.attachmentIds,
      this._layout.threadDir(request.orgId, request.threadId),
    );
    if (chatMentionGateBlocked(thread, agent, request.body)) {
      return await storeUnaddressedMessage(
        { sendMessage: this.sendMessage, users: this.users },
        request,
        thread,
      );
    }
    const requestedSkills = [...new Set(request.body.skills ?? [])];
    await assertRequestedSkills(this.effectiveSkills, request.orgId, agent.id, requestedSkills);
    const runText =
      requestedSkills.length > 0
        ? `${requestedSkillsBlock(requestedSkills)}\n\n${request.body.text ?? ''}`
        : request.body.text;

    try {
      const accepted = await dispatchPlacedRun(
        {
          attachments: this.attachments,
          executor: this.executor,
          issueRemote: this.issueRemote,
          issueWaiting: this.issueWaiting,
          machineConfig: this.machineConfig,
        },
        {
          request,
          thread,
          agent,
          decision,
          attachments: resolvedAttachments,
          requestedSkills,
          runText,
          environment,
        },
      );
      auditRunStart(this.audit, {
        orgId: request.orgId,
        runId: accepted.runId,
        attribution: attributedRun(
          request.attribution,
          decision.kind === 'unavailable' ? null : decision.nodeId,
        ),
        triggerId: request.trigger?.id ?? request.threadId,
      });
      const worktreeId =
        environment.anchor?.kind === 'source' ? environment.anchor.worktreeId : undefined;
      if (worktreeId !== undefined) {
        this.worktrees.setActiveRunId(
          request.orgId,
          worktreeId,
          accepted.runId,
          new Date().toISOString(),
        );
      }
      applyDerivedThreadTitle({
        threads: this.threads,
        orgId: request.orgId,
        thread,
        text: request.body.text,
      });
      this.threads.touch(request.orgId, thread.id);
      this.events.publish(request.orgId, 'run.started', {
        orgId: request.orgId,
        threadId: request.threadId,
        runId: accepted.runId,
        agentId: agent.id,
        trigger: request.trigger ?? { kind: 'chat', id: request.threadId },
      });
      return accepted;
    } catch (error) {
      throw mapSendError(error);
    }
  }

  private runEnvironmentDeps(orgId: string): ResolveRunEnvironmentDeps {
    return {
      orgId,
      threads: this.threads,
      agents: this.agents,
      sources: this.sources,
      worktrees: this.worktrees,
      layout: this._layout,
      localHostId: this.machineConfig.get().id,
    };
  }

  private workspaceIntent(
    request: SendThreadRunRequest,
    thread: ThreadRecord,
  ): WorkspaceRef | undefined {
    return explicitWorkspaceRef(request.body) ?? this.issueWorkspaceRef(request.orgId, thread);
  }

  private issueWorkspaceRef(orgId: string, thread: ThreadRecord): WorkspaceRef | undefined {
    if (thread.kind !== 'issue' || thread.issueId === null || thread.issueId === undefined) {
      return undefined;
    }
    const issue = this.issues.findById(orgId, thread.issueId);
    if (!issue) {
      return undefined;
    }
    const sourceId = issue.sourceId ?? this.sources.findManagedWorkspace(orgId)?.id ?? null;
    if (sourceId === null) {
      return undefined;
    }
    const subpath = issue.workspaceSubpath === null ? {} : { subpath: issue.workspaceSubpath };
    const branch = issue.branch?.trim();
    if (!branch) {
      return { kind: 'source', sourceId, ...subpath };
    }
    const worktree = this.worktrees.findActiveByBranch(
      orgId,
      sourceId,
      this.machineConfig.get().id,
      branch,
    );
    return worktree
      ? { kind: 'worktree', sourceId, worktreeId: worktree.id, ...subpath }
      : { kind: 'source', sourceId, ...subpath };
  }

  private prepareDispatch(
    request: SendThreadRunRequest,
    thread: ThreadRecord,
    agent: AgentRecord,
    explicit: WorkspaceRef | undefined,
    runEnvironmentDeps: ResolveRunEnvironmentDeps,
  ): { decision: PlacementResult; environment: RunEnvironment } {
    const issue = request.trigger?.kind === 'issue' || thread.kind === 'issue';
    const preContainer = resolveRunEnvironment(runEnvironmentDeps, {
      threadId: thread.id,
      agentId: agent.id,
      ...(explicit !== undefined ? { explicit } : {}),
      issue,
    });
    const runId = randomUUID();
    const placementInput = {
      orgId: request.orgId,
      runId,
      threadProfileId: thread.runProfileId,
      agentProfileId: agent.executionProfileId,
      issueRuleProfileId: request.issueRuleProfileId,
      environment: preContainer,
      profiles: this.profiles,
      hub: this.hub,
      claims: this.claims,
      worktrees: this.worktrees,
      materializations: this.materializations,
    };
    const decision = resolveRunPlacement(placementInput);
    const resolved = resolveRunEnvironment(runEnvironmentDeps, {
      threadId: thread.id,
      agentId: agent.id,
      ...(explicit !== undefined ? { explicit } : {}),
      issue,
      ...(request.branch !== undefined ? { branch: request.branch } : {}),
    });
    if (decision.request.isolation?.mode === 'container' && resolved.anchor === null) {
      throw new ThreadValidationException('container isolation requires a workspace anchor');
    }
    const environment = decision.request.isolation
      ? { ...resolved, isolation: decision.request.isolation }
      : resolved;
    return { decision, environment };
  }
}
