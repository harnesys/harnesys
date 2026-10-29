import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import {
  type AcceptedRunResponse,
  DEFAULT_MODE_ID,
  type TaskEnvelope,
  type TaskEnvelopeAttachment,
} from '@harnesys/contracts';
import type { Attachment, RunAttribution } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import type { PlacementResult, RunIsolation } from '../../domain/fleet/placement.ts';
import { WORK_CLAIM_LEASE_SEC } from '../../domain/fleet/work-claim.constants.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { modeShellSpecOf } from '../../domain/mode-presets/preset-shell-merge.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toPlacementEvent } from '../threads/resolve-run-placement.ts';
import { runModeOf } from '../threads/thread.helpers.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';
import { IssueWaitingRunUseCase, toEnvelopeAttachments } from './issue-waiting-run.use-case.ts';

export interface IssueRemoteRunInput {
  orgId: string;
  threadId: string;
  agent: AgentRecord;
  nodeId: string;
  runId?: string;
  attribution: RunAttribution;
  placement?: PlacementResult;
  text?: string;
  effort?: string;
  mode?: string;
  attachments?: Attachment[];
  attachmentMetas?: TaskEnvelopeAttachment[];
  skills?: string[];
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
}

@Injectable()
export class IssueRemoteRunUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly events: FleetEventsPort,
    private readonly buildSnapshot: BuildOrgExecutionSnapshotUseCase,
    private readonly snapshotAcks: NodeSnapshotAckPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly issueWaiting: IssueWaitingRunUseCase,
  ) {}

  async execute(input: IssueRemoteRunInput): Promise<AcceptedRunResponse> {
    this.validateMode(input.orgId, input.mode);
    const snapshot = this.buildSnapshot.execute(input.orgId);
    if (!this.snapshotAcks.isReadyForRevision(input.orgId, input.nodeId, snapshot.revision)) {
      return await this.deferUntilSnapshotReady(input, snapshot.revision);
    }
    const configRevision = snapshot.revision;
    const lifecycle = await this.executor.lifecycle(input.orgId);
    const runId = input.runId ?? randomUUID();
    const clientEventId = input.clientEventId ?? randomUUID();
    const attachmentMetas = input.attachmentMetas ?? toEnvelopeAttachments(input.attachments ?? []);
    const userEvents = remoteUserEvents(input, clientEventId, attachmentMetas);
    const created = await lifecycle.create(
      { runId, threadId: input.threadId, attribution: input.attribution },
      userEvents,
    );
    const waitPrompt = `placed on host ${input.nodeId}`;
    await lifecycle.transition(created.runId, created.leaseEpoch, {
      from: 'queued',
      to: 'waiting',
      events: [
        {
          type: 'wait.started',
          askId: randomUUID(),
          mode: 'gate',
          source: 'wait',
          prompt: waitPrompt,
        },
      ],
    });
    const leaseEpoch = 1;
    const expiresAt = new Date(Date.now() + WORK_CLAIM_LEASE_SEC * 1000).toISOString();
    const thread = this.threads.findById(input.orgId, input.threadId);
    const modeShellSpec = modeShellSpecOf(
      this.modes,
      input.orgId,
      thread ? runModeOf(thread) : undefined,
    );
    const claim = this.claims.grant({
      orgId: input.orgId,
      runId: created.runId,
      nodeId: input.nodeId,
      leaseEpoch,
      leaseUntil: expiresAt,
      token: randomUUID(),
    });
    if (!claim) {
      await lifecycle.transition(created.runId, leaseEpoch, {
        from: 'waiting',
        to: 'failed',
        events: [{ type: 'run.failed', message: 'claim denied' }],
      });
      return { runId: created.runId, threadId: input.threadId, status: 'failed' };
    }
    this.events.emit(input.orgId);
    const afterWait = await lifecycle.get(created.runId);
    const envelope = buildRemoteEnvelope({
      input,
      runId: created.runId,
      leaseEpoch,
      expiresAt,
      relayLastSeq: afterWait?.lastSeq ?? 0,
      configRevision,
      attachmentMetas,
      ...(modeShellSpec ? { modeShellSpec } : {}),
    });
    assertEnvelopeNamesOnly(envelope);
    const command = { type: 'RUN_PLACE' as const, envelope };
    this.commands.enqueue(input.orgId, input.nodeId, command);
    this.hub.routeCommand(input.nodeId, command);
    return {
      runId: created.runId,
      threadId: input.threadId,
      status: 'queued',
    };
  }

  private validateMode(orgId: string, mode: string | undefined): void {
    if (!mode || mode === DEFAULT_MODE_ID) {
      return;
    }
    if (!this.modes.findById(orgId, mode)) {
      throw new ThreadValidationException(`unsupported mode: ${mode}`);
    }
  }

  private async deferUntilSnapshotReady(
    input: IssueRemoteRunInput,
    configRevision: number,
  ): Promise<AcceptedRunResponse> {
    const ack = this.snapshotAcks.find(input.orgId, input.nodeId);
    const online = this.hub.hasPeer(input.nodeId);
    if (ack?.status === 'incompatible' && ack.revision === configRevision) {
      throw new ThreadValidationException(
        `node ${input.nodeId} rejected org config revision ${configRevision}; update Harnesys on that machine`,
      );
    }
    if (online) {
      this.buildSnapshot.pushToNode(input.orgId, input.nodeId);
    }
    const placement = input.placement;
    const profileId = placement && 'request' in placement ? placement.request.profileId : 'default';
    const profileSource =
      placement && 'request' in placement ? placement.request.profileSource : 'organization';
    const reason = online
      ? `syncing org config revision ${configRevision} to node ${input.nodeId}`
      : `node ${input.nodeId} offline; waiting to sync org config revision ${configRevision}`;
    const runId = input.runId ?? randomUUID();
    const candidatesJson = JSON.stringify(placement?.candidates ?? []);
    return await this.issueWaiting.execute({
      orgId: input.orgId,
      threadId: input.threadId,
      runId,
      profileId,
      agentId: input.agent.id,
      priority: 3,
      trigger: { kind: 'chat', id: input.threadId },
      reason,
      attribution: input.attribution,
      candidatesJson,
      configRevision,
      placementEvent: toPlacementEvent(
        placement ?? {
          kind: 'unavailable',
          request: {
            runId,
            profileId,
            profileSource,
            requiredSources: [],
          },
          candidates: [],
          reason,
        },
      ),
      text: input.text,
      effort: input.effort,
      mode: input.mode,
      ...(input.skills ? { skills: input.skills } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
      ...(input.attachmentMetas ? { attachmentMetas: input.attachmentMetas } : {}),
      clientEventId: input.clientEventId,
      correlationId: input.correlationId,
      sourceId: input.sourceId,
      worktreeId: input.worktreeId,
      profileSource,
    });
  }
}

