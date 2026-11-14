import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import type { TransportSessionRow } from '../../domain/addons/transport-session.ts';
import { AddonTransportSessionStore } from './addon-transport-session.store.ts';
import { ensureAddonsPlatformSchema } from './org-sql-addons-platform.ts';

function store(): AddonTransportSessionStore {
  const db = new Database(':memory:');
  ensureAddonsPlatformSchema((sql) => {
    for (const statement of sql.split(';')) {
      if (statement.trim() !== '') {
        db.run(statement);
      }
    }
  });
  return new AddonTransportSessionStore(db);
}

function row(overrides: Partial<TransportSessionRow> = {}): TransportSessionRow {
  return {
    orgId: 'org',
    addonId: 'addon',
    provider: 'demo',
    externalChatId: 'chat',
    threadId: 'thread',
    runId: 'run',
    draft: 'hi',
    lastSeq: 2,
    messageId: null,
    status: 'streaming' as const,
    askId: null,
    askOptionsJson: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AddonTransportSessionStore', () => {
  it('opens, finds, patches, and closes a session', () => {
    const sessions = store();
    sessions.open(row());
    expect(sessions.find('org', 'thread', 'run', 'addon')?.draft).toBe('hi');

    sessions.patch('org', 'thread', 'run', 'addon', {
      draft: 'hello',
      lastSeq: 4,
      messageId: 'm1',
      status: 'parked',
      askId: 'ask',
      askOptionsJson: '["approve","deny"]',
    });
    const patched = sessions.find('org', 'thread', 'run', 'addon');
    expect(patched?.draft).toBe('hello');
    expect(patched?.lastSeq).toBe(4);
    expect(patched?.messageId).toBe('m1');
    expect(patched?.askId).toBe('ask');
    expect(sessions.findParked('org', 'addon', 'chat')?.runId).toBe('run');
    expect(sessions.listOpen()).toHaveLength(1);

    sessions.patch('org', 'thread', 'run', 'addon', { status: 'closed' });
    expect(sessions.listOpen()).toHaveLength(0);
  });

  it('remembers outbound message ids and forgets an addon', () => {
    const sessions = store();
    sessions.rememberOutbound('org', 'addon', 'm1');
    expect(sessions.isOutbound('org', 'addon', 'm1')).toBe(true);
    expect(sessions.isOutbound('org', 'addon', 'm2')).toBe(false);

    sessions.open(row());
    sessions.removeAddon('org', 'addon');
    expect(sessions.find('org', 'thread', 'run', 'addon')).toBeNull();
    expect(sessions.isOutbound('org', 'addon', 'm1')).toBe(false);
  });
});
