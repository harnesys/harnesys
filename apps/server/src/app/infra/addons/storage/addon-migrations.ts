import { Database } from 'bun:sqlite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { AddonException } from '../../../domain/addons/errors.ts';

export interface AddonMigrationRunInput {
  dbPath: string;
  migrationsDir: string;
  now?: () => string;
  keepBackups?: number;
}

export interface AddonMigrationRunResult {
  applied: number[];
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-zA-Z0-9_-]+\.sql$/;
const DEFAULT_KEEP_BACKUPS = 3;

export function runAddonMigrations(input: AddonMigrationRunInput): AddonMigrationRunResult {
  const migrations = listMigrations(input.migrationsDir);
  mkdirSync(dirname(input.dbPath), { recursive: true });
  const sqlite = new Database(input.dbPath, { create: true });
  let closed = false;
  try {
    const current = readUserVersion(sqlite);
    const last = migrations.at(-1)?.number ?? 0;
    if (current > last) {
      throw schemaNewer(current, last);
    }
    const pending = migrations.filter((migration) => migration.number > current);
    if (pending.length === 0) {
      closed = true;
      sqlite.close();
      return { applied: [] };
    }
    const backupPath = createBackup(sqlite, input);
    let failure: unknown = null;
    try {
      for (const migration of pending) {
        applyMigration(sqlite, migration);
      }
    } catch (error) {
      failure = error;
    }
    closed = true;
    sqlite.close();
    if (failure !== null) {
      restoreBackup(input.dbPath, backupPath);
      throw new AddonException(
        'migration_failed',
        500,
        `addon migration failed, database restored from backup: ${basename(backupPath)}`,
        { failedMigration: failure instanceof Error ? failure.message : String(failure) },
      );
    }
    return { applied: pending.map((migration) => migration.number) };
  } finally {
    if (!closed) {
      sqlite.close();
    }
  }
}

export function listMigrations(migrationsDir: string): Array<{ number: number; path: string }> {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  const files = readdirSync(migrationsDir)
    .map((name) => {
      const match = MIGRATION_FILE_PATTERN.exec(name);
      return match === null ? null : { number: Number(match[1]), path: join(migrationsDir, name) };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.number - b.number);
  const numbers = files.map((file) => file.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new AddonException('migration_failed', 500, 'duplicate migration numbers in package');
  }
  return files;
}

function applyMigration(sqlite: Database, migration: { number: number; path: string }): void {
  const tx = sqlite.transaction(() => {
    sqlite.exec(readFileSync(migration.path, 'utf8'));
    sqlite.exec(`PRAGMA user_version = ${migration.number}`);
  });
  tx.immediate();
}

function readUserVersion(sqlite: Database): number {
  const row = sqlite.query('PRAGMA user_version').get() as { user_version: number } | null;
  return row?.user_version ?? 0;
}

function createBackup(sqlite: Database, input: AddonMigrationRunInput): string {
  const backupsDir = join(dirname(input.dbPath), 'backups');
  mkdirSync(backupsDir, { recursive: true });
  const stamp = input.now ? input.now() : new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupsDir, `${stamp}.db`);
  sqlite.exec(`VACUUM INTO '${escapeSqlString(backupPath)}'`);
  pruneBackups(backupsDir, input.keepBackups ?? DEFAULT_KEEP_BACKUPS);
  return backupPath;
}

function pruneBackups(backupsDir: string, keep: number): void {
  const backups = readdirSync(backupsDir)
    .filter((name) => name.endsWith('.db'))
    .sort()
    .map((name) => join(backupsDir, name));
  for (const path of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(path, { force: true });
  }
}

function restoreBackup(dbPath: string, backupPath: string): void {
  for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    rmSync(sidecar, { force: true });
  }
  copyFileSync(backupPath, dbPath);
  if (statSync(dbPath).size === 0) {
    throw new AddonException('migration_failed', 500, 'backup restore produced an empty database');
  }
}

function schemaNewer(current: number, last: number): AddonException {
  return new AddonException(
    'migration_failed',
    409,
    `database schema is newer than the addon package: user_version ${current} > last migration ${last}`,
    { detail: 'schema_newer', current, last },
  );
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}
