import { Database, type Statement } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AddonException } from '../../../domain/addons/errors.ts';
import { assertAddonSqlAllowed } from './sql-guard.ts';

export const ADDON_DB_RESULT_CAP_BYTES = 8 * 1024 * 1024;
export const ADDON_DB_STATEMENT_TIMEOUT_MS = 5_000;
export const ADDON_DB_BATCH_MAX = 100;
const PAGE_SIZE_PLACEHOLDER = 4096;

export interface AddonDbOptions {
  quotaMb?: number;
}

export interface AddonDbBatchItem {
  sql: string;
  params?: unknown[];
}

export interface AddonDbRunResult {
  changes: number;
  lastInsertRowid: string | number;
}

function normalizeRowid(value: string | number | bigint): string | number {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  return value;
}

export class AddonDb {
  private readonly sqlite: Database;
  private readonly statements = new Map<string, Statement>();
  private readonly quotaBytes: number | null;
  private quotaExceeded = false;

  constructor(path: string, options: AddonDbOptions = {}) {
    mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec('PRAGMA journal_mode = WAL;');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.quotaBytes = options.quotaMb && options.quotaMb > 0 ? options.quotaMb * 1024 * 1024 : null;
  }

  exec(sql: string): void {
    this.assertWritable();
    this.prepare(sql);
    this.sqlite.exec(sql);
    this.enforceQuota();
  }

  run(sql: string, params: unknown[] = []): AddonDbRunResult {
    this.assertWritable();
    const statement = this.prepare(sql);
    const result = this.withTimeout(sql, () => statement.run(...params));
    this.enforceQuota();
    return { changes: result.changes, lastInsertRowid: normalizeRowid(result.lastInsertRowid) };
  }

  all(sql: string, params: unknown[] = []): unknown[] {
    const statement = this.prepare(sql);
    const rows = this.withTimeout(sql, () => statement.all(...params));
    const bytes = Buffer.byteLength(JSON.stringify(rows) ?? 'null');
    if (bytes > ADDON_DB_RESULT_CAP_BYTES) {
      throw new AddonException(
        'quota_exceeded',
        413,
        `query result exceeds ${ADDON_DB_RESULT_CAP_BYTES} bytes`,
      );
    }
    return rows;
  }

  get(sql: string, params: unknown[] = []): unknown | null {
    const statement = this.prepare(sql);
    return this.withTimeout(sql, () => statement.get(...params)) ?? null;
  }

  batch(items: readonly AddonDbBatchItem[]): AddonDbRunResult[] {
    if (items.length > ADDON_DB_BATCH_MAX) {
      throw new AddonException(
        'invalid_params',
        400,
        `batch exceeds ${ADDON_DB_BATCH_MAX} statements`,
      );
    }
    for (const item of items) {
      this.assertWritable();
      this.prepare(item.sql);
    }
    const results: AddonDbRunResult[] = [];
    const tx = this.sqlite.transaction((): void => {
      for (const item of items) {
        const result = this.prepare(item.sql).run(...(item.params ?? []));
        results.push({
          changes: result.changes,
          lastInsertRowid: normalizeRowid(result.lastInsertRowid),
        });
      }
    });
    try {
      tx.immediate();
    } catch (error) {
      this.enforceQuota();
      throw error;
    }
    this.enforceQuota();
    return results;
  }

  sizeBytes(): number {
    const counts = this.sqlite.query('PRAGMA page_count').get() as { page_count: number } | null;
    const sizes = this.sqlite.query('PRAGMA page_size').get() as { page_size: number } | null;
    return (counts?.page_count ?? 0) * (sizes?.page_size ?? PAGE_SIZE_PLACEHOLDER);
  }

  quotaReached(): boolean {
    return this.quotaExceeded;
  }

  close(): void {
    this.sqlite.close();
  }

  private prepare(sql: string): Statement {
    assertAddonSqlAllowed(sql);
    const cached = this.statements.get(sql);
    if (cached) {
      return cached;
    }
    const statement = this.sqlite.query(sql);
    this.statements.set(sql, statement);
    return statement;
  }

  private assertWritable(): void {
    if (this.quotaExceeded) {
      throw new AddonException(
        'quota_exceeded',
        413,
        'addon database quota exceeded; free space before writing again',
      );
    }
  }

  private enforceQuota(): void {
    if (this.quotaBytes === null || this.quotaExceeded) {
      return;
    }
    if (this.sizeBytes() > this.quotaBytes) {
      this.quotaExceeded = true;
      throw new AddonException(
        'quota_exceeded',
        413,
        `addon database exceeds quota of ${this.quotaBytes} bytes`,
      );
    }
  }

  private withTimeout<T>(sql: string, fn: () => T): T {
    const startedAt = performance.now();
    const result = fn();
    if (performance.now() - startedAt > ADDON_DB_STATEMENT_TIMEOUT_MS) {
      throw new AddonException(
        'timeout',
        504,
        `statement exceeded ${ADDON_DB_STATEMENT_TIMEOUT_MS}ms: ${sql.slice(0, 80)}`,
      );
    }
    return result;
  }
}
