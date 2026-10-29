import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { CREATE_ORG_MEMORY_SETTINGS_SQL } from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import {
  decisionModelIdOf,
  embedModelIdOf,
  memoryCrawlRecord,
  saveDecisionModelId,
  saveEmbedModelId,
  saveMemoryCrawlRecord,
} from './org-memory-settings.store.ts';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_ORG_MEMORY_SETTINGS_SQL);
  const db = drizzle(sqlite, { schema });
  return { db, close: () => sqlite.close() };
}

describe('org-memory-settings store', () => {
  test('model id pins roundtrip and clear to auto', () => {
    const { db, close } = setup();
    try {
      expect(embedModelIdOf(db, 'org-1')).toBeUndefined();
      expect(decisionModelIdOf(db, 'org-1')).toBeUndefined();
      saveEmbedModelId(db, 'org-1', 'm-embed-1');
      saveDecisionModelId(db, 'org-1', 'm-decision-1');
      expect(embedModelIdOf(db, 'org-1')).toBe('m-embed-1');
      expect(decisionModelIdOf(db, 'org-1')).toBe('m-decision-1');
      saveEmbedModelId(db, 'org-1', undefined);
      expect(embedModelIdOf(db, 'org-1')).toBeUndefined();
      expect(decisionModelIdOf(db, 'org-1')).toBe('m-decision-1');
    } finally {
      close();
    }
  });

  test('crawl record persists and pins survive a crawl write', () => {
    const { db, close } = setup();
    try {
      expect(memoryCrawlRecord(db, 'org-1')).toBeUndefined();
      saveEmbedModelId(db, 'org-1', 'm-embed-1');
      saveDecisionModelId(db, 'org-1', 'm-decision-1');
      saveMemoryCrawlRecord(db, 'org-1', {
        lastCrawlAt: '2026-10-24T06:00:00.000Z',
        lastCrawlSummary:
          '2 agents · 1 threads consolidated · 3 facts · 0 reflections · 0 promotions',
      });
      expect(memoryCrawlRecord(db, 'org-1')).toEqual({
        lastCrawlAt: '2026-10-24T06:00:00.000Z',
        lastCrawlSummary:
          '2 agents · 1 threads consolidated · 3 facts · 0 reflections · 0 promotions',
      });
      expect(embedModelIdOf(db, 'org-1')).toBe('m-embed-1');
      expect(decisionModelIdOf(db, 'org-1')).toBe('m-decision-1');
    } finally {
      close();
    }
  });
});
