import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../../const.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import * as knowledgeSchema from '../org-sqlite/schema/index.ts';
import { getSettingsOrDefault } from './knowledge-index-settings.ts';

describe('knowledge settings defaults', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-knowledge-'));
  const dbPath = join(home, 'org.db');

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('getSettingsOrDefault returns fts + watch disabled', () => {
    const sqlite = new Database(dbPath, { create: true });
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    const db = drizzle(sqlite, { schema: knowledgeSchema });
    const settings = getSettingsOrDefault(db, 'source-1');
    expect(settings.entireSource).toBe(DEFAULT_KNOWLEDGE_SETTINGS.entireSource);
    expect(settings.backend).toBe('fts');
    expect(settings.embedProvider).toBeNull();
    expect(settings.embedModel).toBeNull();
    expect(settings.watchEnabled).toBe(false);
    sqlite.close();
  });
});
