import { Injectable } from '@harnesys/brix';
import type { CancelRunResponse } from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface CancelRunRequest {
  orgId: string;
  threadId: string;
  runId: string;
}

@Injectable()
export class CancelRunUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly executor: LocalExecutorPort,
    private readonly pending: PendingPlacementPort,
    private readonly fleetEvents: FleetEventsPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly issueExecutions: IssueExecutionPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
  ) {}

  async execute(request: CancelRunRequest): Promise<CancelRunResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const rec = await lifecycle.get(request.runId);
    if (!rec || rec.threadId !== request.threadId) {
      throw new ThreadNotFoundException(request.runId);
    }
    const hadPending = this.pending.findByRun(request.orgId, request.runId) !== null;
    if (hadPending) {
      this.pending.remove(request.orgId, request.runId);
    }
    this.queueWorkerCancel(request.orgId, request.runId);
    const result = await this.executor.cancel(request.orgId, request.runId);
    const now = new Date().toISOString();
    this.worktrees.clearActiveRun(request.orgId, request.runId, now);
    this.issueExecutions.releaseByRunId(request.orgId, request.runId, now);
    if (hadPending) {
      this.fleetEvents.emit(request.orgId);
    }
    return result;
  }

  private queueWorkerCancel(orgId: string, runId: string): void {
    const claim = this.claims.findByRun(orgId, runId);
    const now = new Date().toISOString();
    if (!claim || claim.doneAt !== null || claim.leaseUntil <= now) {
      return;
    }
    this.commands.enqueue(orgId, claim.nodeId, { type: 'WORK_CANCEL', runId });
  }
}
