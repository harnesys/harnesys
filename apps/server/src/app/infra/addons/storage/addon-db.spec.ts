import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADDON_DB_BATCH_MAX, AddonDb } from './addon-db.ts';
import { isAddonSqlAllowed } from './sql-guard.ts';

const home = mkdtempSync(join(tmpdir(), 'addon-db-'));

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function openDb(quotaMb?: number): AddonDb {
  return new AddonDb(join(home, `db-${Math.random().toString(36).slice(2)}.db`), { quotaMb });
}
describe('addon SQL guard', () => {
  test('denies ATTACH, DETACH and load_extension', () => {
    expect(isAddonSqlAllowed("ATTACH DATABASE 'x' AS y")).toBe(false);
    expect(isAddonSqlAllowed('DETACH y')).toBe(false);
    expect(isAddonSqlAllowed("SELECT load_extension('evil')")).toBe(false);
  });

  test('PRAGMA whitelist allows user_version and foreign_keys reads only', () => {
    expect(isAddonSqlAllowed('PRAGMA user_version')).toBe(true);
    expect(isAddonSqlAllowed('PRAGMA foreign_keys')).toBe(true);
    expect(isAddonSqlAllowed('PRAGMA journal_mode = WAL')).toBe(false);
    expect(isAddonSqlAllowed('PRAGMA cache_size = -2000')).toBe(false);
  });

  test('regular statements pass', () => {
    expect(isAddonSqlAllowed('SELECT * FROM notes WHERE id = ?')).toBe(true);
    expect(isAddonSqlAllowed('INSERT INTO notes (id) VALUES (?)')).toBe(true);
  });
});

describe('AddonDb', () => {
  test('run and all round-trip values', () => {
    const db = openDb();
    try {
      db.run('CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT)');
      expect(db.run('INSERT INTO notes (id, text) VALUES (?, ?)', ['n1', 'hello']).changes).toBe(1);
      expect(db.all('SELECT text FROM notes WHERE id = ?', ['n1'])).toEqual([{ text: 'hello' }]);
      expect(db.get('SELECT text FROM notes WHERE id = ?', ['n1'])).toEqual({ text: 'hello' });
    } finally {
      db.close();
    }
  });

  test('guard denies forbidden statements before execution', () => {
    const db = openDb();
    try {
      expect(() => db.run("ATTACH DATABASE '/etc/passwd' AS evil")).toThrow(/ATTACH/);
      expect(() => db.run('PRAGMA journal_mode = DELETE')).toThrow(/PRAGMA/);
      expect(() => db.all("SELECT load_extension('x')")).toThrow(/load_extension/);
    } finally {
      db.close();
    }
  });

  test('oversized result is rejected', () => {
    const db = openDb();
    try {
      db.run('CREATE TABLE big (blob TEXT)');
      db.run('INSERT INTO big (blob) VALUES (?)', ['x'.repeat(9 * 1024 * 1024)]);
      expect(() => db.all('SELECT blob FROM big')).toThrow(/result exceeds/);
    } finally {
      db.close();
    }
  });

  test('batch is atomic: failure rolls back every statement', () => {
    const db = openDb();
    try {
      db.run('CREATE TABLE items (id TEXT PRIMARY KEY)');
      db.batch([
        { sql: 'INSERT INTO items (id) VALUES (?)', params: ['a'] },
        { sql: 'INSERT INTO items (id) VALUES (?)', params: ['b'] },
      ]);
      expect(db.all('SELECT id FROM items ORDER BY id').length).toBe(2);
      expect(() =>
        db.batch([
          { sql: 'INSERT INTO items (id) VALUES (?)', params: ['c'] },
          { sql: 'INSERT INTO items (id) VALUES (?)', params: ['a'] },
        ]),
      ).toThrow();
      expect(
        db.all('SELECT id FROM items ORDER BY id').map((row) => (row as { id: string }).id),
      ).toEqual(['a', 'b']);
    } finally {
      db.close();
    }
  });

  test('batch over the statement cap is rejected', () => {
    const db = openDb();
    try {
      const items = Array.from({ length: ADDON_DB_BATCH_MAX + 1 }, () => ({ sql: 'SELECT 1' }));
      expect(() => db.batch(items)).toThrow(/batch exceeds/);
    } finally {
      db.close();
    }
  });

  test('quota breach sets quota_exceeded and blocks further writes', () => {
    const db = openDb(1);
    try {
      db.run('CREATE TABLE blob (data BLOB)');
      expect(() =>
        db.run('INSERT INTO blob (data) VALUES (?)', [new Uint8Array(4 * 1024 * 1024)]),
      ).toThrow(/exceeds quota/);
      expect(db.quotaReached()).toBe(true);
      expect(() => db.run('INSERT INTO blob (data) VALUES (?)', [new Uint8Array(8)])).toThrow(
        /quota exceeded/,
      );
      expect(db.all('SELECT COUNT(*) AS n FROM blob')).toEqual([{ n: 1 }]);
    } finally {
      db.close();
    }
  });

  test('sqlite file is created under the addon data dir layout', () => {
    const path = join(home, 'org-9', 'addons', 'harnesys.test-addon', 'data.db');
    const db = new AddonDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(db.sizeBytes()).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
