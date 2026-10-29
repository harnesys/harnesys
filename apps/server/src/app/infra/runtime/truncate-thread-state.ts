import type {
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import { SYNTHETIC_TOOL_RESULT_ABANDONED } from 'harnesys';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { ThreadSessionRef } from './wait-ticker.ts';

export interface ThreadHistoryDeps {
  sessions: Map<string, ThreadSessionRef>;
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  sessionFor: (threadId: string) => Promise<SessionHandle>;
}

export async function truncateThreadHistory(
  deps: ThreadHistoryDeps,
  threadId: string,
  runId: string,
  seq: number,
): Promise<TruncateThreadResult> {
  await cancelActiveForTruncate(deps, threadId);
  const result = await deps.events.truncateThreadFrom(threadId, runId, seq);
  await truncateThreadState(deps.sessions, threadId, result.remainingUserCount);
  return result;
}

export async function removeThreadHistoryEvent(
  deps: Pick<ThreadHistoryDeps, 'events' | 'sessions'>,
  threadId: string,
  runId: string,
  seq: number,
): Promise<SessionEvent> {
  const removed = await deps.events.removeEvent(threadId, runId, seq);
  if (!removed) {
    throw new ThreadValidationException(`event not found: ${runId}:${seq}`);
  }
  deps.sessions.delete(threadId);
  return removed;
}

export async function cancelActiveForTruncate(
  deps: Pick<ThreadHistoryDeps, 'lifecycle' | 'sessionFor'>,
  threadId: string,
): Promise<void> {
  const active = await deps.lifecycle.activeByThread(threadId);
  if (!active) {
    return;
  }
  try {
    const handle = await deps.sessionFor(threadId);
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
  const ref = sessions.get(threadId);
  if (!ref?.state) {
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
  const kept = repairDanglingToolCalls(messages.slice(0, cut));
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

function repairDanglingToolCalls(messages: unknown[]): unknown[] {
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
      content: SYNTHETIC_TOOL_RESULT_ABANDONED,
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
