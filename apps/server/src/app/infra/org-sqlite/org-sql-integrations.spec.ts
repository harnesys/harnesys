import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  backfillIntegrationsFromSources,
  CREATE_INTEGRATIONS_SQL,
} from './org-sql-integrations.ts';
import { CREATE_SOURCES_SQL } from './org-sql-sources.ts';

function openSqlite(): Database {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_SOURCES_SQL);
  sqlite.exec(CREATE_INTEGRATIONS_SQL);
  return sqlite;
}

function runBackfill(sqlite: Database): void {
  backfillIntegrationsFromSources(
    (sql) => {
      sqlite.run(sql);
    },
    (sql) => sqlite.query(sql).all() as Array<{ name: string }>,
  );
}

function insertSource(sqlite: Database, id: string, orgId: string, distributionJson: string): void {
  sqlite.run(
    `INSERT INTO sources (id, org_id, name, distribution_json, created_at, updated_at)
     VALUES ('${id}', '${orgId}', 'Src', '${distributionJson.replaceAll("'", "''")}', '2026-01-01', '2026-01-01')`,
  );
}

function listIntegrations(
  sqlite: Database,
): Array<{ id: string; org_id: string; external_account_id: string; cred_ref: string }> {
  return sqlite
    .query(
      'SELECT id, org_id, external_account_id, cred_ref FROM integrations ORDER BY external_account_id',
    )
    .all() as Array<{
    id: string;
    org_id: string;
    external_account_id: string;
    cred_ref: string;
  }>;
}

describe('backfillIntegrationsFromSources', () => {
  test('creates one integration per credRef and rewrites cloud-drive distributions', () => {
    const sqlite = openSqlite();
    try {
      insertSource(
        sqlite,
        's-1',
        'org-1',
        JSON.stringify({
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'root',
          credRef: 'cred-a',
        }),
      );
      insertSource(
        sqlite,
        's-2',
        'org-1',
        JSON.stringify({
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'abc',
          credRef: 'cred-a',
        }),
      );
      insertSource(
        sqlite,
        's-3',
        'org-2',
        JSON.stringify({
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'xyz',
          credRef: 'cred-b',
        }),
      );
      runBackfill(sqlite);
      const integrations = listIntegrations(sqlite);
      expect(integrations).toHaveLength(2);
      expect(integrations[0]).toMatchObject({
        org_id: 'org-1',
        external_account_id: 'cred-a',
        cred_ref: 'cred-a',
      });
      const first = sqlite
        .query("SELECT distribution_json FROM sources WHERE id = 's-1'")
        .get() as { distribution_json: string };
      const firstDistribution: unknown = JSON.parse(first.distribution_json);
      expect(firstDistribution).toEqual({
        kind: 'cloud-drive',
        backend: 'google',
        remoteFolderId: 'root',
        integrationId: integrations[0]?.id,
      });
      const second = sqlite
        .query("SELECT distribution_json FROM sources WHERE id = 's-2'")
        .get() as { distribution_json: string };
      const secondDistribution: unknown = JSON.parse(second.distribution_json);
      expect((secondDistribution as { integrationId?: string }).integrationId).toBe(
        integrations[0]?.id,
      );
      const third = sqlite
        .query("SELECT distribution_json FROM sources WHERE id = 's-3'")
        .get() as { distribution_json: string };
      expect(
        (JSON.parse(third.distribution_json) as { integrationId?: string }).integrationId,
      ).toBe(integrations[1]?.id);
    } finally {
      sqlite.close();
    }
  });

  test('skips non-cloud-drive rows, rows with integrationId and rows without credRef', () => {
    const sqlite = openSqlite();
    try {
      insertSource(
        sqlite,
        's-host',
        'org-1',
        JSON.stringify({ kind: 'host-bound', hostId: '00000000-0000-4000-8000-000000000000' }),
      );
      insertSource(
        sqlite,
        's-linked',
        'org-1',
        JSON.stringify({
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'root',
          credRef: 'cred-a',
          integrationId: 'existing-integration',
        }),
      );
      insertSource(
        sqlite,
        's-nocred',
        'org-1',
        JSON.stringify({ kind: 'cloud-drive', backend: 'google', remoteFolderId: 'root' }),
      );
      runBackfill(sqlite);
      expect(listIntegrations(sqlite)).toEqual([]);
      const untouched = sqlite
        .query("SELECT distribution_json FROM sources WHERE id = 's-linked'")
        .get() as { distribution_json: string };
      expect(JSON.parse(untouched.distribution_json)).toMatchObject({
        integrationId: 'existing-integration',
      });
    } finally {
      sqlite.close();
    }
  });

  test('is idempotent: a second run adds no rows and keeps distributions stable', () => {
    const sqlite = openSqlite();
    try {
      insertSource(
        sqlite,
        's-1',
        'org-1',
        JSON.stringify({
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'root',
          credRef: 'cred-a',
        }),
      );
      runBackfill(sqlite);
      const afterFirst = listIntegrations(sqlite);
      const distributionAfterFirst = (
        sqlite.query("SELECT distribution_json FROM sources WHERE id = 's-1'").get() as {
          distribution_json: string;
        }
      ).distribution_json;
      runBackfill(sqlite);
      expect(listIntegrations(sqlite)).toEqual(afterFirst);
      const distributionAfterSecond = (
        sqlite.query("SELECT distribution_json FROM sources WHERE id = 's-1'").get() as {
          distribution_json: string;
        }
      ).distribution_json;
      expect(distributionAfterSecond).toBe(distributionAfterFirst);
    } finally {
      sqlite.close();
    }
  });
});
