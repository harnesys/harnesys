import { Injectable, Logger } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import {
  decidePendingReconcile,
  type PendingPlacement,
  sortPendingPlacements,
} from '../../domain/fleet/pending-placement.ts';
import type { PlacementResult } from '../../domain/fleet/placement.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { resolveRunPlacement, toPlacementEvent } from '../threads/resolve-run-placement.ts';
import { PlacePendingRunUseCase } from './place-pending-run.use-case.ts';

export interface ReschedulePlacementQueueInput {
  orgId: string;
  profileId?: string;
}

@Injectable()
export class ReschedulePlacementQueueUseCase {
  private readonly log: Logger;
  private readonly inflight = new Set<string>();

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly pending: PendingPlacementPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly hub: FleetHubPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly executor: LocalExecutorPort,
    private readonly placePending: PlacePendingRunUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('placement-queue');
  }

  async reconcileAll(): Promise<void> {
    for (const entry of this.orgs.list()) {
      if (entry.role !== 'relay') {
        continue;
      }
      await this.execute({ orgId: entry.orgId });
    }
  }

  async execute(input: ReschedulePlacementQueueInput): Promise<void> {
    const key = `${input.orgId}:${input.profileId ?? '*'}`;
    if (this.inflight.has(key)) {
      return;
    }
    this.inflight.add(key);
    try {
      await this.run(input);
    } finally {
      this.inflight.delete(key);
    }
  }

  private async run(input: ReschedulePlacementQueueInput): Promise<void> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const rows = input.profileId
      ? this.pending.listByProfile(input.orgId, input.profileId)
      : this.pending.listByOrg(input.orgId);
    const ordered = sortPendingPlacements(rows, nowMs);
    const claimedNodes = new Set<string>();
    for (const row of ordered) {
      try {
        const handled = await this.handleOne(input.orgId, row, nowIso, claimedNodes);
        if (handled === 'placed') {
          // continue — other profiles/runs may still place on different nodes
        }
      } catch (err) {
        this.log.warn(
          {
            orgId: input.orgId,
            runId: row.runId,
            err: err instanceof Error ? err.message : String(err),
          },
          'placement reschedule failed',
        );
      }
    }
  }

  private async handleOne(
    orgId: string,
    row: PendingPlacement,
    nowIso: string,
    claimedNodes: Set<string>,
  ): Promise<'placed' | 'waiting' | 'removed'> {
    const lifecycle = await this.executor.lifecycle(orgId);
    const record = await lifecycle.get(row.runId);
    const claim = this.claims.findByRun(orgId, row.runId);
    const hasCommand = claim
      ? this.commands
          .list(orgId, claim.nodeId)
          .some(
            (item) =>
              item.command.type === 'RUN_PLACE' && item.command.envelope.runId === row.runId,
          )
      : false;
    const action = decidePendingReconcile({
      runStatus: record?.status ?? null,
      pending: row,
      claim,
      hasCommand,
      nowIso,
    });
    if (action.kind === 'delete') {
      if (row.expiresAt !== null && row.expiresAt <= nowIso && record?.status === 'waiting') {
        await lifecycle.transition(row.runId, record.leaseEpoch, {
          from: 'waiting',
          to: 'failed',
          events: [{ type: 'run.failed', message: 'miss_stale' }],
        });
      }
      this.pending.remove(orgId, row.runId);
      return 'removed';
    }
    if (action.kind === 'reenqueue' && claim) {
      const decision = this.resolve(orgId, row);
      if (decision.kind !== 'selected' || decision.nodeId !== action.nodeId) {
        return this.keepWaiting(orgId, row, decision);
      }
      await this.placePending.execute({
        orgId,
        pending: row,
        decision,
        leaseEpoch: action.leaseEpoch,
      });
      claimedNodes.add(decision.nodeId);
      return 'placed';
    }
    if (action.kind === 'noop') {
      return 'waiting';
    }
    const decision = this.resolve(orgId, row);
    if (decision.kind === 'unavailable') {
      return this.keepWaiting(orgId, row, decision);
    }
    if (claimedNodes.has(decision.nodeId)) {
      return 'waiting';
    }
    const placed = await this.placePending.execute({ orgId, pending: row, decision });
    if (placed === 'placed') {
      claimedNodes.add(decision.nodeId);
      return 'placed';
    }
    return 'waiting';
  }

  private resolve(orgId: string, row: PendingPlacement): PlacementResult {
    const thread = this.threads.findById(orgId, row.threadId);
    const agentId = row.payload.agentId || thread?.agentId;
    const agent = agentId ? this.agents.findById(orgId, agentId) : null;
    if (!agent) {
      return {
        kind: 'unavailable',
        request: {
          runId: row.runId,
          profileId: row.profileId,
          profileSource: row.payload.profileSource ?? 'organization',
          requiredSources: [],
        },
        candidates: [],
        reason: 'agent missing for pending placement',
      };
    }
    const worktreeHostId = this.worktreeHostIdOf(orgId, row);
    return resolveRunPlacement({
      orgId,
      runId: row.runId,
      agentProfileId: agent.executionProfileId,
      issueRuleProfileId: row.payload.issueRuleProfileId,
      worktreeHostId,
      profiles: this.profiles,
      hub: this.hub,
      claims: this.claims,
    });
  }

  private worktreeHostIdOf(orgId: string, row: PendingPlacement): string | null {
    const worktreeId = row.payload.worktreeId;
    if (worktreeId) {
      const bound = this.worktrees.findById(orgId, worktreeId);
      if (bound?.hostId) {
        return bound.hostId;
      }
    }
    return row.payload.worktreeHostId ?? null;
  }

  private async keepWaiting(
    orgId: string,
    row: PendingPlacement,
    decision: PlacementResult,
  ): Promise<'waiting'> {
    const reason =
      decision.kind === 'unavailable' ? decision.reason : `selected ${decision.nodeId} deferred`;
    const candidatesJson = JSON.stringify(decision.candidates);
    const revision = this.revisions.get(orgId)?.revision ?? row.configRevision;
    if (reason !== row.lastReason || candidatesJson !== row.lastCandidatesJson) {
      const events = await this.executor.events(orgId);
      const worktreeHostId = this.worktreeHostIdOf(orgId, row);
      await events.appendForThread(row.threadId, row.runId, [
        toPlacementEvent(decision, {
          ...(row.payload.worktreeId ? { worktreeId: row.payload.worktreeId } : {}),
          ...(worktreeHostId ? { worktreeHostId } : {}),
        }),
      ]);
    }
    this.pending.updateReason(orgId, row.runId, {
      lastReason: reason,
      attempt: row.attempt + 1,
      configRevision: revision,
      lastCandidatesJson: candidatesJson,
    });
    return 'waiting';
  }
}
