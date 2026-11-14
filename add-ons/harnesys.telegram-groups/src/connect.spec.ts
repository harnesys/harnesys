import { describe, expect, test } from 'bun:test';
import { connectTitle, resolveConnectTarget } from './discovery.ts';
import { channelOfParts } from './telegram.ts';

describe('connect target', () => {
  test('empty input means the whole group', () => {
    expect(resolveConnectTarget(undefined)).toEqual({ kind: 'group' });
    expect(resolveConnectTarget('   ')).toEqual({ kind: 'group' });
  });

  test('a numeric input picks a discovered topic id', () => {
    expect(resolveConnectTarget(' 42 ')).toEqual({ kind: 'existing', topicId: '42' });
  });

  test('any other text names a new topic', () => {
    expect(resolveConnectTarget(' Releases ')).toEqual({ kind: 'create', name: 'Releases' });
  });
});

describe('connect naming', () => {
  test('thread title falls back to the chat title without a topic', () => {
    expect(connectTitle('Platform Team', null)).toBe('Platform Team');
  });

  test('thread title joins the chat and topic titles', () => {
    expect(connectTitle('Platform Team', 'Releases')).toBe('Platform Team · Releases');
  });
});

describe('channel ids', () => {
  test('a group channel is the bare chat id', () => {
    expect(channelOfParts('-100123')).toBe('-100123');
  });

  test('a topic channel appends the topic id', () => {
    expect(channelOfParts('-100123', '42')).toBe('-100123:42');
    expect(channelOfParts('-100123', '')).toBe('-100123');
  });
});
