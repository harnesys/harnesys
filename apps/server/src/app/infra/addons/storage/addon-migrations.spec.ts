import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { listMigrations, runAddonMigrations } from './addon-migrations.ts';

const home = mkdtempSync(join(tmpdir(), 'addon-migrations-'));

beforeAll(() => {
  mkdirSync(join(home, 'migrations'), { recursive: true });
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function writeMigration(dir: string, name: string, sql: string): void {
  const path = join(home, dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sql);
}

function userVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query('PRAGMA user_version').get() as { user_version: number } | null;
    return row?.user_version ?? 0;
  } finally {
    db.close();
  }
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();
  } finally {
    db.close();
  }
}

describe('runAddonMigrations', () => {
  test('applies migrations in order and updates user_version', () => {
    writeMigration(
      'migrations',
      '0001_create_notes.sql',
      'CREATE TABLE notes (id TEXT PRIMARY KEY);',
    );
    writeMigration(
      'migrations',
      '0002_add_flag.sql',
      "ALTER TABLE notes ADD COLUMN flag TEXT DEFAULT 'x';",
    );
    const dbPath = join(home, 'a', 'data.db');
    const result = runAddonMigrations({ dbPath, migrationsDir: join(home, 'migrations') });
    expect(result.applied).toEqual([1, 2]);
    expect(userVersion(dbPath)).toBe(2);
    expect(tableNames(dbPath)).toContain('notes');
  });

  test('second run is a no-op', () => {
    const dbPath = join(home, 'a', 'data.db');
    const result = runAddonMigrations({ dbPath, migrationsDir: join(home, 'migrations') });
    expect(result.applied).toEqual([]);
  });

  test('creates VACUUM INTO backup per run and prunes to the keep limit', () => {
    writeMigration('m3', '0001_init.sql', 'CREATE TABLE m3_a (id TEXT PRIMARY KEY);');
    const dbPath = join(home, 'm3', 'data.db');
    runAddonMigrations({ dbPath, migrationsDir: join(home, 'm3'), now: () => 'b1' });
    writeMigration('m3', '0002_more.sql', 'CREATE TABLE m3_b (id TEXT PRIMARY KEY);');
    runAddonMigrations({
      dbPath,
      migrationsDir: join(home, 'm3'),
      now: () => 'b2',
      keepBackups: 1,
    });
    const backups = readdirSync(join(home, 'm3', 'backups')).filter((name) => name.endsWith('.db'));
    expect(backups).toEqual(['b2.db']);
  });

  test('failed migration restores the backup and throws migration_failed', () => {
    writeMigration(
      'migrations',
      '0004_bad.sql',
      'CREATE TABLE broken (id TEXT PRIMARY KEY);\nINSERT INTO missing_table VALUES (1);',
    );
    const dbPath = join(home, 'a', 'data.db');
    expect(() => runAddonMigrations({ dbPath, migrationsDir: join(home, 'migrations') })).toThrow(
      /migration failed/,
    );
    expect(userVersion(dbPath)).toBe(2);
    expect(tableNames(dbPath)).not.toContain('broken');
    expect(tableNames(dbPath)).toContain('notes');
  });

  test('schema_newer rejection when user_version exceeds package migrations', () => {
    const dbPath = join(home, 'newer', 'data.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath, { create: true });
    try {
      db.exec('PRAGMA user_version = 9');
    } finally {
      db.close();
    }
    expect(() => runAddonMigrations({ dbPath, migrationsDir: join(home, 'migrations') })).toThrow(
      /schema is newer/,
    );
    expect(userVersion(dbPath)).toBe(9);
  });

  test('listMigrations ignores non-migration files and missing dirs', () => {
    expect(listMigrations(join(home, 'nope'))).toEqual([]);
    writeMigration('migrations', 'readme.txt', 'nope');
    expect(listMigrations(join(home, 'migrations')).map((migration) => migration.number)).toEqual([
      1, 2, 4,
    ]);
  });

  test('fresh package without pending migrations leaves db at version 0', () => {
    const dbPath = join(home, 'fresh', 'data.db');
    runAddonMigrations({ dbPath, migrationsDir: join(home, 'empty') });
    expect(userVersion(dbPath)).toBe(0);
  });
});
