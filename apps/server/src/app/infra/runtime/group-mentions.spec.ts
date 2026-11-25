import { describe, expect, test } from 'bun:test';
import { selectMentionTarget } from './group-mentions.ts';

describe('selectMentionTarget', () => {
  test('picks the first eligible mentioned agent', () => {
    expect(
      selectMentionTarget(['a1', 'a2'], 'sender', {
        pending: new Set(),
        hasTakenTurn: () => false,
      }),
    ).toBe('a1');
  });

  test('never pings the sender back', () => {
    expect(
      selectMentionTarget(['sender', 'a2'], 'sender', {
        pending: new Set(),
        hasTakenTurn: () => false,
      }),
    ).toBe('a2');
  });

  test('skips agents that already took a turn after the last human message', () => {
    const taken = new Set(['a1', 'a2']);
    expect(
      selectMentionTarget(['a1', 'a2', 'a3'], 'sender', {
        pending: new Set(),
        hasTakenTurn: (agentId) => taken.has(agentId),
      }),
    ).toBe('a3');
  });

  test('skips agents that already have a pending reply and stops when nobody is left', () => {
    expect(
      selectMentionTarget(['a1', 'a2'], 'sender', {
        pending: new Set(['a1', 'a2']),
        hasTakenTurn: () => false,
      }),
    ).toBeUndefined();
    expect(
      selectMentionTarget(['a1'], 'sender', {
        pending: new Set(),
        hasTakenTurn: () => true,
      }),
    ).toBeUndefined();
  });
});
