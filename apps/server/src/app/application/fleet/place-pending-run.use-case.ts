import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { TaskEnvelope, TaskEnvelopeAttachment } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import type { PendingPlacement } from '../../domain/fleet/pending-placement.ts';
import type { PlacementResult } from '../../domain/fleet/placement.ts';
import { WORK_CLAIM_LEASE_SEC } from '../../domain/fleet/work-claim.constants.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { modeShellSpecOf } from '../../domain/mode-presets/preset-shell-merge.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toPlacementEvent } from '../threads/resolve-run-placement.ts';
import { runModeOf } from '../threads/thread.helpers.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';

export interface PlacePendingRunInput {
  orgId: string;
  pending: PendingPlacement;
  decision: Extract<PlacementResult, { kind: 'selected' }>;
  leaseEpoch?: number;
}

@Injectable()
export class PlacePendingRunUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly events: FleetEventsPort,
    private readonly pending: PendingPlacementPort,
    private readonly buildSnapshot: BuildOrgExecutionSnapshotUseCase,
    private readonly snapshotAcks: NodeSnapshotAckPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly modes: ModePresetRegistryPort,
  ) {}

  async execute(input: PlacePendingRunInput): Promise<'placed' | 'skipped'> {
    const lifecycle = await this.executor.lifecycle(input.orgId);
    const record = await lifecycle.get(input.pending.runId);
    if (record?.status !== 'waiting') {
      this.pending.remove(input.orgId, input.pending.runId);
      return 'skipped';
    }
    const agent = this.resolveAgent(input);
    const runEvents = await this.executor.events(input.orgId);
    await runEvents.appendForThread(input.pending.threadId, input.pending.runId, [
      toPlacementEvent(input.decision),
    ]);
    if (input.decision.nodeId === this.machineConfig.get().id) {
      return this.placeLocally(input);
    }
    const snapshot = this.buildSnapshot.execute(input.orgId);
    if (!this.ensureRemoteReady(input, snapshot.revision)) {
      return 'skipped';
    }
    return this.placeRemotely(input, agent, snapshot.revision);
  }

  private resolveAgent(input: PlacePendingRunInput) {
    const agentId =
      input.pending.payload.agentId || this.threadAgentId(input.orgId, input.pending.threadId);
    const agent = this.agents.findById(input.orgId, agentId);
    if (!agent) {
      throw new ThreadValidationException('agent not found for pending placement');
    }
    return agent;
  }

  private async placeLocally(input: PlacePendingRunInput): Promise<'placed'> {
    this.pending.remove(input.orgId, input.pending.runId);
    await this.executor.retry(input.orgId, input.pending.runId);
    this.events.emit(input.orgId);
    return 'placed';
  }

  private ensureRemoteReady(input: PlacePendingRunInput, revision: number): boolean {
    if (this.snapshotAcks.isReadyForRevision(input.orgId, input.decision.nodeId, revision)) {
      return true;
    }
    if (this.hub.hasPeer(input.decision.nodeId)) {
      this.buildSnapshot.pushToNode(input.orgId, input.decision.nodeId);
    }
    return false;
  }

  private async placeRemotely(
    input: PlacePendingRunInput,
    agent: AgentRecord,
    configRevision: number,
  ): Promise<'placed' | 'skipped'> {
    const existingClaim = this.claims.findByRun(input.orgId, input.pending.runId);
    const leaseEpoch = input.leaseEpoch ?? (existingClaim ? existingClaim.leaseEpoch + 1 : 1);
    const expiresAt = new Date(Date.now() + WORK_CLAIM_LEASE_SEC * 1000).toISOString();
    const claim = this.claims.grant({
      orgId: input.orgId,
      runId: input.pending.runId,
      nodeId: input.decision.nodeId,
      leaseEpoch,
      leaseUntil: expiresAt,
      token: randomUUID(),
    });
    if (!claim) {
      return 'skipped';
    }
    const after = await (await this.executor.lifecycle(input.orgId)).get(input.pending.runId);
    const envelope = this.buildEnvelope({
      input,
      agentId: agent.id,
      secretNames: agent.secretNames,
      leaseEpoch,
      expiresAt,
      relayLastSeq: after?.lastSeq ?? 0,
      configRevision,
    });
    const command = { type: 'RUN_PLACE' as const, envelope };
    this.commands.enqueue(input.orgId, input.decision.nodeId, command);
    this.hub.routeCommand(input.decision.nodeId, command);
    this.pending.remove(input.orgId, input.pending.runId);
    this.events.emit(input.orgId);
    return 'placed';
  }

  private buildEnvelope(args: {
    input: PlacePendingRunInput;
    agentId: string;
    secretNames: string[];
    leaseEpoch: number;
    expiresAt: string;
    relayLastSeq: number;
    configRevision: number;
  }): TaskEnvelope {
    const { input, agentId, secretNames, leaseEpoch, expiresAt, relayLastSeq, configRevision } =
      args;
    const attachments: TaskEnvelopeAttachment[] = input.pending.payload.attachmentMetas ?? [];
    const isolation = input.decision.request.isolation;
    const thread = this.threads.findById(input.orgId, input.pending.threadId);
    const modeShellSpec = modeShellSpecOf(
      this.modes,
      input.orgId,
      thread ? runModeOf(thread) : undefined,
    );
    return {
      threadId: input.pending.threadId,
      runId: input.pending.runId,
      agentId,
      secretNames,
      varNames: [],
      leaseEpoch,
      expiresAt,
      inputText: input.pending.payload.text,
      relayLastSeq,
      configRevision,
      attachments,
      attribution: input.pending.payload.attribution,
      ...(input.pending.payload.effort ? { effort: input.pending.payload.effort } : {}),
      ...(input.pending.payload.mode ? { mode: input.pending.payload.mode } : {}),
      ...(modeShellSpec ? { modeShellSpec } : {}),
      ...(input.pending.payload.sourceId ? { sourceId: input.pending.payload.sourceId } : {}),
      ...(input.pending.payload.worktreeId ? { worktreeId: input.pending.payload.worktreeId } : {}),
      ...(isolation?.mode === 'container' ? { isolation } : {}),
    };
  }

  private threadAgentId(orgId: string, threadId: string): string {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread) {
      throw new ThreadValidationException(`thread not found: ${threadId}`);
    }
    return thread.agentId;
  }
}
