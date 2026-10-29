import { describe, expect, test } from 'bun:test';
import { normalizeToolSequence } from './ai-llm-normalize.ts';

type Rec = Record<string, unknown>;

const call = (id: string, name = 'shell'): Rec => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId: id, toolName: name, input: {} }],
});
const result = (id: string, name = 'shell'): Rec => ({
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'text', value: 'ok' } },
  ],
});
const user = (text = 'hi'): Rec => ({ role: 'user', content: text });

const idsOf = (messages: Rec[]): string[] =>
  messages.flatMap((m) =>
    Array.isArray(m.content)
      ? (m.content as Rec[])
          .filter((p) => p.type === 'tool-result')
          .map((p) => String(p.toolCallId))
      : [],
  );
const firstMessage = (messages: Rec[], index: number): Rec => {
  const message = messages[index];
  if (!message) {
    throw new Error(`missing message at ${index}`);
  }
  return message;
};

describe('normalizeToolSequence', () => {
  test('clean history passes through untouched with empty report', () => {
    const history = [user(), call('a'), result('a'), { role: 'assistant', content: 'done' }];
    const { messages, report } = normalizeToolSequence(history as never[]);
    expect(messages).toEqual(history);
    expect(report).toEqual({});
  });

  test('leading orphan tool result is dropped (compaction summary window)', () => {
    const head = [result('a'), user('summarize this')];
    const { messages, report } = normalizeToolSequence(head as never[]);
    expect(messages).toEqual([user('summarize this')]);
    expect(report.droppedOrphanIds).toEqual(['a']);
  });

  test('duplicate result keeps the last occurrence', () => {
    const stale = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'shell',
          output: { type: 'text', value: 'interrupted' },
        },
      ],
    };
    const { messages, report } = normalizeToolSequence([call('a'), stale, result('a')] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    const parts = firstMessage(messages as Rec[], 1).content as Rec[];
    const value = (parts[0]?.output ?? {}) as { value: string };
    expect(value.value).toBe('ok');
    expect(report.droppedDuplicateIds).toEqual(['a']);
  });

  test('unanswered call gets a synthetic result right after the assistant block', () => {
    const { messages, report } = normalizeToolSequence([
      call('a'),
      result('a'),
      call('b', 'write'),
      user(),
    ] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a', 'b']);
    expect(report.insertedCallIds).toEqual(['b']);
    expect(firstMessage(messages as Rec[], 3).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 4).role).toBe('user');
  });

  test('misplaced end-of-array synthetic is dropped and a fresh adjacent one is inserted', () => {
    const misplaced = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'shell',
          output: { type: 'text', value: 'interrupted' },
        },
      ],
    };
    const { messages, report } = normalizeToolSequence([
      call('a'),
      user('media note'),
      { role: 'assistant', content: 'text' },
      misplaced,
    ] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    expect(report.droppedOrphanIds).toEqual(['a']);
    expect(report.insertedCallIds).toEqual(['a']);
    expect(firstMessage(messages as Rec[], 1).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 2).role).toBe('user');
  });

  test('parallel calls keep declared order in inserted synthetics', () => {
    const both = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'x', toolName: 'a', input: {} },
        { type: 'tool-call', toolCallId: 'y', toolName: 'b', input: {} },
      ],
    };
    const { messages, report } = normalizeToolSequence([both, user()] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['x', 'y']);
    expect(report.insertedCallIds).toEqual(['x', 'y']);
  });

  test('user message inside an open block is held until the block closes', () => {
    const both = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'x', toolName: 'a', input: {} },
        { type: 'tool-call', toolCallId: 'y', toolName: 'b', input: {} },
      ],
    };
    const { messages, report } = normalizeToolSequence([
      both,
      result('x'),
      user('first media'),
      result('y'),
      user('second note'),
    ] as never[]);
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'tool', 'tool', 'user', 'user']);
    expect(firstMessage(messages as Rec[], 3).content).toBe('first media');
    expect(firstMessage(messages as Rec[], 4).content).toBe('second note');
    expect(report.heldUserMessages).toBe(2);
  });

  test('held user is released after the synthetic flush of an unfinished block', () => {
    const { messages, report } = normalizeToolSequence([call('a'), user('media note')] as never[]);
    expect(idsOf(messages as Rec[])).toEqual(['a']);
    expect(firstMessage(messages as Rec[], 1).role).toBe('tool');
    expect(firstMessage(messages as Rec[], 2).role).toBe('user');
    expect(report.insertedCallIds).toEqual(['a']);
    expect(report.heldUserMessages).toBe(1);
  });

  test('answered block does not hold user messages', () => {
    const history = [call('a'), result('a'), user('note')];
    const { messages, report } = normalizeToolSequence(history as never[]);
    expect(messages).toEqual(history);
    expect(report).toEqual({});
  });
});
