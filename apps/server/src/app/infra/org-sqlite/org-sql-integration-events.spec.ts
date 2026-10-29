import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  appendIntegrationEvent,
  CREATE_INTEGRATION_EVENTS_DELIVERY_IDX_SQL,
  CREATE_INTEGRATION_EVENTS_SQL,
  listRecentIntegrationEvents,
} from './org-sql-integration-events.ts';

const FIXED_NOW = '2026-10-26T10:00:00.000Z';

function openSqlite(): Database {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_INTEGRATION_EVENTS_SQL);
  sqlite.exec(CREATE_INTEGRATION_EVENTS_DELIVERY_IDX_SQL);
  return sqlite;
}

function fns(sqlite: Database) {
  return {
    exec: (sql: string) => {
      sqlite.run(sql);
    },
    all: (sql: string) => sqlite.query(sql).all() as Array<Record<string, unknown>>,
  };
}

describe('integration_events', () => {
  test('append is idempotent on delivery_id and listRecent returns newest first', () => {
    const sqlite = openSqlite();
    try {
      const { exec, all } = fns(sqlite);
      const base = {
        orgId: 'org-1',
        integrationId: 'int-1',
        eventType: 'push',
        payloadJson: '{"ref":"refs/heads/main"}',
      };
      const first = appendIntegrationEvent(exec, all, {
        ...base,
        id: 'evt-1',
        deliveryId: 'delivery-1',
        createdAt: FIXED_NOW,
      });
      const duplicate = appendIntegrationEvent(exec, all, {
        ...base,
        id: 'evt-2',
        deliveryId: 'delivery-1',
        createdAt: FIXED_NOW,
      });
      expect(first).toBe('stored');
      expect(duplicate).toBe('duplicate');

      appendIntegrationEvent(exec, all, {
        ...base,
        id: 'evt-3',
        deliveryId: 'delivery-2',
        eventType: 'workflow_run',
        createdAt: '2026-10-26T11:00:00.000Z',
      });

      const rows = listRecentIntegrationEvents(all, 'org-1', 'int-1', 10);
      expect(rows.map((row) => row.deliveryId)).toEqual(['delivery-2', 'delivery-1']);
      expect(rows[1]?.eventType).toBe('push');

      const otherOrg = listRecentIntegrationEvents(all, 'org-2', 'int-1', 10);
      expect(otherOrg).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
