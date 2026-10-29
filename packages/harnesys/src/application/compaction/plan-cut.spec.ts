import { describe, expect, test } from 'bun:test';
import { estimateMessageTokens } from './estimate.ts';
import { isClosedBoundary, planCut } from './plan-cut.ts';

function user(content: string): unknown {
  return { role: 'user', content };
}
function tool(callId: string): unknown {
  return { role: 'tool', toolCallId: callId, content: 'ok' };
}

describe('planCut', () => {
  test('cuts every closed message when the tail is unprotected', () => {
    const messages = [user('a'.repeat(480)), user('b'.repeat(480)), user('c'.repeat(480))];
    expect(planCut(messages, { protectTokens: 0, afterIndex: -1 })).toEqual({
      coveredFrom: 0,
      coveredUntil: 2,
    });
  });

  test('keeps the protected tail out of the cut', () => {
    const messages = [user('a'.repeat(480)), user('b'.repeat(480)), user('c'.repeat(480))];
    const tailTokens = estimateMessageTokens(messages[2]);
    expect(planCut(messages, { protectTokens: tailTokens, afterIndex: -1 })).toEqual({
      coveredFrom: 0,
      coveredUntil: 1,
    });
  });

  test('returns null when everything fits into the protected tail', () => {
    const messages = [user('a'.repeat(480))];
    expect(planCut(messages, { protectTokens: 10, afterIndex: -1 })).toBeNull();
  });

  test('skips an open tool-call turn as a boundary candidate', () => {
    const assistant = {
      role: 'assistant',
      content: 'x'.repeat(480),
      toolCalls: [{ id: 'c1', name: 'sh', args: {} }],
    };
    const messages = [user('a'.repeat(480)), assistant];
    expect(planCut(messages, { protectTokens: 0, afterIndex: -1 })).toEqual({
      coveredFrom: 0,
      coveredUntil: 0,
    });
  });

  test('cuts up to a closed boundary and skips covered history after the anchor', () => {
    const messages = [user('old'), user('a'.repeat(480)), user('tail')];
    expect(planCut(messages, { protectTokens: 0, afterIndex: 0 })).toEqual({
      coveredFrom: 1,
      coveredUntil: 2,
    });
  });

  test('isClosedBoundary rejects an assistant turn with unanswered tool calls', () => {
    const assistant = {
      role: 'assistant',
      content: 'x',
      toolCalls: [{ id: 'c1', name: 'sh', args: {} }],
    };
    expect(isClosedBoundary([assistant, tool('c1')], 0)).toBe(true);
    expect(isClosedBoundary([assistant], 0)).toBe(false);
  });
});
