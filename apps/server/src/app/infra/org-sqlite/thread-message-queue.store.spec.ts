import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import type { AcceptedRunResponse } from '@harnesys/contracts';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { RunRecord } from 'harnesys';
import { createSteeringChannel, drainThreadMessageQueue } from '../runtime/org-runtime-queue.ts';
import type { SendThreadMessageInput } from '../runtime/org-runtime-runs.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import * as schema from './schema/index.ts';
import { threadsTable } from './schema/index.ts';
import {
  deleteQueuedThreadMessage,
  enqueueThreadMessage,
  listQueuedThreadMessages,
  markThreadMessageDelivered,
} from './thread-message-queue.store.ts';

interface TestHarness {
  sqlite: Database;
  db: OrgSqliteDb;
  sends: SendThreadMessageInput[];
  busy: boolean;
  needsInput: boolean;
  drain: (threadId: string) => ReturnType<typeof drainThreadMessageQueue>;
}

function setup(): TestHarness {
  const sqlite = new Database(':memory:');
  ensureOrgSchema((sql) => sqlite.exec(sql));
  const db = drizzle(sqlite, { schema });
  db.insert(threadsTable)
    .values({
      id: 'thread-1',
      orgId: 'org-1',
      agentId: 'agent-1',
      originAgentId: 'agent-1',
      title: 't',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    })
    .run();
  const harness: TestHarness = {
    sqlite,
    db,
    sends: [],
    busy: false,
    needsInput: false,
    drain: () => {
      throw new Error('not wired');
    },
  };
  const lifecycle = {
    activeByThread: (threadId: string): Promise<RunRecord | null> =>
      Promise.resolve(
        harness.busy
          ? {
              runId: 'run-active',
              threadId,
              status: harness.needsInput ? 'needs_input' : 'running',
              attempt: 1,
              leaseEpoch: 1,
              lastSeq: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null,
      ),
  };
  const send = (input: SendThreadMessageInput): Promise<AcceptedRunResponse> => {
    if (harness.busy) {
      throw Object.assign(new Error('thread busy'), { code: 'thread_busy' });
    }
    harness.sends.push(input);
    return Promise.resolve({
      runId: `run-${harness.sends.length}`,
      threadId: input.threadId,
      status: 'queued',
    });
  };
  harness.drain = (threadId) => drainThreadMessageQueue({ db, lifecycle, send }, threadId);
  return harness;
}

function enqueue(harness: TestHarness, text: string, offsetMs = 0): string {
  const id = enqueueThreadMessage(harness.db, { threadId: 'thread-1', text });
  if (offsetMs > 0 && id !== null) {
    harness.sqlite
      .query('UPDATE thread_message_queue SET queued_at = ? WHERE item_id = ?')
      .run(new Date(Date.now() + offsetMs).toISOString(), id);
  }
  return id ?? '';
}

describe('thread message queue', () => {
  test('drain delivers head as a run when idle and clears the queue', async () => {
    const h = setup();
    enqueue(h, 'hello');
    const result = await h.drain('thread-1');
    expect(result).toEqual({ status: 'delivered', runId: 'run-1' });
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0]?.text).toBe('hello');
    const items = listQueuedThreadMessages(h.db, 'thread-1');
    expect(items).toHaveLength(0);
    expect(await h.drain('thread-1')).toEqual({ status: 'empty' });
  });

  test('drain keeps the item queued with delivered_at unset while busy', async () => {
    const h = setup();
    h.busy = true;
    enqueue(h, 'hello');
    const result = await h.drain('thread-1');
    expect(result).toEqual({ status: 'busy' });
    expect(h.sends).toHaveLength(0);
    const items = listQueuedThreadMessages(h.db, 'thread-1');
    expect(items).toHaveLength(1);
    expect(items[0]?.deliveredAt).toBeNull();
  });

  test('drain delivers items in FIFO order of queued_at', async () => {
    const h = setup();
    enqueue(h, 'first');
    enqueue(h, 'second', 50);
    const result = await h.drain('thread-1');
    expect(result.status).toBe('delivered');
    expect(h.sends.map((s) => s.text)).toEqual(['first']);
    await h.drain('thread-1');
    expect(h.sends.map((s) => s.text)).toEqual(['first', 'second']);
  });

  test('delete removes undelivered item; duplicate clientEventId is idempotent', async () => {
    const h = setup();
    const first = enqueueThreadMessage(h.db, {
      threadId: 'thread-1',
      text: 'one',
      clientEventId: 'ce-1',
    });
    expect(first).not.toBeNull();
    const dup = enqueueThreadMessage(h.db, {
      threadId: 'thread-1',
      text: 'one',
      clientEventId: 'ce-1',
    });
    expect(dup).toBeNull();
    expect(listQueuedThreadMessages(h.db, 'thread-1')).toHaveLength(1);
    const itemId = listQueuedThreadMessages(h.db, 'thread-1')[0]?.itemId ?? '';
    expect(deleteQueuedThreadMessage(h.db, 'thread-1', itemId)).toHaveLength(1);
    expect(deleteQueuedThreadMessage(h.db, 'thread-1', itemId)).toHaveLength(0);
    expect(listQueuedThreadMessages(h.db, 'thread-1')).toHaveLength(0);
  });

  test('steer returns undelivered items FIFO; ack marks them delivered', async () => {
    const h = setup();
    enqueue(h, 'first');
    enqueue(h, 'second', 50);
    enqueue(h, 'delivered-already');
    const deliveredItem = listQueuedThreadMessages(h.db, 'thread-1').find(
      (i) => i.text === 'delivered-already',
    );
    markThreadMessageDelivered(h.db, deliveredItem?.itemId ?? '', new Date().toISOString());
    const channel = createSteeringChannel(h.db);
    const steered = await channel.steer('thread-1');
    expect(steered.map((m) => m.text)).toEqual(['first', 'second']);
    await channel.ack(steered.map((m) => m.itemId ?? ''));
    const items = listQueuedThreadMessages(h.db, 'thread-1');
    expect(items).toHaveLength(0);
  });

  test('steer with empty queue returns [] and marks nothing', async () => {
    const h = setup();
    const channel = createSteeringChannel(h.db);
    expect(await channel.steer('thread-1')).toEqual([]);
    enqueue(h, 'later');
    expect(await channel.steer('thread-2')).toEqual([]);
    expect(listQueuedThreadMessages(h.db, 'thread-1')[0]?.deliveredAt).toBeNull();
  });

  test('drain reports pending_ask reason when the active run needs input', async () => {
    const h = setup();
    h.busy = true;
    h.needsInput = true;
    enqueue(h, 'hello');
    const result = await h.drain('thread-1');
    expect(result).toEqual({ status: 'busy', reason: 'pending_ask' });
  });
});
