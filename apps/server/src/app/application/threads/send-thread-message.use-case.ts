import { Injectable } from '@harnesys/brix';
import type { AcceptedRunResponse } from '@harnesys/contracts';
import type { Attachment, SessionEvent } from 'harnesys';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadInvariantException,
  ThreadNotFoundException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import {
  type EnqueueThreadMessageResult,
  enqueueThreadMessage,
} from '../../infra/org-sqlite/thread-message-queue.store.ts';
import {
  type ConversationalEventRow,
  getThreadEventRow,
  type ThreadAuthor,
} from '../../infra/org-sqlite/thread-transcript.store.ts';
import { attributedRun, auditRunStart, type RunStartAttribution } from './run-attribution.ts';

export interface SendThreadMessageRequest {
  orgId: string;
  threadId: string;
  text: string;
  attachments?: Attachment[];
  origin?: string;
  originConnectorId?: string;
  clientEventId?: string;
  author?: ThreadAuthor;
  targetAgentIds: string[];
  attribution: RunStartAttribution;
  triggerId?: string;
}

@Injectable()
export class SendThreadMessageUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly executor: LocalExecutorPort,
    private readonly audit: OrgAudit,
    private readonly threadEvents: ThreadEventsPort,
  ) {}

  async execute(request: SendThreadMessageRequest): Promise<AcceptedRunResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const attachments = request.attachments ?? [];
    const enqueued = withOrgSqlite(this.layout, request.orgId, (db) =>
      db.transaction(
        (tx) => enqueueUserMessage(tx as OrgSqliteDb, thread.id, request, attachments),
        { behavior: 'immediate' },
      ),
    );
    const threadSeq = enqueued.result.threadSeq;
    if (threadSeq === null) {
      throw new ThreadInvariantException(`send stored no message for thread ${thread.id}`, {
        threadId: thread.id,
      });
    }
    if (enqueued.row !== undefined) {
      this.threadEvents.emit(request.orgId, {
        type: 'events',
        threadId: thread.id,
        events: [toUserEvent(enqueued.row)],
      });
    }
    this.threads.touch(request.orgId, thread.id);
    if (enqueued.result.duplicate) {
      return { status: 'stored', reason: 'duplicate', threadId: thread.id, threadSeq };
    }
    if (request.targetAgentIds.length === 0) {
      return { status: 'stored', reason: 'no_responder', threadId: thread.id, threadSeq };
    }
    const drained = await this.executor.drainMessageQueue(request.orgId, thread.id);
    if (drained.status !== 'delivered') {
      return { status: 'stored', reason: 'deferred', threadId: thread.id, threadSeq };
    }
    auditRunStart(this.audit, {
      orgId: request.orgId,
      runId: drained.runId,
      attribution: attributedRun(request.attribution, null),
      triggerId: request.triggerId ?? thread.id,
    });
    return { status: 'queued', runId: drained.runId, threadId: thread.id };
  }
}

function enqueueUserMessage(
  tx: OrgSqliteDb,
  threadId: string,
  request: SendThreadMessageRequest,
  attachments: Attachment[],
): { result: EnqueueThreadMessageResult; row?: ConversationalEventRow } {
  const result = enqueueThreadMessage(tx, {
    threadId,
    text: request.text,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(request.origin ? { origin: request.origin } : {}),
    ...(request.originConnectorId ? { originConnectorId: request.originConnectorId } : {}),
    ...(request.clientEventId ? { clientEventId: request.clientEventId } : {}),
    ...(request.author ? { author: request.author } : {}),
    targetAgentIds: request.targetAgentIds,
    threadScoped: true,
  });
  if (result.threadSeq === null) {
    return { result };
  }
  const row = getThreadEventRow(tx, threadId, result.threadSeq);
  return row === undefined ? { result } : { result, row };
}

function toUserEvent(row: ConversationalEventRow): SessionEvent {
  return {
    ...row.metadata,
    type: 'user',
    threadSeq: row.threadSeq,
    conversational: true,
  } as SessionEvent;
}
