import type { ToolCallRecord } from '../adapters/ai-llm-stream-parts.ts';
import type { CompactionMessage } from '../domain/compaction.ts';
import type { SessionEvent } from '../ports/session.ts';
import {
  buildToolMessage,
  SYNTHETIC_TOOL_RESULT_ABANDONED,
  serializeToolResult,
} from './tool-message.ts';

export interface ReplayThreadHistoryOpts {
  activeRunId?: string | null;

  messageSources?: number[];

  speakerAttribution?: boolean;
}

interface PendingCall {
  name: string;
  args: unknown;
  assistantEmitted: boolean;
  resolved: boolean;
}

interface RunBuffer {
  deltas: string[];
  calls: Map<string, PendingCall>;
  bodyCallIds: Set<string>;
}

function emptyBuffer(): RunBuffer {
  return { deltas: [], calls: new Map(), bodyCallIds: new Set() };
}

function hasConversationBody(event: Extract<SessionEvent, { type: 'model.usage' }>): boolean {
  return (
    typeof event.text === 'string' || (Array.isArray(event.toolCalls) && event.toolCalls.length > 0)
  );
}

export function rebuildThreadMessages(
  events: SessionEvent[],
  opts?: ReplayThreadHistoryOpts,
): unknown[] {
  const activeRunId = opts?.activeRunId ?? null;
  const sources = opts?.messageSources;
  const attribution = opts?.speakerAttribution === true;
  const agentNames = new Map<string, string>();
  const out: unknown[] = [];
  const emit = (message: unknown): void => {
    out.push(message);
    sources?.push(eventIndex);
  };
  const excluded = new Set<string>();
  let eventIndex = -1;
  for (const event of events) {
    const marked =
      event.type === 'agent.spawned' && event.spawnId
        ? event.spawnId
        : (event.type === 'map.item.started' ||
            event.type === 'map.item.completed' ||
            event.type === 'map.item.failed') &&
          event.workerId;
    if (marked) {
      excluded.add(marked);
    }
  }
  const buffers = new Map<string, RunBuffer>();
  let heldUser: Extract<SessionEvent, { type: 'user' }> | null = null;
  const bufferOf = (runId: string): RunBuffer => {
    let buffer = buffers.get(runId);
    if (!buffer) {
      buffer = emptyBuffer();
      buffers.set(runId, buffer);
    }
    return buffer;
  };
  const flushHeldUser = (): void => {
    if (heldUser) {
      emit(toUserMessage(heldUser, attribution));
      heldUser = null;
    }
  };
  const flushDeltas = (runId: string): void => {
    const buffer = buffers.get(runId);
    if (!buffer || buffer.deltas.length === 0) {
      return;
    }
    const text = buffer.deltas.join('');
    buffer.deltas = [];
    if (runId === activeRunId) {
      flushHeldUser();
    }
    if (text) {
      emit({
        role: 'assistant',
        content: withSpeaker(attribution, agentNames.get(runId) ?? null, text),
      });
    }
  };
  const emitAssistantCall = (runId: string, toolCallId: string, call: PendingCall): void => {
    if (call.assistantEmitted) {
      return;
    }
    flushDeltas(runId);
    const toolCalls: ToolCallRecord[] = [{ id: toolCallId, name: call.name, args: call.args }];
    emit({ role: 'assistant', content: '', toolCalls });
    call.assistantEmitted = true;
  };
  const markBodyCalls = (runId: string, toolCalls: Array<{ id: string }> | undefined): void => {
    if (!toolCalls || !runId) {
      return;
    }
    const buffer = bufferOf(runId);
    for (const call of toolCalls) {
      buffer.bodyCallIds.add(call.id);
      const pending = buffer.calls.get(call.id);
      if (pending) {
        pending.assistantEmitted = true;
      }
    }
  };
  for (eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    if (!event) {
      continue;
    }
    const runId = event.runId ?? '';
    if (runId && event.agentName) {
      agentNames.set(runId, event.agentName);
    }
    if (runId && excluded.has(runId)) {
      continue;
    }
    if (event.type === 'compaction') {
      if (!event.summary) {
        continue;
      }
      const dropped = out.length;
      out.length = 0;
      if (sources) {
        sources.length = 0;
      }
      buffers.clear();
      emit(toAnchorMessage(event, dropped));
      continue;
    }
    if (event.type === 'user') {
      if (runId !== '' && runId === activeRunId) {
        flushDeltasOfOthers(buffers, emit, runId);
        if (!heldUser && (event.text || (event.attachments?.length ?? 0) > 0)) {
          heldUser = event;
        }
        continue;
      }
      flushDeltasOfOthers(buffers, emit, runId);
      emit(toUserMessage(event, attribution));
      continue;
    }
    if (event.type === 'text-delta') {
      if (runId) {
        bufferOf(runId).deltas.push(event.text);
      }
      continue;
    }
    if (event.type === 'model.usage') {
      if (!hasConversationBody(event)) {
        continue;
      }
      if (runId === activeRunId) {
        flushHeldUser();
      } else {
        flushDeltasOfOthers(buffers, emit, runId);
      }
      const buffer = runId ? bufferOf(runId) : emptyBuffer();
      buffer.deltas = [];
      emit(toAssistantMessage(event, attribution, agentNames.get(runId) ?? null));
      markBodyCalls(runId, event.toolCalls);
      continue;
    }
    if (event.type === 'tool') {
      if (!runId || !event.toolCallId) {
        continue;
      }
      const buffer = bufferOf(runId);
      if (event.phase === 'requested' || event.phase === 'streaming') {
        if (event.phase === 'requested' && !buffer.calls.has(event.toolCallId)) {
          buffer.calls.set(event.toolCallId, {
            name: event.name,
            args: event.input ?? {},
            assistantEmitted: buffer.bodyCallIds.has(event.toolCallId),
            resolved: false,
          });
        }
        continue;
      }
      if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'skipped') {
        let call = buffer.calls.get(event.toolCallId);
        if (!call) {
          call = {
            name: event.name,
            args: {},
            assistantEmitted: buffer.bodyCallIds.has(event.toolCallId),
            resolved: false,
          };
          buffer.calls.set(event.toolCallId, call);
        }
        emitAssistantCall(runId, event.toolCallId, call);
        const content =
          typeof event.message === 'string' ? event.message : serializeToolResult(event.output);
        emit(buildToolMessage({ toolCallId: event.toolCallId, name: call.name, content }));
        call.resolved = true;
      }
    }
  }
  eventIndex = Math.max(0, events.length - 1);
  for (const [runId, buffer] of buffers) {
    if (buffer.deltas.length > 0) {
      flushDeltas(runId);
    }
  }
  repairOrphanCalls(out, sources);
  return out;
}

