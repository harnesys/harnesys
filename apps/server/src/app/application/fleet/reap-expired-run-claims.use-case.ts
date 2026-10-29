import { Injectable } from '@harnesys/brix';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import {
  isWorkerOwnedRunStatus,
  WORKER_LEASE_EXPIRED_MESSAGE,
} from '../../domain/fleet/expired-claim-reaping.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface ReapExpiredRunClaimsInput {
  orgId: string;
}

export interface ReapExpiredRunClaimsResult {
  reaped: number;
}

@Injectable()
export class ReapExpiredRunClaimsUseCase {
  constructor(
    private readonly claims: EventClaimPort,
    private readonly executor: LocalExecutorPort,
    private readonly pending: PendingPlacementPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly issueExecutions: IssueExecutionPort,
  ) {}

  async execute(input: ReapExpiredRunClaimsInput): Promise<ReapExpiredRunClaimsResult> {
    const now = new Date().toISOString();
    const expired = this.claims.findExpired(input.orgId, now);
    let reaped = 0;
    for (const claim of expired) {
      if (await this.reapRun(input.orgId, claim.runId)) {
        reaped += 1;
      }
    }
    if (reaped > 0) {
      this.claims.releaseExpired(input.orgId, now);
    }
    return { reaped };
  }

  private async reapRun(orgId: string, runId: string): Promise<boolean> {
    const lifecycle = await this.executor.lifecycle(orgId).catch(() => null);
    if (lifecycle === null) {
      return false;
    }
    const record = await lifecycle.get(runId).catch(() => null);
    if (record === null || !isWorkerOwnedRunStatus(record.status)) {
      return false;
    }
    const now = new Date().toISOString();
    try {
      await lifecycle.transition(record.runId, record.leaseEpoch, {
        from: record.status,
        to: 'failed',
        interruptId: null,
        waitFireAt: null,
        events: [{ type: 'run.failed', message: WORKER_LEASE_EXPIRED_MESSAGE }],
      });
    } catch {
      return false;
    }
    this.pending.remove(orgId, record.runId);
    this.worktrees.clearActiveRun(orgId, record.runId, now);
    this.issueExecutions.releaseByRunId(orgId, record.runId, now);
    return true;
  }
}
