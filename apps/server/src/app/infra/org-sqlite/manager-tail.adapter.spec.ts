import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { StubLayout } from '../runtime/prepare-org-target.fixtures.ts';
import { ManagerTailAdapter } from './manager-tail.adapter.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { runEventsTable, runsTable, threadsTable } from './schema/index.ts';

const ORG_ID = 'org-1';
const THREAD_ID = 'thread-1';
const BASE = 1700000000000;
const ROOT = mkdtempSync(join(tmpdir(), 'manager-tail-'));

class TempLayout extends StubLayout {
  constructor(private readonly dir: string) {
    super(dir);
  }
  override orgDbPath(orgId?: string): string {
    return join(this.dir, `${orgId ?? ''}.db`);
  }
  override ensureOrgDir(): void {}
}

const layout: HostFsLayoutPort = new TempLayout(ROOT);

withOrgSqlite(layout, ORG_ID, (db) => {
  db.insert(threadsTable)
    .values({
      id: THREAD_ID,
      orgId: ORG_ID,
      title: 'journal',
      createdAt: new Date(BASE).toISOString(),
      updatedAt: new Date(BASE).toISOString(),
      lastReadAt: new Date(BASE).toISOString(),
    })
    .run();
  db.insert(runsTable)
    .values({
      runId: 'run-1',
      threadId: THREAD_ID,
      agentName: 'coder',
      status: 'completed',
      createdAt: new Date(BASE).toISOString(),
      updatedAt: new Date(BASE).toISOString(),
    })
    .run();
  db.insert(runEventsTable)
    .values([
      {
        threadId: THREAD_ID,
        threadSeq: 1,
        runId: null,
        seq: null,
        type: 'user',
        timestamp: BASE,
        metadata: JSON.stringify({ text: 'ship it' }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 2,
        runId: 'run-1',
        seq: 1,
        type: 'run.started',
        timestamp: BASE + 1,
        metadata: JSON.stringify({ attempt: 1 }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 3,
        runId: 'run-1',
        seq: 2,
        type: 'reasoning-delta',
        timestamp: BASE + 2,
        metadata: JSON.stringify({ text: 'I need', id: 'reasoning-0' }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 4,
        runId: 'run-1',
        seq: 3,
        type: 'text-delta',
        timestamp: BASE + 3,
        metadata: JSON.stringify({ text: 'Working', id: 'text-0' }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 5,
        runId: 'run-1',
        seq: 4,
        type: 'reasoning-delta',
        timestamp: BASE + 4,
        metadata: JSON.stringify({ text: 'to check', id: 'reasoning-0' }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 6,
        runId: 'run-1',
        seq: 5,
        type: 'tool',
        timestamp: BASE + 5,
        metadata: JSON.stringify({
          phase: 'completed',
          toolCallId: 'call-1',
          name: 'shell',
          output: 'ok',
        }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 7,
        runId: 'run-1',
        seq: 6,
        type: 'reasoning-delta',
        timestamp: BASE + 6,
        metadata: JSON.stringify({ text: 'now', id: 'reasoning-0' }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 8,
        runId: 'run-1',
        seq: 7,
        type: 'model.usage',
        timestamp: BASE + 7,
        metadata: JSON.stringify({
          usage: { model: 'm-1', promptTokens: 10, generatedTokens: 5 },
          text: 'done: deployed',
        }),
      },
      {
        threadId: THREAD_ID,
        threadSeq: 9,
        runId: 'run-1',
        seq: 8,
        type: 'run.completed',
        timestamp: BASE + 8,
        metadata: JSON.stringify({ text: 'done: deployed' }),
      },
    ])
    .run();
});

describe('ManagerTailAdapter', () => {
  const adapter = new ManagerTailAdapter(layout);

  afterAll(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  test('tail excludes per-chunk stream delta kinds from the journal', () => {
    const items = adapter.tail(ORG_ID, THREAD_ID, 10);
    expect(items.map((item) => item.kind)).toEqual([
      'user',
      'run.started',
      'tool',
      'model.usage',
      'run.completed',
    ]);
    expect(items.map((item) => item.preview)).toEqual([
      'ship it',
      null,
      'shell',
      'done: deployed',
      'done: deployed',
    ]);
    expect(items[4]?.runId).toBe('run-1');
  });

  test('limit counts journal rows, not raw events', () => {
    const items = adapter.tail(ORG_ID, THREAD_ID, 3);
    expect(items.map((item) => item.kind)).toEqual(['tool', 'model.usage', 'run.completed']);
  });

  test('settled tool calls collapse to one row, an in-flight call keeps its request', () => {
    withOrgSqlite(layout, ORG_ID, (db) => {
      db.insert(threadsTable)
        .values({
          id: 'thread-2',
          orgId: ORG_ID,
          title: 'phases',
          createdAt: new Date(BASE).toISOString(),
          updatedAt: new Date(BASE).toISOString(),
          lastReadAt: new Date(BASE).toISOString(),
        })
        .run();
      db.insert(runsTable)
        .values({
          runId: 'run-2',
          threadId: 'thread-2',
          agentName: 'coder',
          status: 'running',
          createdAt: new Date(BASE).toISOString(),
          updatedAt: new Date(BASE).toISOString(),
        })
        .run();
      db.insert(runEventsTable)
        .values([
          {
            threadId: 'thread-2',
            threadSeq: 1,
            runId: 'run-2',
            seq: 1,
            type: 'tool',
            timestamp: BASE + 20,
            metadata: JSON.stringify({
              phase: 'requested',
              toolCallId: 'call-a',
              name: 'edit_file',
              input: { path: 'a' },
            }),
          },
          {
            threadId: 'thread-2',
            threadSeq: 2,
            runId: 'run-2',
            seq: 2,
            type: 'tool',
            timestamp: BASE + 21,
            metadata: JSON.stringify({
              phase: 'streaming',
              toolCallId: 'call-a',
              name: 'edit_file',
              delta: 'partial',
            }),
          },
          {
            threadId: 'thread-2',
            threadSeq: 3,
            runId: 'run-2',
            seq: 3,
            type: 'tool',
            timestamp: BASE + 22,
            metadata: JSON.stringify({
              phase: 'completed',
              toolCallId: 'call-a',
              name: 'edit_file',
              output: { ok: true },
              message: 'done it',
            }),
          },
          {
            threadId: 'thread-2',
            threadSeq: 4,
            runId: 'run-2',
            seq: 4,
            type: 'tool',
            timestamp: BASE + 23,
            metadata: JSON.stringify({
              phase: 'requested',
              toolCallId: 'call-b',
              name: 'shell',
              input: { command: 'sleep 30' },
            }),
          },
        ])
        .run();
    });
    const items = adapter.tail(ORG_ID, 'thread-2', 10);
    expect(items.map((item) => item.preview)).toEqual(['done it', 'shell']);
  });
});
