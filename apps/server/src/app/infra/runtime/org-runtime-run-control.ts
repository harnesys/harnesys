import { BACKGROUND_AGENT_ORIGIN } from '@harnesys/studio-shared';
import type {
  BackgroundSpawnHandle,
  BackgroundToolStatus,
  RunEngine,
  RunEventStore,
  RunToolControl,
  SessionEvent,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { enqueueThreadMessage } from '../org-sqlite/thread-message-queue.store.ts';

const TAIL_EVENTS = 40;
const TAIL_MAX_CHARS = 600;
const TAIL_PART_MAX_CHARS = 120;
const REPORT_OUTPUT_MAX_CHARS = 4000;
const NO_RUNNING_AGENT = 'no running background agent with this spawnId in this thread';

interface OrgRunControlInput {
  engine: RunEngine;
  events: RunEventStore;
  db: OrgSqliteDb;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assistantContentOf(rec: Record<string, unknown>): string | null {
  if (rec.role !== undefined && rec.role !== 'assistant') {
    return null;
  }
  const content = rec.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  for (const part of content) {
    const row = recordOf(part);
    if (row !== null && typeof row.text === 'string' && row.text) {
      parts.push(row.text);
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function outputTextOf(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  if (output === null || output === undefined) {
    return '';
  }
  const rec = recordOf(output);
  const text = rec === null ? null : assistantContentOf(rec);
  return text ?? safeJsonOf(output);
}

function safeJsonOf(output: unknown): string {
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function tailPartOf(event: SessionEvent): string | null {
  if (event.type === 'tool' && typeof event.name === 'string') {
    return `${event.name}:${String(event.phase ?? '')}`;
  }
  if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
    const text = typeof event.text === 'string' ? event.text.trim() : '';
    return text ? text.slice(0, TAIL_PART_MAX_CHARS) : null;
  }
  if (event.type === 'done' || event.type === 'run.failed') {
    return `[${event.type}]`;
  }
  return null;
}

function tailTextOf(events: SessionEvent[]): string | undefined {
  const parts = events
    .slice(-TAIL_EVENTS)
    .map(tailPartOf)
    .filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' | ').slice(-TAIL_MAX_CHARS);
}

function statusOfHandle(
  handle: BackgroundSpawnHandle,
  tail: string | undefined,
): BackgroundToolStatus {
  return {
    runId: handle.runId,
    threadId: handle.threadId,
    spawnId: handle.spawnId,
    agentId: handle.agentId,
    ...(handle.agentName !== undefined ? { agentName: handle.agentName } : {}),
    status: handle.status,
    ...(handle.output !== undefined ? { output: handle.output } : {}),
    ...(handle.error !== undefined ? { error: handle.error } : {}),
    ...(handle.status === 'running'
      ? { idleMs: Math.max(0, Date.now() - handle.lastActivityAt) }
      : {}),
    ...(tail !== undefined ? { tail } : {}),
  };
}

async function statusHandleOf(
  events: RunEventStore,
  handle: BackgroundSpawnHandle,
): Promise<BackgroundToolStatus> {
  const tail = await events
    .tail(handle.spawnId, 0)
    .then(tailTextOf)
    .catch(() => undefined);
  return statusOfHandle(handle, tail);
}

export function createOrgRunControl({ engine, events, db }: OrgRunControlInput): RunToolControl {
  return {
    waitBackground: (threadId, timeoutMs) =>
      engine
        .awaitBackgroundByThread(threadId, timeoutMs)
        .then((handles) => Promise.all(handles.map((handle) => statusHandleOf(events, handle)))),
    status: (threadId, spawnId) => {
      const handles = engine.backgroundListByThread(threadId);
      const filtered =
        spawnId === undefined ? handles : handles.filter((h) => h.spawnId === spawnId);
      return Promise.all(filtered.map((handle) => statusHandleOf(events, handle)));
    },
    send: async (threadId, spawnId, text) => {
      if (runningHandleOf(engine, threadId, spawnId) === null) {
        return { ok: false, error: NO_RUNNING_AGENT };
      }
      const result = enqueueThreadMessage(db, {
        threadId,
        text,
        origin: 'agent',
        targetRunId: spawnId,
      });
      return result.itemIds.length > 0
        ? { ok: true }
        : { ok: false, error: 'message was not queued (duplicate)' };
    },
    stop: (threadId, spawnId) => {
      if (runningHandleOf(engine, threadId, spawnId) === null) {
        return Promise.resolve({ ok: false as const, error: NO_RUNNING_AGENT });
      }
      engine.abort(spawnId);
      return Promise.resolve({ ok: true as const });
    },
  };
}

function runningHandleOf(
  engine: RunEngine,
  threadId: string,
  spawnId: string,
): BackgroundSpawnHandle | null {
  const hit = engine
    .backgroundListByThread(threadId)
    .find((handle) => handle.spawnId === spawnId && handle.status === 'running');
  return hit ?? null;
}

interface BackgroundReportEnqueueInput {
  threadId: string;
  parentAgentId: string;
  agentName?: string;
  agentId: string;
  output?: unknown;
  error?: { code: string; message: string };
}

export function createBackgroundReportFn(
  db: OrgSqliteDb,
  onQueued?: (threadId: string) => void,
): (input: BackgroundReportEnqueueInput) => void {
  return (input) => {
    enqueueThreadMessage(db, {
      threadId: input.threadId,
      text: backgroundReportTextOf(input),
      origin: BACKGROUND_AGENT_ORIGIN,
      targetAgentIds: [input.parentAgentId],
    });
    onQueued?.(input.threadId);
  };
}

export function backgroundReportTextOf(input: {
  agentName?: string;
  agentId: string;
  output?: unknown;
  error?: { code: string; message: string };
}): string {
  const name = input.agentName ?? input.agentId;
  if (input.error !== undefined) {
    if (input.error.code === 'spawn_aborted') {
      return `Background agent **${name}** was stopped.`;
    }
    return `Background agent **${name}** failed.\n\n\`${input.error.code}\`: ${input.error.message}`;
  }
  const text = outputTextOf(input.output);
  const trimmed =
    text.length > REPORT_OUTPUT_MAX_CHARS ? `${text.slice(0, REPORT_OUTPUT_MAX_CHARS)}...` : text;
  return trimmed
    ? `Background agent **${name}** finished.\n\n${trimmed}`
    : `Background agent **${name}** finished.`;
}
