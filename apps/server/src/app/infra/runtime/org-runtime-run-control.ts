import { BACKGROUND_AGENT_ORIGIN } from '@harnesys/studio-shared';
import type {
  BackgroundSpawnHandle,
  BackgroundToolStatus,
  RunEngine,
  RunEventStore,
  RunToolControl,
  SessionEvent,
  SpawnEffectsJournal,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { enqueueThreadMessage } from '../org-sqlite/thread-message-queue.store.ts';

const TAIL_EVENTS = 240;
const TAIL_MAX_CHARS = 600;
const TAIL_RUN_MAX_CHARS = 200;
const REPORT_OUTPUT_MAX_CHARS = 4000;
const REPORT_EFFECTS_MAX_LINES = 16;
const REPORT_EFFECT_LINE_MAX_CHARS = 100;
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

interface TailStep {
  kind: 'text' | 'reasoning' | 'marker';
  text: string;
}

function tailStepOf(event: SessionEvent): TailStep | null {
  if (event.type === 'text-delta') {
    return { kind: 'text', text: typeof event.text === 'string' ? event.text : '' };
  }
  if (event.type === 'reasoning-delta') {
    return { kind: 'reasoning', text: typeof event.text === 'string' ? event.text : '' };
  }
  if (event.type === 'tool' && typeof event.name === 'string') {
    return { kind: 'marker', text: `${event.name}:${String(event.phase ?? '')}` };
  }
  if (event.type === 'done' || event.type === 'run.failed') {
    return { kind: 'marker', text: `[${event.type}]` };
  }
  return null;
}

function mergeTailSteps(steps: TailStep[]): TailStep[] {
  const merged: TailStep[] = [];
  for (const step of steps) {
    const last = merged.at(-1);
    if (last !== undefined && last.kind === step.kind && step.kind !== 'marker') {
      last.text += step.text;
    } else {
      merged.push({ ...step });
    }
  }
  return merged;
}

function tailPartText(step: TailStep): string {
  if (step.kind === 'marker') {
    return step.text;
  }
  const flat = step.text.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > TAIL_RUN_MAX_CHARS ? `…${flat.slice(-TAIL_RUN_MAX_CHARS)}` : flat;
  return step.kind === 'reasoning' ? `thinking: ${clipped}` : clipped;
}

function tailPartsOf(events: SessionEvent[]): string[] {
  const steps = mergeTailSteps(
    events
      .slice(-TAIL_EVENTS)
      .map(tailStepOf)
      .filter((step): step is TailStep => step !== null),
  );
  const parts: string[] = [];
  for (const step of steps) {
    const text = tailPartText(step);
    if (text !== '') {
      parts.push(text);
    }
  }
  return parts;
}

export function tailTextOf(events: SessionEvent[]): string | undefined {
  const parts = tailPartsOf(events);
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
    ...(handle.effects !== undefined ? { effects: handle.effects } : {}),
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

function clipEffectNote(note: string): string {
  const flat = note.replace(/\s+/g, ' ').trim();
  return flat.length > REPORT_EFFECT_LINE_MAX_CHARS
    ? `${flat.slice(0, REPORT_EFFECT_LINE_MAX_CHARS)}…`
    : flat;
}

function effectsTextOf(journal: SpawnEffectsJournal | undefined): string | null {
  if (journal === undefined || journal.entries.length === 0) {
    return null;
  }
  const shown = journal.entries.slice(0, REPORT_EFFECTS_MAX_LINES);
  const lines = shown.map((entry) => {
    const note = entry.note === undefined ? '' : ` ${clipEffectNote(entry.note)}`;
    return entry.ok ? `- \`${entry.tool}\`${note}` : `- \`${entry.tool}\` → FAILED${note}`;
  });
  const hidden = journal.entries.length - shown.length + journal.omitted;
  if (hidden > 0) {
    lines.push(`… +${hidden} more write operations not shown`);
  }
  const total = journal.entries.length + journal.omitted;
  return `Write effects performed (${total}):\n${lines.join('\n')}`;
}

interface BackgroundReportEnqueueInput {
  threadId: string;
  parentAgentId: string;
  spawnId: string;
  agentName?: string;
  agentId: string;
  output?: unknown;
  error?: { code: string; message: string };
  effects?: SpawnEffectsJournal;
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
  spawnId: string;
  agentName?: string;
  agentId: string;
  output?: unknown;
  error?: { code: string; message: string };
  effects?: SpawnEffectsJournal;
}): string {
  const label = `**${input.agentName ?? input.agentId}** (\`${input.spawnId}\`)`;
  if (input.error !== undefined) {
    const effects = effectsTextOf(input.effects);
    if (input.error.code === 'spawn_aborted') {
      const base = `Background agent ${label} was stopped.`;
      return effects === null ? base : `${base}\n\n${effects}`;
    }
    const base = `Background agent ${label} failed.\n\n\`${input.error.code}\`: ${input.error.message}`;
    return effects === null ? base : `${base}\n\n${effects}`;
  }
  const text = outputTextOf(input.output);
  const trimmed =
    text.length > REPORT_OUTPUT_MAX_CHARS ? `${text.slice(0, REPORT_OUTPUT_MAX_CHARS)}...` : text;
  return trimmed
    ? `Background agent ${label} finished.\n\n${trimmed}`
    : `Background agent ${label} finished.`;
}
