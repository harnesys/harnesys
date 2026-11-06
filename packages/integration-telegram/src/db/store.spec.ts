import type { SQLQueryBindings } from 'bun:sqlite';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import type { AddonDatabase } from 'harnesys/integration';
import type { PostRecord, ReaderRecord, RuleRecord, SourceRecord } from '../model/records.ts';
import { TELEGRAM_SCHEMA_SQL } from './schema.ts';
import {
  claimFire,
  findSourceByPeer,
  insertPost,
  insertReader,
  insertRule,
  insertSource,
  listRuleSourceIds,
  listRulesForSource,
  prunePosts,
  releaseFire,
  updatePost,
} from './store.ts';

function dayAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function memoryDb(): AddonDatabase {
  const sqlite = new Database(':memory:');
  sqlite.exec(TELEGRAM_SCHEMA_SQL);
  const bind = (params: readonly unknown[]): SQLQueryBindings[] =>
    params.map((value) => value as SQLQueryBindings);
  return {
    path: ':memory:',
    exec: (sql) => sqlite.exec(sql),
    all: <Row>(sql: string, params: readonly unknown[] = []) =>
      sqlite.query(sql).all(...bind(params)) as Row[],
    get: <Row>(sql: string, params: readonly unknown[] = []) =>
      (sqlite.query(sql).get(...bind(params)) as Row | null) ?? undefined,
    run: (sql: string, params: readonly unknown[] = []) => sqlite.query(sql).run(...bind(params)),
    insertReturning: <Row>(sql: string, params: readonly unknown[] = []) =>
      (sqlite.query(sql).get(...bind(params)) as Row | null) ?? undefined,
  };
}

const reader: ReaderRecord = {
  id: 'r1',
  label: 'Reader',
  status: 'authorized',
  apiId: 123,
  phoneMasked: '+71***345',
  dcId: 2,
  lastError: null,
  lastSeenAt: null,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const source: SourceRecord = {
  id: 's1',
  readerId: 'r1',
  peerKind: 'channel',
  peerId: '1768',
  accessHash: '9',
  username: 'durov',
  title: 'Durov',
  joined: true,
  watchTopics: false,
  lastPostId: 0,
  lastError: null,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const rule: RuleRecord = {
  id: 'ru1',
  name: 'Releases',
  status: 'active',
  agentId: 'a1',
  threadId: 't1',
  modeId: 'default',
  detail: '',
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

function post(id: string, postId: number, receivedAt: string): PostRecord {
  return {
    id,
    sourceId: 's1',
    postId,
    topicId: null,
    authorTitle: null,
    text: `body ${postId}`,
    mediaKinds: [],
    publishedAt: receivedAt,
    receivedAt,
    outcome: 'new',
    fireCount: 0,
  };
}

function seeded(): AddonDatabase {
  const db = memoryDb();
  insertReader(db, reader);
  insertSource(db, source);
  insertRule(db, rule, ['s1']);
  return db;
}

describe('addon store', () => {
  test('source lookup by peer id', () => {
    const db = seeded();
    expect(findSourceByPeer(db, '1768')?.title).toBe('Durov');
    expect(findSourceByPeer(db, '999')).toBeUndefined();
  });

  test('duplicate post is rejected', () => {
    const db = seeded();
    expect(insertPost(db, post('p1', 552, '2026-11-06T00:00:00.000Z'))).toBe('inserted');
    expect(insertPost(db, post('p2', 552, '2026-11-06T00:00:01.000Z'))).toBe('duplicate');
  });

  test('rules resolve through their sources', () => {
    const db = seeded();
    expect(listRulesForSource(db, 's1').map((row) => row.id)).toEqual(['ru1']);
    expect(listRuleSourceIds(db, 'ru1')).toEqual(['s1']);
  });

  test('fire claim is once per post and rule', () => {
    const db = seeded();
    expect(claimFire(db, 'feed:p1:ru1', 'ru1', 'p1')).toBe(true);
    expect(claimFire(db, 'feed:p1:ru1', 'ru1', 'p1')).toBe(false);
    releaseFire(db, 'feed:p1:ru1');
    expect(claimFire(db, 'feed:p1:ru1', 'ru1', 'p1')).toBe(true);
  });

  test('outcome update sticks to the post', () => {
    const db = seeded();
    insertPost(db, post('p1', 552, '2026-11-06T00:00:00.000Z'));
    updatePost(db, 'p1', { outcome: 'fired', fireCount: 1 });
    const rows = db.all<{ outcome: string; fire_count: number }>(
      `SELECT outcome, fire_count FROM posts WHERE id = 'p1'`,
    );
    expect(rows[0]).toEqual({ outcome: 'fired', fire_count: 1 });
  });

  test('prune keeps the newest rows per source and drops stale rows', () => {
    const db = seeded();
    for (let index = 1; index <= 5; index += 1) {
      insertPost(db, post(`p${index}`, index, dayAgo(6 - index)));
    }
    insertPost(db, post('old', 99, dayAgo(45)));
    prunePosts(db, 2, 30);
    const left = db.all<{ id: string }>(`SELECT id FROM posts ORDER BY received_at DESC`);
    expect(left.map((row) => row.id)).toEqual(['p5', 'p4']);
  });
});
