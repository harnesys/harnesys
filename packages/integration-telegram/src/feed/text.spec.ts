import { describe, expect, test } from 'bun:test';
import { TEXT_LIMIT } from '../db/schema.ts';
import type { PostRecord, RuleRecord, SourceRecord } from '../model/records.ts';
import { fireId, postUrl, taskText } from './text.ts';

const rule: RuleRecord = {
  id: 'r1',
  name: 'Releases',
  status: 'active',
  agentId: 'a1',
  threadId: 't1',
  modeId: 'default',
  detail: 'Summarize the release',
  filter: [],
  history: 'none',
  historyLast: 20,
  maxRunsPerDay: 50,
  throttleSec: 0,
  runsDate: '',
  runsToday: 0,
  lastFiredAt: null,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const source: SourceRecord = {
  id: 's1',
  readerId: 'rd1',
  peerKind: 'channel',
  peerId: '1768',
  accessHash: '123',
  username: 'durov',
  title: 'Durov',
  joined: true,
  watchTopics: false,
  lastPostId: 552,
  lastError: null,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

function post(text: string, topicId: number | null = null): PostRecord {
  return {
    id: 'p1',
    sourceId: 's1',
    postId: 552,
    topicId,
    authorTitle: 'Durov',
    text,
    mediaKinds: ['photo'],
    publishedAt: '2026-11-06T00:00:00.000Z',
    receivedAt: '2026-11-06T00:00:00.000Z',
    outcome: 'new',
    fireCount: 0,
  };
}

describe('feed text', () => {
  test('fire id is stable per post and rule', () => {
    expect(fireId('p1', 'r1')).toBe('feed:p1:r1');
  });

  test('post url carries the topic', () => {
    expect(postUrl(source, post('x'))).toBe('https://t.me/durov/552');
    expect(postUrl(source, post('x', 77))).toBe('https://t.me/durov/552?thread=77');
  });

  test('run text keeps header, body, and instruction', () => {
    const text = taskText(rule, source, post('Long live Rust'));
    expect(text).toContain('Telegram post from Durov (#552)');
    expect(text).toContain('Link: https://t.me/durov/552');
    expect(text).toContain('Media: photo');
    expect(text).toContain('Long live Rust');
    expect(text).toContain('Instruction: Summarize the release');
  });

  test('long bodies truncate to the limit', () => {
    const text = taskText(rule, source, post('a'.repeat(TEXT_LIMIT + 500)));
    expect(text).toContain(`${'a'.repeat(TEXT_LIMIT)}…`);
    expect(text.length).toBeLessThan(TEXT_LIMIT + 500);
  });
});
