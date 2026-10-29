import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { AcceptedRunResponse, SendThreadRunBody } from '@harnesys/contracts';
import type { Attachment } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import type { PlacementResult } from '../../domain/fleet/placement.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';
import { IssueRemoteRunUseCase } from '../fleet/issue-remote-run.use-case.ts';
import { IssueWaitingRunUseCase } from '../fleet/issue-waiting-run.use-case.ts';
import { GetEffectiveSkillsUseCase } from '../skills/get-effective-skills.use-case.ts';
import { requestedSkillsBlock, validateRequestedSkills } from '../skills/requested-skills.ts';
import { assertDailyBudget } from '../usage/assert-daily-budget.ts';
import { resolveRunPlacement, toPlacementEvent } from './resolve-run-placement.ts';
import {
  assertRunStart,
  attributedRun,
  auditRunStart,
  type RunStartAttribution,
} from './run-attribution.ts';
import {
  type AttachmentMeta,
  attachmentMetasOf,
  mapSendError,
  resolveAttachmentsOf,
} from './send-thread-attachments.ts';
import { dispatchLocalRun, dispatchRemoteRun, sharedRunFields } from './send-thread-dispatch.ts';
import { resolveWorktreeBinding, type WorktreeBinding } from './send-thread-worktree.ts';
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
    private readonly attachments: AttachmentRepositoryPort,
    readonly _layout: HostFsLayoutPort,
    private readonly agents: AgentRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
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
  ) {}

  async execute(request: SendThreadRunRequest): Promise<AcceptedRunResponse> {
    assertRunStart(request.attribution);
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const agent = this.agents.findById(request.orgId, thread.agentId);
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
    const worktreeBinding = resolveWorktreeBinding({
      orgId: request.orgId,
      sourceId: request.body.sourceId,
      worktreeId: request.body.worktreeId,
      agentSharedSourceIds: agent.sharedSourceIds,
      worktrees: this.worktrees,
    });
    const runId = randomUUID();
    const decision = resolveRunPlacement({
      orgId: request.orgId,
      runId,
      threadProfileId: thread.runProfileId,
      agentProfileId: agent.executionProfileId,
      issueRuleProfileId: request.issueRuleProfileId,
      worktreeHostId: worktreeBinding?.hostId ?? null,
      profiles: this.profiles,
      hub: this.hub,
      claims: this.claims,
    });
    const resolvedAttachments = resolveAttachmentsOf(
      this.attachments,
      request.orgId,
      request.threadId,
      request.body.attachmentIds,
    );
    const requestedSkills = [...new Set(request.body.skills ?? [])];
    await this.validateRequestedSkills(request.orgId, agent.id, requestedSkills);
    const runText =
      requestedSkills.length > 0
        ? `${requestedSkillsBlock(requestedSkills)}\n\n${request.body.text ?? ''}`
        : request.body.text;

    try {
      const accepted = await this.dispatchRun({
        request,
        thread,
        agent,
        decision,
        attachments: resolvedAttachments,
        requestedSkills,
        runText,
        worktreeBinding,
      });
      auditRunStart(this.audit, {
        orgId: request.orgId,
        runId: accepted.runId,
        attribution: attributedRun(
          request.attribution,
          decision.kind === 'unavailable' ? null : decision.nodeId,
        ),
        triggerId: request.trigger?.id ?? request.threadId,
      });
      if (worktreeBinding) {
        this.worktrees.setActiveRunId(
          request.orgId,
          worktreeBinding.worktreeId,
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
      return accepted;
    } catch (error) {
      throw mapSendError(error);
    }
  }

  private async dispatchRun(input: {
    request: SendThreadRunRequest;
    thread: ThreadRecord;
    agent: AgentRecord;
    decision: PlacementResult;
    attachments: Attachment[];
    requestedSkills: string[];
    runText: string | undefined;
    worktreeBinding: WorktreeBinding | null;
  }): Promise<AcceptedRunResponse> {
    const { request, thread, agent, decision, attachments, requestedSkills, worktreeBinding } =
      input;
    const attachmentMetas = attachmentMetasOf(
      this.attachments,
      request.orgId,
      request.threadId,
      request.body.attachmentIds,
    );
    if (decision.kind === 'unavailable') {
      return await this.issueUnavailable({
        request,
        threadId: thread.id,
        agentId: agent.id,
        decision,
        text: input.runText,
        attachments,
        attachmentMetas,
        requestedSkills,
        worktreeBinding,
      });
    }
    const sharedFields = sharedRunFields({
      runDirectory: thread.runDirectory,
      worktreeBinding,
      sourceId: request.body.sourceId,
      isolation: decision.request.isolation,
    });
    const localHostId = this.machineConfig.get().id;
    if (decision.nodeId === localHostId) {
      return await dispatchLocalRun({
        executor: this.executor,
        request,
        thread,
        decision,
        runText: input.runText,
        attachments,
        skills: requestedSkills,
        worktreeBinding,
        sharedFields,
      });
    }
    return await dispatchRemoteRun({
      issueRemote: this.issueRemote,
      request,
      thread,
      agent,
      decision,
      runText: input.runText,
      attachments,
      skills: requestedSkills,
      attachmentMetas,
      sharedFields,
    });
  }

  private async issueUnavailable(input: {
    request: SendThreadRunRequest;
    threadId: string;
    agentId: string;
    decision: Extract<PlacementResult, { kind: 'unavailable' }>;
    text?: string;
    attachments: Attachment[];
    attachmentMetas: AttachmentMeta[];
    requestedSkills: string[];
    worktreeBinding: WorktreeBinding | null;
  }): Promise<AcceptedRunResponse> {
    const trigger = input.request.trigger ?? {
      kind: 'chat' as const,
      id: input.request.threadId,
    };
    const placementExtras = input.worktreeBinding
      ? {
          worktreeId: input.worktreeBinding.worktreeId,
          worktreeHostId: input.worktreeBinding.hostId,
        }
      : undefined;
    return await this.issueWaiting.execute({
      orgId: input.request.orgId,
      threadId: input.threadId,
      runId: input.decision.request.runId,
      profileId: input.decision.request.profileId,
      agentId: input.agentId,
      priority: input.request.priority ?? 3,
      trigger,
      reason: input.decision.reason,
      attribution: attributedRun(input.request.attribution, null),
      candidatesJson: JSON.stringify(input.decision.candidates),
      configRevision: 0,
      placementEvent: toPlacementEvent(input.decision, placementExtras),
      text: input.text,
      effort: input.request.body.effort,
      mode: input.request.body.mode,
      ...(input.requestedSkills.length > 0 ? { skills: input.requestedSkills } : {}),
      ...(input.attachments.length > 0 ? { attachments: input.attachments } : {}),
      ...(input.attachmentMetas.length > 0 ? { attachmentMetas: input.attachmentMetas } : {}),
      clientEventId: input.request.body.clientEventId,
      origin: input.request.body.origin,
      correlationId: input.request.body.correlationId,
      expiresAt: input.request.expiresAt ?? null,
      ...(input.worktreeBinding
        ? {
            sourceId: input.worktreeBinding.sourceId,
            worktreeId: input.worktreeBinding.worktreeId,
            worktreeHostId: input.worktreeBinding.hostId,
          }
        : {}),
      issueRuleProfileId: input.request.issueRuleProfileId,
      profileSource: input.decision.request.profileSource,
    });
  }

  private async validateRequestedSkills(
    orgId: string,
    agentId: string,
    requested: string[],
  ): Promise<void> {
    if (requested.length === 0) {
      return;
    }
    const effective = await this.effectiveSkills.execute({ orgId, agentId });
    const check = validateRequestedSkills({ requested, catalog: effective.skills });
    if ('error' in check) {
      throw new ThreadValidationException(check.error);
    }
  }
}
