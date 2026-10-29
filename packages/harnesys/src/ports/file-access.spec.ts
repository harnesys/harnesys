import { expect, test } from 'bun:test';
import { type FileRuleInput, matchFilePattern, resolveFileAccess } from './file-access.ts';

const HOST_A = '22222222-2222-4222-8222-00000000000a';
const HOST_B = '22222222-2222-4222-8222-00000000000b';
const AGENT_A = '33333333-3333-4333-8333-00000000000a';

function orgRule(
  pattern: string,
  effects: { effect?: 'allow' | 'deny'; hostId?: string | null } = {},
): FileRuleInput {
  return {
    agentId: null,
    hostId: 'hostId' in effects ? (effects.hostId ?? null) : null,
    pathPattern: pattern,
    action: 'read',
    effect: (effects.effect ?? 'allow') as 'allow' | 'deny',
  };
}

function agentRule(pattern: string, effects: { effect?: 'allow' | 'deny' } = {}): FileRuleInput {
  return {
    agentId: AGENT_A,
    hostId: null,
    pathPattern: pattern,
    action: 'read',
    effect: (effects.effect ?? 'allow') as 'allow' | 'deny',
  };
}

function resolve(rules: FileRuleInput[], canonicalPath: string) {
  return resolveFileAccess({
    canonicalPath,
    action: 'read',
    primaryDirectory: '/Users/mike/project',
    hostId: HOST_A,
    agentId: AGENT_A,
    rules,
  });
}

test('primary auto-allow, deny precedence and host scoping', () => {
  expect(resolve([], '/Users/mike/project/src/a.ts').decision).toBe('allow');
  expect(resolve([], '/Users/mike/project').decision).toBe('allow');

  expect(
    resolve([orgRule('/v/**', { effect: 'deny' }), agentRule('/v/**')], '/v/file.txt'),
  ).toMatchObject({ decision: 'deny', reason: 'denied by file rule /v/**' });
  expect(
    resolve([agentRule('/v/**'), orgRule('/v/**', { effect: 'deny' })], '/v/file.txt'),
  ).toMatchObject({ decision: 'deny' });

  expect(
    resolve(
      [agentRule('/v/**'), agentRule('/v/secret/**', { effect: 'deny' })],
      '/v/secret/file.txt',
    ).decision,
  ).toBe('deny');
  expect(
    resolve([orgRule('/v/**'), orgRule('/v/secret/**', { effect: 'deny' })], '/v/secret/file.txt')
      .decision,
  ).toBe('deny');

  const otherHost = orgRule('/v/**', { hostId: HOST_B });
  expect(resolve([otherHost], '/v/file.txt').decision).toBe('ask');

  expect(matchFilePattern('/Users/mike/media/file.txt', '~/media/**')).toBe(false);
  expect(resolve([orgRule('~/media/**')], '/Users/mike/media/file.txt').decision).toBe('ask');

  expect(matchFilePattern('/v/v/a/c.txt', '/v/x/../v/**/c.txt')).toBe(true);
  expect(matchFilePattern('/v/a/b/c.txt', '/v/**/c.txt')).toBe(true);
  expect(matchFilePattern('/v/secret', '/v/*/**')).toBe(true);
  expect(matchFilePattern('/v/a/other', '/v/*/b')).toBe(false);
  expect(matchFilePattern('/v/a/b/c.txt', '/v/*/b/c.txt')).toBe(true);

  expect(resolve([agentRule('/Users/mike/project/**')], '/Users/mike/external/file.txt')).toEqual({
    decision: 'ask',
    subject: {
      file: { path: '/Users/mike/external/file.txt', action: 'read' },
    },
  });
});

test('asks without rules and read rules do not grant edit', () => {
  expect(resolve([], '/v/file.txt')).toEqual({
    decision: 'ask',
    subject: { file: { path: '/v/file.txt', action: 'read' } },
  });

  const editGate = resolveFileAccess({
    canonicalPath: '/v/file.txt',
    action: 'edit',
    primaryDirectory: '/Users/mike/project',
    hostId: HOST_A,
    agentId: AGENT_A,
    rules: [orgRule('/v/**')],
  });
  expect(editGate.decision).toBe('ask');
  expect(resolve([orgRule('/v/**')], '/v/file.txt').decision).toBe('allow');

  const outsideEdit = resolveFileAccess({
    canonicalPath: '/Users/mike/Desktop/file.txt',
    action: 'edit',
    primaryDirectory: '/Users/mike/project',
    hostId: HOST_A,
    agentId: AGENT_A,
    rules: [],
  });
  expect(outsideEdit).toEqual({
    decision: 'deny',
    reason: 'path is outside allowed roots',
  });
});