function flushDeltasOfOthers(
  buffers: Map<string, RunBuffer>,
  emit: (message: unknown) => void,
  currentRunId: string,
): void {
  for (const [runId, buffer] of buffers) {
    if (runId !== currentRunId && buffer.deltas.length > 0) {
      const text = buffer.deltas.join('');
      buffer.deltas = [];
      if (text) {
        emit({ role: 'assistant', content: text });
      }
    }
  }
}

function toUserMessage(
  event: Extract<SessionEvent, { type: 'user' }>,
  attribution = false,
): unknown {
  const message: Record<string, unknown> = { role: 'user', content: event.text ?? '' };
  if (attribution && event.author?.displayName) {
    message.content = `${event.author.displayName}: ${message.content}`;
  }
  if (event.attachments && event.attachments.length > 0) {
    message.attachments = event.attachments;
  }
  if (event.origin) {
    message.origin = event.origin;
  }
  return message;
}

function withSpeaker(attribution: boolean, speaker: string | null, content: string): string {
  return attribution && speaker && content ? `${speaker}: ${content}` : content;
}

function toAssistantMessage(
  event: Extract<SessionEvent, { type: 'model.usage' }>,
  attribution = false,
  speaker: string | null = null,
): unknown {
  return {
    role: 'assistant',
    content: withSpeaker(attribution, speaker, event.text ?? ''),
    reasoning: event.reasoning,
    toolCalls: event.toolCalls,
    finishReason: event.finishReason,
    sources: event.sources,
    files: event.files,
    usage: event.usage,
  };
}

function toAnchorMessage(
  event: Extract<SessionEvent, { type: 'compaction' }>,
  dropped: number,
): CompactionMessage {
  return {
    role: 'assistant',
    kind: 'compaction',
    id: event.id,
    content: event.summary ?? '',
    coveredFrom: 0,
    coveredUntil: 0,
    reason: event.reason,
    stats: { tokensBefore: 0, tokensAfter: 0, coveredCount: dropped },
    createdAt: new Date().toISOString(),
  };
}

function repairOrphanCalls(messages: unknown[], sources?: number[]): void {
  const answered = new Set<string>();
  for (const item of messages) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (rec.role === 'tool' && typeof rec.toolCallId === 'string' && rec.toolCallId) {
      answered.add(rec.toolCallId);
    }
  }
  const out: unknown[] = [];
  const outSources: number[] | undefined = sources ? [] : undefined;
  const push = (item: unknown, sourceIndex: number | undefined): void => {
    out.push(item);
    if (outSources) {
      outSources.push(sourceIndex ?? -1);
    }
  };
  for (let index = 0; index < messages.length; index += 1) {
    const item = messages[index];
    push(item, sources?.[index]);
    const rec = item as Record<string, unknown>;
    if (rec?.role !== 'assistant' || !Array.isArray(rec.toolCalls)) {
      continue;
    }
    for (const raw of rec.toolCalls) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const call = raw as Record<string, unknown>;
      const toolCallId = typeof call.id === 'string' ? call.id : '';
      if (!toolCallId || answered.has(toolCallId)) {
        continue;
      }
      push(
        buildToolMessage({
          toolCallId,
          name: typeof call.name === 'string' ? call.name : 'tool',
          content: SYNTHETIC_TOOL_RESULT_ABANDONED,
        }),
        sources?.[index],
      );
      answered.add(toolCallId);
    }
  }
  messages.length = 0;
  messages.push(...out);
  if (sources && outSources) {
    sources.length = 0;
    sources.push(...outSources);
  }
}
