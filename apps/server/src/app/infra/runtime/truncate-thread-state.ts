import type {
  AbandonedCallContext,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import { abandonedContextOf, abandonedToolResult } from 'harnesys';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { ThreadSessionRef } from './wait-ticker.ts';

export interface ThreadHistoryDeps {
  sessions: Map<string, ThreadSessionRef>;
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  sessionFor: (threadId: string, agentId: string) => Promise<SessionHandle>;
}

export async function truncateThreadHistory(
  deps: ThreadHistoryDeps,
  threadId: string,
  threadSeq: number,
): Promise<TruncateThreadResult> {
  await cancelActiveForTruncate(deps, threadId);
  const result = await deps.events.truncateThreadFrom(threadId, threadSeq);
  await truncateThreadState(deps.sessions, threadId, result.remainingUserCount);
  return result;
}

export async function undoThreadCompaction(
  deps: ThreadHistoryDeps,
  threadId: string,
): Promise<SessionEvent> {
  await cancelActiveForTruncate(deps, threadId);
  const events = await deps.events.listByThread(threadId);
  let target: SessionEvent | undefined;
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type === 'compaction') {
      target = events[index];
      break;
    }
  }
  if (!target || typeof target.threadSeq !== 'number') {
    throw new ThreadValidationException('no compaction to undo');
  }
  return removeThreadHistoryEvent(deps, threadId, target.threadSeq);
}

export async function removeThreadHistoryEvent(
  deps: Pick<ThreadHistoryDeps, 'events' | 'sessions'>,
  threadId: string,
  threadSeq: number,
): Promise<SessionEvent> {
  const removed = await deps.events.removeEvent(threadId, threadSeq);
  if (!removed) {
    throw new ThreadValidationException(`event not found: ${threadId}:${threadSeq}`);
  }
  forgetThreadSessions(deps.sessions, threadId);
  return removed;
}

export async function cancelActiveForTruncate(
  deps: Pick<ThreadHistoryDeps, 'lifecycle' | 'sessionFor'>,
  threadId: string,
): Promise<void> {
  const active = await deps.lifecycle.activeByThread(threadId);
  if (!active?.agentId) {
    return;
  }
  try {
    const handle = await deps.sessionFor(threadId, active.agentId);
    await handle.cancel(active.runId);
  } catch {
    // best-effort: truncate proceeds even when cancel races terminal state
  }
}

export async function truncateThreadState(
  sessions: Map<string, ThreadSessionRef>,
  threadId: string,
  keepUserCount: number,
): Promise<void> {
  const refs = threadSessionRefs(sessions, threadId);
  for (const ref of refs) {
    await truncateSessionState(ref, keepUserCount);
  }
}

function threadSessionRefs(
  sessions: Map<string, ThreadSessionRef>,
  threadId: string,
): ThreadSessionRef[] {
  const prefix = `${threadId}:`;
  return [...sessions.entries()].filter(([key]) => key.startsWith(prefix)).map(([, ref]) => ref);
}

function forgetThreadSessions(sessions: Map<string, ThreadSessionRef>, threadId: string): void {
  const prefix = `${threadId}:`;
  for (const key of [...sessions.keys()]) {
    if (key.startsWith(prefix)) {
      sessions.delete(key);
    }
  }
}

async function truncateSessionState(ref: ThreadSessionRef, keepUserCount: number): Promise<void> {
  if (!ref.state) {
    return;
  }
  const snap = await ref.state.load();
  if (!snap) {
    return;
  }
  const state = snap.state as Record<string, unknown>;
  const messages = state.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  const cut = userCutIndex(messages, keepUserCount);
  if (cut >= messages.length) {
    return;
  }
  const kept = repairDanglingToolCalls(
    messages.slice(0, cut),
    abandonedContextOf(snap.cursor.interrupt),
  );
  const sequence = snap.sequence + 1;
  await ref.state.commit({ ...snap, sequence, state: { ...state, messages: kept } }, [], {
    kind: 'recorded',
    sequence,
  });
}

function userCutIndex(messages: unknown[], keepUserCount: number): number {
  let seen = 0;
  for (let index = 0; index < messages.length; index += 1) {
    if (!isUserMessage(messages[index])) {
      continue;
    }
    if (seen >= keepUserCount) {
      return index;
    }
    seen += 1;
  }
  return messages.length;
}

function isUserMessage(item: unknown): boolean {
  return (
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    (item as { role?: unknown }).role === 'user'
  );
}

function repairDanglingToolCalls(messages: unknown[], context?: AbandonedCallContext): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  const last = messages[messages.length - 1];
  if (!isAssistantWithToolCalls(last)) {
    return messages;
  }
  const calls = (last as { toolCalls: unknown[] }).toolCalls;
  const out = [...messages];
  for (const raw of calls) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const call = raw as Record<string, unknown>;
    const toolCallId = typeof call.id === 'string' ? call.id : '';
    const name = typeof call.name === 'string' ? call.name : 'tool';
    if (!toolCallId) {
      continue;
    }
    out.push({
      role: 'tool',
      toolCallId,
      name,
      content: abandonedToolResult(context),
    });
  }
  return out;
}

function isAssistantWithToolCalls(item: unknown): boolean {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }
  const record = item as Record<string, unknown>;
  return (
    record.role === 'assistant' && Array.isArray(record.toolCalls) && record.toolCalls.length > 0
  );
}
