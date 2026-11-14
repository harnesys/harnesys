import { describe, expect, test } from 'bun:test';
import { attributedText, authorLabel, isMentioned, routeDecision } from './routing.ts';

const base = { text: 'hello', isCommand: false, mentioned: false, replyToBot: false };

describe('routing policy', () => {
  test('mention policy bridges only mentions', () => {
    expect(routeDecision('mention', base)).toBe('ignore');
    expect(routeDecision('mention', { ...base, mentioned: true })).toBe('bridge');
  });

  test('reply policy bridges only replies to the bot', () => {
    expect(routeDecision('reply', base)).toBe('ignore');
    expect(routeDecision('reply', { ...base, replyToBot: true })).toBe('bridge');
  });

  test('always policy bridges everything except commands handling', () => {
    expect(routeDecision('always', base)).toBe('bridge');
  });

  test('commands-only policy never bridges plain messages', () => {
    expect(routeDecision('commands', { ...base, mentioned: true })).toBe('ignore');
    expect(routeDecision('commands', { ...base, replyToBot: true })).toBe('ignore');
  });

  test('commands are handled regardless of policy', () => {
    const input = { ...base, isCommand: true };
    for (const policy of ['mention', 'reply', 'always', 'commands'] as const) {
      expect(routeDecision(policy, input)).toBe('command');
    }
  });
});

describe('mention detection', () => {
  test('matches whole-word mentions case-insensitively', () => {
    expect(isMentioned('hey @MyBot look', 'mybot')).toBe(true);
    expect(isMentioned('hey@MyBot', 'mybot')).toBe(false);
    expect(isMentioned('email someone@mybotx', 'mybot')).toBe(false);
    expect(isMentioned('hello', 'mybot')).toBe(false);
    expect(isMentioned('hello', null)).toBe(false);
  });
});

describe('attribution', () => {
  test('prefers the username, then the first name', () => {
    expect(authorLabel({ username: 'ada', first_name: 'Ada' })).toBe('@ada');
    expect(authorLabel({ first_name: 'Ada' })).toBe('Ada');
    expect(authorLabel(undefined)).toBe('unknown sender');
  });

  test('prefixes the bridged text', () => {
    expect(attributedText('@ada', 'Design', 'ship it')).toBe('From @ada in Design: ship it');
  });
});
