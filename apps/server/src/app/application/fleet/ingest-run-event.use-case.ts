import { Injectable, Logger } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { approvalRequestForPark, observeParks } from '../../domain/approval/park-observer.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { WORK_CLAIM_LEASE_SEC } from '../../domain/fleet/work-claim.constants.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface IngestRunEventInput {
  orgId: string;
  nodeId: string;
  runId: string;
  leaseEpoch: number;
  fromSeq: number;
  events: Array<Record<string, unknown>>;
}

export interface IngestRunEventResult {
  accepted: number;
  lastSeq: number;
}

@Injectable()
export class IngestRunEventUseCase {
  private readonly log: Logger;

  constructor(
    private readonly claims: EventClaimPort,
    private readonly executor: LocalExecutorPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly approvals: ApprovalStorePort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly fleetEvents: FleetEventsPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly issueExecutions: IssueExecutionPort,
    logger: Logger,
  ) {
    this.log = logger.child('ingest-run-event');
  }

  async execute(input: IngestRunEventInput): Promise<IngestRunEventResult> {
    const claim = this.claims.findByRun(input.orgId, input.runId);
    const now = new Date().toISOString();
    if (
      !claim ||
      claim.nodeId !== input.nodeId ||
      claim.doneAt !== null ||
      claim.leaseUntil <= now ||
      claim.leaseEpoch !== input.leaseEpoch
    ) {
      return { accepted: 0, lastSeq: 0 };
    }
    const lifecycle = await this.executor.lifecycle(input.orgId);
    const events = await this.executor.events(input.orgId);
    const record = await lifecycle.get(input.runId);
    if (!record) {
      return { accepted: 0, lastSeq: 0 };
    }
    if (record.status === 'waiting') {
      await lifecycle.transition(input.runId, record.leaseEpoch, {
        from: 'waiting',
        to: 'running',
      });
    }
    const fresh = await lifecycle.get(input.runId);
    if (!fresh) {
      return { accepted: 0, lastSeq: 0 };
    }
    const lastSeq = fresh.lastSeq;
    const incoming = normalizeEvents(input.events, input.runId).filter(
      (event) => (event.seq ?? 0) > Math.max(lastSeq, input.fromSeq),
    );
    if (incoming.length === 0) {
      return { accepted: 0, lastSeq };
    }
    const stored = await Promise.resolve(
      events.appendForThread(fresh.threadId, input.runId, incoming),
    );
    this.claims.renew({
      orgId: input.orgId,
      runId: input.runId,
      nodeId: input.nodeId,
      leaseEpoch: input.leaseEpoch,
      leaseUntil: new Date(Date.now() + WORK_CLAIM_LEASE_SEC * 1000).toISOString(),
    });
    await this.executor.publishEvents(input.orgId, input.runId, stored);
    this.requestApprovalsForParks(input.orgId, fresh.threadId, input.runId, stored);
    const terminal = incoming.some(
      (event) =>
        event.type === 'run.completed' ||
        event.type === 'run.failed' ||
        event.type === 'run.cancelled' ||
        event.type === 'done',
    );
    if (terminal) {
      const released = this.claims.markDone(input.orgId, input.runId, input.nodeId, now);
      if (released) {
        this.fleetEvents.emit(input.orgId);
      }
      this.worktrees.clearActiveRun(input.orgId, input.runId, now);
      this.issueExecutions.releaseByRunId(input.orgId, input.runId, now);
      const after = await lifecycle.get(input.runId);
      if (after && after.status === 'running') {
        const to = terminalStatusOf(incoming);
        await lifecycle.transition(input.runId, after.leaseEpoch, { from: 'running', to });
      }
    }
    const latest = await events.latestSeq(input.runId);
    return { accepted: stored.length, lastSeq: latest };
  }

  private requestApprovalsForParks(
    orgId: string,
    threadId: string,
    runId: string,
    events: SessionEvent[],
  ): void {
    observeParks(threadId, runId, events, (park) => {
      try {
        const thread = this.threads.findById(orgId, park.threadId);
        const input = approvalRequestForPark(park, thread);
        const { id } = this.approvals.request(orgId, input);
        const row = this.approvals.get(orgId, id);
        if (row) {
          this.approvalEvents.emit(orgId, { type: 'requested', approval: row });
        }
      } catch (error) {
        this.log.warn({ error, orgId, runId, askId: park.askId }, 'park approval request failed');
      }
    });
  }
}

function normalizeEvents(events: Array<Record<string, unknown>>, runId: string): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const raw of events) {
    if (typeof raw.type !== 'string') {
      continue;
    }
    const seq = typeof raw.seq === 'number' ? raw.seq : undefined;
    out.push({ ...raw, type: raw.type, runId, seq } as SessionEvent);
  }
  return out;
}

function terminalStatusOf(events: SessionEvent[]): 'completed' | 'cancelled' | 'failed' {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i]?.type;
    if (type === 'run.completed') {
      return 'completed';
    }
    if (type === 'run.cancelled') {
      return 'cancelled';
    }
    if (type === 'run.failed') {
      return 'failed';
    }
  }
  return 'failed';
}
