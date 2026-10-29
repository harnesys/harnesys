import type { BudgetExtension } from '../domain/agent-definition.ts';
import type { Cursor, Event, Snapshot } from '../domain/snapshot.ts';
import { RUNTIME_VERSION } from '../domain/snapshot.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import { hashStr } from './graph-helpers.ts';
import { SYNTHETIC_TOOL_RESULT_ABANDONED } from './tool-message.ts';

export interface ForeignDecision {
  content: string;
}
export interface SnapCtx {
  sessionId: string;
  runId: string;
  seq: number;
  agentJson: string;
  orderJson: string;
  input: unknown;
  state: Record<string, unknown>;
  cur: string;
  steps: number;
  tokens: number;
  startedAt: number;
  nodeStep: number;
  stops: number;
  memoryWrites?: number;
  nudges?: number;
  extend?: BudgetExtension;
  deadlineAt?: number;
}
export function mkSnap(ctx: SnapCtx, status: string): Snapshot {
  return {
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    definitionHash: hashStr(ctx.agentJson),
    planHash: hashStr(ctx.orderJson),
    sequence: ctx.seq,
    status,
    runtimeVersion: RUNTIME_VERSION,
    initialInput: ctx.input,
    state: ctx.state,
    cursor: {
      nodes: {
        [ctx.cur]: {
          phase: 'executing',
          nodeExecutionId: `${ctx.runId}:${ctx.cur}:${ctx.nodeStep}`,
        },
      },
      budget: {
        steps: ctx.steps,
        tokens: ctx.tokens,
        startedAt: ctx.startedAt,
        stops: ctx.stops,
        memoryWrites: ctx.memoryWrites ?? 0,
        nudges: ctx.nudges ?? 0,
        extend: ctx.extend,
        deadlineAt: ctx.deadlineAt,
      },
    } as Cursor,
  };
}
export function mkEv(ctx: SnapCtx, type: string): Event {
  return {
    eventId: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    agentId: '',
    sequence: ctx.seq,
    metadata: {},
  };
}
export function decisionTextOf(
  answer: {
    payload?: unknown;
    rejected?: boolean;
    note?: string;
  } | null,
): ForeignDecision | undefined {
  if (answer === null) {
    return undefined;
  }
  const note = typeof answer.note === 'string' && answer.note !== '' ? `: ${answer.note}` : '';
  if (answer.rejected === true) {
    return { content: `denied by user${note}` };
  }
  if (
    answer.payload !== null &&
    typeof answer.payload === 'object' &&
    (answer.payload as { approved?: unknown }).approved === false
  ) {
    return { content: `denied by user${note}` };
  }
  if (
    answer.payload !== null &&
    typeof answer.payload === 'object' &&
    (answer.payload as { approved?: unknown }).approved === true
  ) {
    return { content: 'approved by user, but the run closed before the call was executed' };
  }
  return undefined;
}
function pairDanglingToolCalls(
  state: Record<string, unknown>,
  decision: ForeignDecision | undefined,
): Record<string, unknown> {
  const prev = state.messages;
  if (!Array.isArray(prev) || prev.length === 0) {
    return state;
  }
  const last = prev[prev.length - 1];
  if (!last || typeof last !== 'object' || Array.isArray(last)) {
    return state;
  }
  const rec = last as Record<string, unknown>;
  if (rec.role !== 'assistant' || !Array.isArray(rec.toolCalls) || rec.toolCalls.length === 0) {
    return state;
  }
  const messages = [...prev];
  for (const raw of rec.toolCalls) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const call = raw as Record<string, unknown>;
    const toolCallId = typeof call.id === 'string' ? call.id : '';
    const name = typeof call.name === 'string' ? call.name : 'tool';
    if (!toolCallId) {
      continue;
    }
    messages.push({
      role: 'tool',
      toolCallId,
      name,
      content: decision?.content ?? SYNTHETIC_TOOL_RESULT_ABANDONED,
    });
  }
  return { ...state, messages };
}
export async function abandonForeignSnapshot(
  state: RuntimeState,
  runId: string,
  decision?: ForeignDecision,
): Promise<void> {
  const snap = await state.load();
  if (!snap || snap.runId === runId) {
    return;
  }
  if (snap.status !== 'needs_input' && snap.status !== 'running') {
    return;
  }
  const sequence = snap.sequence + 1;
  const cursor = { ...snap.cursor };
  delete cursor.interrupt;
  await state.commit(
    {
      ...snap,
      status: 'completed',
      sequence,
      state: pairDanglingToolCalls(snap.state, decision),
      cursor,
    },
    [],
    { kind: 'recorded', sequence },
  );
}
