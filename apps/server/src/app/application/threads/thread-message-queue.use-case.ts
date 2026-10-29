import { HttpException, Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import type { Attachment } from 'harnesys';
import type { ThreadQueueEnqueueBody } from '../../api/rest/thread-message-queue.schema.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import { threadsTable } from '../../infra/org-sqlite/schema/index.ts';
import type { QueuedThreadMessage } from '../../infra/org-sqlite/thread-message-queue.store.ts';
import {
  deleteQueuedThreadMessage,
  enqueueThreadMessage,
  listQueuedThreadMessages,
} from '../../infra/org-sqlite/thread-message-queue.store.ts';

export interface ThreadMessageQueueResponse {
  items: QueuedThreadMessage[];
}

export interface ThreadMessageQueueRequest {
  orgId: string;
  threadId: string;
}

export interface ThreadMessageEnqueueRequest extends ThreadMessageQueueRequest {
  body: ThreadQueueEnqueueBody;
}

export interface ThreadMessageQueueItemRequest extends ThreadMessageQueueRequest {
  itemId: string;
}

@Injectable()
export class ThreadMessageQueueUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async enqueue(request: ThreadMessageEnqueueRequest): Promise<ThreadMessageQueueResponse> {
    this.assertThread(request.orgId, request.threadId);
    const uploaded = (request.body.attachments ?? []) as Attachment[];
    withOrgSqlite(this.layout, request.orgId, (db) =>
      enqueueThreadMessage(db, {
        threadId: request.threadId,
        text: request.body.text,
        ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
        ...(request.body.origin ? { origin: request.body.origin } : {}),
        ...(request.body.clientEventId ? { clientEventId: request.body.clientEventId } : {}),
      }),
    );
    await this.executor.drainMessageQueue(request.orgId, request.threadId);
    return this.list(request);
  }

  async deliver(request: ThreadMessageQueueItemRequest): Promise<ThreadMessageQueueResponse> {
    const queued = withOrgSqlite(this.layout, request.orgId, (db) =>
      listQueuedThreadMessages(db, request.threadId),
    );
    if (!queued.some((item) => item.itemId === request.itemId)) {
      throw new HttpException(
        404,
        'QUEUE_ITEM_NOT_FOUND',
        `queued message not found or already delivered: ${request.itemId}`,
      );
    }
    const result = await this.executor.drainMessageQueue(request.orgId, request.threadId);
    if (result.status === 'busy' && result.reason === 'pending_ask') {
      throw new HttpException(409, 'pending_ask', `thread ${request.threadId} has a pending ask`);
    }
    return this.list(request);
  }

  list(request: ThreadMessageQueueRequest): Promise<ThreadMessageQueueResponse> {
    const items = withOrgSqlite(this.layout, request.orgId, (db) =>
      listQueuedThreadMessages(db, request.threadId),
    );
    return Promise.resolve({ items });
  }

  async remove(request: ThreadMessageQueueItemRequest): Promise<void> {
    const removed = withOrgSqlite(this.layout, request.orgId, (db) =>
      deleteQueuedThreadMessage(db, request.threadId, request.itemId),
    );
    if (removed.length === 0) {
      throw new HttpException(
        404,
        'QUEUE_ITEM_NOT_FOUND',
        `queued message not found or already delivered: ${request.itemId}`,
      );
    }
  }

  private assertThread(orgId: string, threadId: string): void {
    const found = withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ id: threadsTable.id })
        .from(threadsTable)
        .where(eq(threadsTable.id, threadId))
        .get(),
    );
    if (!found) {
      throw new ThreadNotFoundException(threadId);
    }
  }
}
