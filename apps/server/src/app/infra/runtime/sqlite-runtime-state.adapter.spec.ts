import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { Snapshot } from 'harnesys';
import { CREATE_RUN_SNAPSHOTS_SQL } from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { runSnapshotsTable } from '../org-sqlite/schema/index.ts';
import { repairDanglingToolCalls, SqliteRuntimeState } from './sqlite-runtime-state.adapter.ts';

function snapOf(runId: string, status: string, sequence = 5): Snapshot {
  return {
    sessionId: 'thread-1',
    runId,
    definitionHash: 'h',
    planHash: 'p',
    sequence,
    status,
    runtimeVersion: '0.3.0',
    initialInput: null,
    state: { messages: [{ role: 'user', content: 'hi' }] },
    cursor: {
      nodes: { act: { phase: 'executing', nodeExecutionId: `${runId}:act:1` } },
      budget: { steps: 3, tokens: 10, startedAt: 1 },
    },
  };
}

describe('SqliteRuntimeState', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_RUN_SNAPSHOTS_SQL);
  const db = drizzle(sqlite, { schema });
  afterAll(() => sqlite.close());

  test('roundtrip: commit then load from a fresh instance with the same run binding', async () => {
    const writer = new SqliteRuntimeState('thread-1', 'run-1', db);
    const snapshot = snapOf('run-1', 'running');
    await writer.commit(snapshot, [], { kind: 'recorded', sequence: snapshot.sequence });
    const reader = new SqliteRuntimeState('thread-1', 'run-1', db);
    const loaded = await reader.load();
    expect(loaded?.runId).toBe('run-1');
    expect(loaded?.status).toBe('running');
    expect(loaded?.sequence).toBe(5);
    expect(loaded?.cursor.nodes.act?.phase).toBe('executing');
    expect(loaded?.state.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('load returns null for a different run binding', async () => {
    const reader = new SqliteRuntimeState('thread-1', 'run-other', db);
    expect(await reader.load()).toBeNull();
  });

  test('load ignores a stored seed snapshot and falls back to replay', async () => {
    const seedRow = {
      runId: 'run-1',
      sessionId: 'thread-1',
      snapshot: JSON.stringify({ ...snapOf('run-1', 'idle'), runtimeVersion: 'seed' }),
      status: 'idle',
      runtimeVersion: 'seed',
      updatedAt: Date.now(),
    };
    db.insert(runSnapshotsTable)
      .values(seedRow)
      .onConflictDoUpdate({ target: runSnapshotsTable.runId, set: seedRow })
      .run();
    const reader = new SqliteRuntimeState('thread-1', 'run-1', db);
    expect(await reader.load()).toBeNull();
  });

  test('terminal commit deletes the stored snapshot row', async () => {
    const writer = new SqliteRuntimeState('thread-1', 'run-1', db);
    const done = { ...snapOf('run-1', 'completed'), sequence: 6 };
    await writer.commit(done, [], { kind: 'recorded', sequence: 6 });
    const row = sqlite.query('SELECT COUNT(*) AS c FROM run_snapshots').get() as { c: number };
    expect(row.c).toBe(0);
    const reader = new SqliteRuntimeState('thread-1', 'run-1', db);
    expect(await reader.load()).toBeNull();
  });

  test('load throws on incompatible runtimeVersion', () => {
    sqlite.exec(
      `INSERT INTO run_snapshots (run_id, session_id, snapshot, status, runtime_version, updated_at)
       VALUES ('run-old', 'thread-1', '{}', 'running', '0.0.1', 1)`,
    );
    const reader = new SqliteRuntimeState('thread-1', 'run-old', db);
    expect(reader.load()).rejects.toThrow('not supported');
  });

  test('thread-bound state stays memory-only', async () => {
    const thread = new SqliteRuntimeState('thread-2', null, db);
    const snapshot = snapOf('run-9', 'running');
    await thread.commit(snapshot, [], { kind: 'recorded', sequence: 1 });
    const rows = sqlite
      .query("SELECT COUNT(*) AS c FROM run_snapshots WHERE session_id = 'thread-2'")
      .get() as { c: number };
    expect(rows.c).toBe(0);
    const loaded = await thread.load();
    expect(loaded?.runId).toBe('run-9');
  });

  test('load repairs a dangling tool call left by a crash', async () => {
    const snapshot = snapOf('run-1', 'running');
    snapshot.state = {
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { name: 'mcp_list', args: {}, id: 'call_x' },
            { name: 'mcp_check', args: {}, id: 'call_y' },
          ],
          finishReason: 'tool-calls',
        },
      ],
    };
    db.insert(runSnapshotsTable)
      .values({
        runId: 'run-1',
        sessionId: 'thread-1',
        snapshot: JSON.stringify(snapshot),
        status: 'running',
        runtimeVersion: '0.3.0',
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: runSnapshotsTable.runId,
        set: { snapshot: JSON.stringify(snapshot) },
      })
      .run();
    const reader = new SqliteRuntimeState('thread-1', 'run-1', db);
    const loaded = await reader.load();
    const messages = loaded?.state.messages as Array<{
      role: string;
      toolCallId?: string;
      content?: unknown;
    }>;
    expect(messages).toHaveLength(4);
    expect(messages[2]).toMatchObject({ role: 'tool', toolCallId: 'call_x', name: 'mcp_list' });
    expect(messages[3]).toMatchObject({ role: 'tool', toolCallId: 'call_y', name: 'mcp_check' });
    expect(String(messages[2]?.content)).toContain('interrupted');
  });

  test('load skips repair for a snapshot parked on an interrupt', async () => {
    const snapshot = snapOf('run-hitl', 'needs_input');
    snapshot.cursor.interrupt = {
      interruptId: 'perm/x/0',
      reason: 'allow process?',
      resumeSchema: { type: 'object' },
      nodeId: 'act',
      source: 'permission',
      tool: { name: 'shell', input: {}, toolCallId: 'call_x' },
    };
    snapshot.state = {
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ name: 'shell', args: {}, id: 'call_x' }],
          finishReason: 'tool-calls',
        },
      ],
    };
    db.insert(runSnapshotsTable)
      .values({
        runId: 'run-hitl',
        sessionId: 'thread-1',
        snapshot: JSON.stringify(snapshot),
        status: 'needs_input',
        runtimeVersion: '0.3.0',
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: runSnapshotsTable.runId,
        set: { snapshot: JSON.stringify(snapshot) },
      })
      .run();
    const reader = new SqliteRuntimeState('thread-1', 'run-hitl', db);
    const loaded = await reader.load();
    expect(loaded?.state.messages).toHaveLength(2);
  });

  test('repair keeps answered calls and inserts only the missing ones', () => {
    const snapshot = snapOf('run-1', 'running');
    snapshot.state = {
      messages: [
        {
          role: 'assistant',
          toolCalls: [
            { name: 'a', args: {}, id: 'call_1' },
            { name: 'b', args: {}, id: 'call_2' },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', name: 'a', content: 'ok' },
      ],
    };
    expect(repairDanglingToolCalls(snapshot)).toBe(1);
    const messages = snapshot.state.messages as Array<{ role: string; toolCallId?: string }>;
    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({ role: 'tool', toolCallId: 'call_2' });
    expect(messages[2]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
  });
});
