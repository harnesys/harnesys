import { and, eq } from 'drizzle-orm';
import type { CommitMeta, Event, Snapshot } from 'harnesys';
import { codedRunError, InMemoryRuntimeState, RUNTIME_VERSION } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runSnapshotsTable } from '../org-sqlite/schema/index.ts';

const TERMINAL_STATUS = new Set<string>(['completed', 'failed', 'cancelled']);

interface SnapshotMessage {
  role: string;
  toolCalls?: Array<{ id: string; name?: string }>;
  toolCallId?: string;
  [key: string]: unknown;
}

function repairAssistantRow(rows: SnapshotMessage[], atIndex: number): number {
  const row = rows[atIndex];
  if (row === undefined || row.role !== 'assistant' || !Array.isArray(row.toolCalls)) {
    return 0;
  }
  const pending = new Set(row.toolCalls.map((call) => call.id));
  for (let j = atIndex + 1; j < rows.length && pending.size > 0; j++) {
    const next = rows[j];
    if (next?.role === 'assistant') {
      break;
    }
    if (next?.role === 'tool' && next.toolCallId !== undefined) {
      pending.delete(next.toolCallId);
    }
  }
  let repaired = 0;
  let index = atIndex;
  for (const id of pending) {
    const call = row.toolCalls.find((item) => item.id === id);
    rows.splice(index + 1, 0, {
      role: 'tool',
      toolCallId: id,
      ...(call?.name !== undefined ? { name: call.name } : {}),
      content: JSON.stringify({
        error: 'interrupted before execution; re-issue the call if needed',
      }),
    });
    repaired += 1;
    index += 1;
  }
  return repaired;
}

export function repairDanglingToolCalls(snapshot: Snapshot): number {
  const messages = snapshot.state?.messages;
  if (!Array.isArray(messages)) {
    return 0;
  }
  const rows = messages as SnapshotMessage[];
  let repaired = 0;
  for (let i = 0; i < rows.length; i++) {
    const added = repairAssistantRow(rows, i);
    repaired += added;
    i += added;
  }
  return repaired;
}

export class SqliteRuntimeState extends InMemoryRuntimeState {
  private readonly sqliteChildren = new Map<string, SqliteRuntimeState>();

  constructor(
    sessionId: string,
    private readonly runId: string | null,
    private readonly db: OrgSqliteDb,
  ) {
    super(sessionId);
  }

  override async load(): Promise<Snapshot | null> {
    const memory = await super.load();
    if (memory !== null || this.runId === null) {
      return memory;
    }
    const row = this.readRow();
    if (row === null) {
      return null;
    }
    const parsed = this.parseRow(row);
    if (parsed === null) {
      return null;
    }
    if (parsed.cursor.interrupt === undefined) {
      repairDanglingToolCalls(parsed);
    }
    this.hydrate(parsed);
    return parsed;
  }

  private parseRow(row: { snapshot: string }): Snapshot | null {
    let parsed: Snapshot;
    try {
      parsed = JSON.parse(row.snapshot) as Snapshot;
    } catch {
      throw codedRunError('snapshot_version', 'stored run snapshot is corrupted');
    }
    if (parsed.runtimeVersion === 'seed') {
      return null;
    }
    if (parsed.runtimeVersion !== RUNTIME_VERSION) {
      throw codedRunError(
        'snapshot_version',
        `snapshot runtimeVersion ${parsed.runtimeVersion} is not supported (expected ${RUNTIME_VERSION})`,
      );
    }
    return parsed;
  }

  override async commit(
    snapshot: Snapshot,
    events: readonly Event[],
    meta: CommitMeta,
  ): Promise<void> {
    await super.commit(snapshot, events, meta);
    if (this.runId === null || snapshot.runId !== this.runId) {
      return;
    }
    if (snapshot.runtimeVersion === 'seed') {
      return;
    }
    if (TERMINAL_STATUS.has(snapshot.status)) {
      this.db.delete(runSnapshotsTable).where(eq(runSnapshotsTable.runId, snapshot.runId)).run();
      return;
    }
    const values = {
      runId: snapshot.runId,
      sessionId: this.sessionId,
      snapshot: JSON.stringify(snapshot),
      status: snapshot.status,
      runtimeVersion: snapshot.runtimeVersion,
      updatedAt: Date.now(),
    };
    this.db
      .insert(runSnapshotsTable)
      .values(values)
      .onConflictDoUpdate({ target: runSnapshotsTable.runId, set: values })
      .run();
  }

  override child(spawnId: string): SqliteRuntimeState {
    const existing = this.sqliteChildren.get(spawnId);
    if (existing) {
      return existing;
    }
    const child = new SqliteRuntimeState(`${this.sessionId}:${spawnId}`, null, this.db);
    this.sqliteChildren.set(spawnId, child);
    return child;
  }

  private readRow(): { snapshot: string } | null {
    if (this.runId === null) {
      return null;
    }
    const row = this.db
      .select({ snapshot: runSnapshotsTable.snapshot })
      .from(runSnapshotsTable)
      .where(
        and(
          eq(runSnapshotsTable.runId, this.runId),
          eq(runSnapshotsTable.sessionId, this.sessionId),
        ),
      )
      .get();
    return row ?? null;
  }
}
