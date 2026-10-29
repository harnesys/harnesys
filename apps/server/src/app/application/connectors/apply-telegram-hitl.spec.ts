import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { findOpenAsk, payloadForButtonValue } from './apply-telegram-hitl.ts';

function askEvent(tool?: { name: string; input: unknown }): SessionEvent {
  return {
    type: 'ask',
    askId: 'a1',
    schema: { type: 'object' },
    source: 'permission',
    prompt: 'Allow?',
    ...(tool === undefined ? {} : { tool: { ...tool, toolCallId: 'c1' } }),
  } as SessionEvent;
}

describe('payloadForButtonValue', () => {
  test('always maps to a program rule for shell asks', () => {
    const ask = findOpenAsk([askEvent({ name: 'shell', input: { command: 'git status' } })]);
    expect(ask?.tool?.name).toEqual('shell');
    expect(ask !== null && payloadForButtonValue(ask, 'always')).toEqual({
      approved: true,
      rule: { kind: 'program', pattern: 'git *', target: 'agent' },
    });
  });

  test('always falls back to plain approve when the command is unparseable', () => {
    const ask = findOpenAsk([askEvent({ name: 'shell', input: { command: '' } })]);
    expect(ask !== null && payloadForButtonValue(ask, 'always')).toEqual({ approved: true });
    const bare = findOpenAsk([askEvent()]);
    expect(bare !== null && payloadForButtonValue(bare, 'always')).toEqual({ approved: true });
  });

  test('approve_once approves without a rule', () => {
    const ask = findOpenAsk([askEvent({ name: 'shell', input: { command: 'git status' } })]);
    expect(ask !== null && payloadForButtonValue(ask, 'approve_once')).toEqual({ approved: true });
  });
});
