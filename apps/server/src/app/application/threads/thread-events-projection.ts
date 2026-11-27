import type { SessionEvent } from 'harnesys';
import { STREAM_DELTA_EVENT_TYPES } from '../../domain/events/stream-delta-event-types.ts';

const TOOL_OUTPUT_LIMIT = 2048;

type StreamDelta = SessionEvent & { type: 'text-delta' | 'reasoning-delta' };
type ToolEvent = SessionEvent & { type: 'tool' };
type ModelUsageEvent = SessionEvent & { type: 'model.usage' };

function isStreamDelta(event: SessionEvent): event is StreamDelta {
  return STREAM_DELTA_EVENT_TYPES.includes(event.type);
}

function continuesDelta(left: StreamDelta, right: StreamDelta): boolean {
  return (
    left.type === right.type &&
    left.id !== undefined &&
    left.id === right.id &&
    left.runId !== undefined &&
    left.runId === right.runId
  );
}

function mergeDelta(left: StreamDelta, right: StreamDelta): StreamDelta {
  return {
    ...left,
    text: left.text + right.text,
    ...(right.seq === undefined ? {} : { seq: right.seq }),
    ...(right.threadSeq === undefined ? {} : { threadSeq: right.threadSeq }),
  };
}

function isToolStream(left: SessionEvent, right: SessionEvent): boolean {
  if (left.type !== 'tool' || right.type !== 'tool') {
    return false;
  }
  return (
    left.phase === 'streaming' &&
    right.phase === 'streaming' &&
    left.toolCallId === right.toolCallId &&
    left.runId !== undefined &&
    left.runId === right.runId
  );
}

function mergeToolStream(left: ToolEvent, right: ToolEvent): ToolEvent {
  return {
    ...left,
    name: right.name || left.name,
    delta: (left.delta ?? '') + (right.delta ?? ''),
    ...(right.seq === undefined ? {} : { seq: right.seq }),
    ...(right.threadSeq === undefined ? {} : { threadSeq: right.threadSeq }),
  };
}

function coalesce(events: SessionEvent[]): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (last && isStreamDelta(last) && isStreamDelta(event) && continuesDelta(last, event)) {
      out[out.length - 1] = mergeDelta(last, event);
      continue;
    }
    if (last && isToolStream(last, event)) {
      out[out.length - 1] = mergeToolStream(last as ToolEvent, event as ToolEvent);
      continue;
    }
    out.push(event);
  }
  return out;
}

function outputText(output: unknown): string | undefined {
  if (output === null || output === undefined) {
    return undefined;
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}

function trimToolOutput(event: ToolEvent): ToolEvent {
  const text = outputText(event.output);
  if (text === undefined || text.length <= TOOL_OUTPUT_LIMIT) {
    return event;
  }
  return { ...event, output: text.slice(0, TOOL_OUTPUT_LIMIT), outputTruncated: true };
}

function stripUsageDetail(event: ModelUsageEvent): ModelUsageEvent {
  const stripped = { ...event };
  delete stripped.text;
  delete stripped.reasoning;
  delete stripped.toolCalls;
  return stripped;
}

export function projectThreadEvents(events: unknown[]): unknown[] {
  const typed = events as SessionEvent[];
  const shaped = typed.map((event) => {
    if (event.type === 'tool') {
      return trimToolOutput(event as ToolEvent);
    }
    if (event.type === 'model.usage') {
      return stripUsageDetail(event as ModelUsageEvent);
    }
    return event;
  });
  return coalesce(shaped);
}
