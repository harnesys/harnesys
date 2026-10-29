import { describe, expect, test } from 'bun:test';
import type { Event } from '../domain/snapshot.ts';
import { eventToSessionEvent } from './run-engine-events.ts';

function graphEvent(type: string, metadata: Record<string, unknown>): Event {
  return {
    eventId: 'e1',
    type,
    timestamp: 1,
    sessionId: 's',
    runId: 'r',
    agentId: 'a',
    sequence: 1,
    metadata,
  };
}

describe('eventToSessionEvent replay fields', () => {
  test('keeps assistant body on model usage', () => {
    const out = eventToSessionEvent(
      graphEvent('model.completed', {
        text: 'hello',
        toolCalls: [{ id: 'c1', name: 'sh', args: {} }],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 2 },
      }),
    );
    expect(out).toMatchObject({
      type: 'model.usage',
      text: 'hello',
      finishReason: 'tool-calls',
      toolCalls: [{ id: 'c1', name: 'sh', args: {} }],
    });
  });

  test('emits model.usage with zero tokens when provider omits usage', () => {
    const out = eventToSessionEvent(
      graphEvent('model.completed', {
        model: 'gemma4:31b-cloud',
        text: 'hi',
        finishReason: 'stop',
        durationMs: 12,
      }),
    );
    expect(out).toMatchObject({
      type: 'model.usage',
      text: 'hi',
      usage: {
        model: 'gemma4:31b-cloud',
        promptTokens: 0,
        generatedTokens: 0,
        durationMs: 12,
      },
    });
  });

  test('keeps presented tool message on completion', () => {
    const out = eventToSessionEvent(
      graphEvent('tool.completed', {
        toolCallId: 'c1',
        name: 'sh',
        output: 'raw',
        message: 'shown',
      }),
    );
    expect(out).toMatchObject({ type: 'tool', phase: 'completed', message: 'shown' });
  });

  test('keeps compaction summary', () => {
    const out = eventToSessionEvent(
      graphEvent('compaction.completed', { id: 'a1', reason: 'threshold', summary: 'old work' }),
    );
    expect(out).toMatchObject({ type: 'compaction', id: 'a1', summary: 'old work' });
  });

  test('keeps the generated image count on model usage', () => {
    const out = eventToSessionEvent(
      graphEvent('model.completed', {
        model: 'google/gemini-4-argon',
        text: 'image',
        usage: { inputTokens: 10, outputTokens: 20, images: 2 },
      }),
    );
    expect(out).toMatchObject({ type: 'model.usage', usage: { images: 2 } });
  });

  test('falls back to image_count when images is missing', () => {
    const out = eventToSessionEvent(
      graphEvent('model.completed', {
        model: 'google/gemini-4-argon',
        text: 'image',
        usage: { inputTokens: 10, outputTokens: 20, image_count: 3 },
      }),
    );
    expect(out).toMatchObject({ type: 'model.usage', usage: { images: 3 } });
  });
});