function remoteUserEvents(
  input: IssueRemoteRunInput,
  clientEventId: string,
  attachmentMetas: TaskEnvelopeAttachment[],
) {
  return [
    {
      type: 'user' as const,
      text: input.text ?? '',
      clientEventId,
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(attachmentMetas.length > 0
        ? {
            attachments: attachmentMetas.map((item) => ({
              id: item.id,
              kind: item.kind,
              name: item.name,
              mediaType: item.mediaType,
              path: item.id,
            })),
          }
        : {}),
    },
    ...(input.placement ? [toPlacementEvent(input.placement)] : []),
  ];
}

function buildRemoteEnvelope(args: {
  input: IssueRemoteRunInput;
  runId: string;
  leaseEpoch: number;
  expiresAt: string;
  relayLastSeq: number;
  configRevision: number;
  attachmentMetas: TaskEnvelopeAttachment[];
  modeShellSpec?: Record<string, unknown>;
}): TaskEnvelope {
  const { input } = args;
  return {
    threadId: input.threadId,
    runId: args.runId,
    agentId: input.agent.id,
    secretNames: input.agent.secretNames,
    varNames: [],
    leaseEpoch: args.leaseEpoch,
    expiresAt: args.expiresAt,
    inputText: input.text ?? '',
    relayLastSeq: args.relayLastSeq,
    configRevision: args.configRevision,
    attachments: args.attachmentMetas,
    attribution: input.attribution,
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(args.modeShellSpec ? { modeShellSpec: args.modeShellSpec } : {}),
    ...(input.directory ? { directory: input.directory } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
    ...(input.isolation?.mode === 'container' ? { isolation: input.isolation } : {}),
  };
}

function assertEnvelopeNamesOnly(envelope: TaskEnvelope): void {
  const json = JSON.stringify(envelope);
  if (/"values"\s*:/.test(json)) {
    throw new Error('task envelope must not include secret values');
  }
}
