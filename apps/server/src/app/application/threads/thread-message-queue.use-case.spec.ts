import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@harnesys/brix';
import type { ThreadQueueDrainResult } from '../../domain/thread/local-executor.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import { enqueueThreadMessage } from '../../infra/org-sqlite/thread-message-queue.store.ts';
import { StubLayout } from '../../infra/runtime/prepare-org-target.fixtures.ts';
import { ThreadMessageQueueUseCase } from './thread-message-queue.use-case.ts';

function queueUseCase(layout: TempLayout, executor: LocalExecutorPort): ThreadMessageQueueUseCase {
  return new ThreadMessageQueueUseCase(layout, executor);
}

function seedThread(layout: TempLayout, orgId: string, threadId: string): void {
  withOrgSqlite(layout, orgId, () => {});
  const raw = new Database(layout.orgDbPath(orgId));
  try {
    raw.exec('PRAGMA foreign_keys = OFF;');
    raw.exec(
      `INSERT OR IGNORE INTO threads (id, org_id, agent_id, origin_agent_id, title, kind, metadata, created_at, updated_at, last_read_at)
       VALUES ('${threadId}', '${orgId}', 'agent-1', 'agent-1', 't', 'chat', '{}', datetime('now'), datetime('now'), datetime('now'))`,
    );
  } finally {
    raw.close();
  }
}

class TempLayout extends StubLayout {
  constructor(private readonly dir: string) {
    super(dir);
  }
  override orgDbPath(orgId?: string): string {
    return join(this.dir, `${orgId ?? ''}.db`);
  }
  override ensureOrgDir(): void {}
}

interface ExecutorStub {
  drain: ThreadQueueDrainResult;
}

class StubExecutor extends LocalExecutorPort {
  constructor(private readonly stub: ExecutorStub) {
    super();
  }
  drainMessageQueue(): Promise<ThreadQueueDrainResult> {
    return Promise.resolve(this.stub.drain);
  }
  lifecycle = (): Promise<never> => Promise.reject(new Error('not used'));
  events = (): Promise<never> => Promise.reject(new Error('not used'));
  sessionFor = (): Promise<never> => Promise.reject(new Error('not used'));
  send = (): Promise<never> => Promise.reject(new Error('not used'));
  compact = (): Promise<never> => Promise.reject(new Error('not used'));
  cancel = (): Promise<never> => Promise.reject(new Error('not used'));
  retry = (): Promise<never> => Promise.reject(new Error('not used'));
  truncateThreadFrom = (): Promise<never> => Promise.reject(new Error('not used'));
  removeThreadEvent = (): Promise<never> => Promise.reject(new Error('not used'));
  stream = (): Promise<never> => Promise.reject(new Error('not used'));
  publishEvents = (): Promise<never> => Promise.reject(new Error('not used'));
  tickWaitTimers = (): Promise<never> => Promise.reject(new Error('not used'));
  countWaitingTimers = (): Promise<never> => Promise.reject(new Error('not used'));
  listMcpServers = (): Promise<never> => Promise.reject(new Error('not used'));
  invalidateRuntime = (): Promise<never> => Promise.reject(new Error('not used'));
}

const root = mkdtempSync(join(tmpdir(), 'tmq-'));
const layout = new TempLayout(root);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('thread message queue deliver', () => {
  test('deliver on busy running run keeps the item queued for steering', async () => {
    const stub: ExecutorStub = { drain: { status: 'busy' } };
    const useCase = queueUseCase(layout, new StubExecutor(stub));
    seedThread(layout, 'org-1', 'thread-1');
    withOrgSqlite(layout, 'org-1', (db) => {
      enqueueThreadMessage(db, { threadId: 'thread-1', text: 'steer me' });
    });
    const queued = await useCase.list({ orgId: 'org-1', threadId: 'thread-1' });
    await useCase.deliver({
      orgId: 'org-1',
      threadId: 'thread-1',
      itemId: queued.items[0]?.itemId ?? '',
    });
    const items = await useCase.list({ orgId: 'org-1', threadId: 'thread-1' });
    expect(items.items).toHaveLength(1);
  });

  test('deliver with unknown item returns 404', async () => {
    const stub: ExecutorStub = { drain: { status: 'busy' } };
    const useCase = queueUseCase(layout, new StubExecutor(stub));
    const error = await useCase
      .deliver({ orgId: 'org-1', threadId: 'thread-1', itemId: 'missing' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).errorCode).toBe('QUEUE_ITEM_NOT_FOUND');
  });

  test('needs_input run returns 409 pending_ask', async () => {
    const stub: ExecutorStub = { drain: { status: 'busy', reason: 'pending_ask' } };
    const useCase = queueUseCase(layout, new StubExecutor(stub));
    seedThread(layout, 'org-1', 'thread-1');
    withOrgSqlite(layout, 'org-1', (db) => {
      enqueueThreadMessage(db, { threadId: 'thread-1', text: 'hold' });
    });
    const items = await useCase.list({ orgId: 'org-1', threadId: 'thread-1' });
    const itemId = items.items[0]?.itemId ?? '';
    const error = await useCase
      .deliver({ orgId: 'org-1', threadId: 'thread-1', itemId })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).errorCode).toBe('pending_ask');
  });
});
