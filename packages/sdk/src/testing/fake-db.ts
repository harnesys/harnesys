import type { Database } from 'bun:sqlite';
import type { DbRow, DbStatement, DbWriteResult, SqlParam } from '../addon-context.ts';

type BunDatabaseCtor = new (path: string, options?: Record<string, unknown>) => Database;
const loadDatabase = (): BunDatabaseCtor => {
  // bun:sqlite must not be evaluated in browser bundles — resolved lazily.
  const mod = require('bun:sqlite') as { Database: BunDatabaseCtor };
  return mod.Database;
};

const FORBIDDEN_SQL = [/\battach\b/i, /\bdetach\b/i, /\bload_extension\s*\(/i];
const ALLOWED_PRAGMAS = ['user_version', 'foreign_keys'] as const;

export class SqlAuthorizerError extends Error {
  readonly reason = 'permission_denied';
  constructor(message: string) {
    super(message);
    this.name = 'SqlAuthorizerError';
  }
}

export function guardSql(sql: string): void {
  for (const pattern of FORBIDDEN_SQL) {
    if (pattern.test(sql)) {
      throw new SqlAuthorizerError(`sql statement is not allowed: ${pattern.source}`);
    }
  }
  for (const statement of splitStatements(sql)) {
    assertStatementAllowed(statement);
  }
}

// Mirrors apps/server/src/app/infra/addons/storage/sql-guard.ts: the fake and the
// real host must accept and reject identical statements.
function assertStatementAllowed(statement: string): void {
  const match = /^\s*pragma\s+([a-zA-Z_]+)\s*(=\s*(.+))?$/i.exec(statement);
  if (!match) {
    return;
  }
  const name = (match[1] ?? '').toLowerCase();
  if ((match[3] ?? null) !== null) {
    throw new SqlAuthorizerError(`pragma writes are not allowed: ${statement.trim()}`);
  }
  if (!ALLOWED_PRAGMAS.includes(name as (typeof ALLOWED_PRAGMAS)[number])) {
    throw new SqlAuthorizerError(`pragma is not allowed: ${statement.trim()}`);
  }
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  while (index < sql.length) {
    const char = sql[index] ?? '';
    if (char === "'" || char === '"' || char === '`') {
      const end = quotedEnd(sql, index);
      current += sql.slice(index, end);
      index = end;
      continue;
    }
    if (char === ';') {
      statements.push(current);
      current = '';
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim().length > 0) {
    statements.push(current);
  }
  return statements.length > 0 ? statements : [sql];
}

// Returns the index just past the closing quote of a quoted run starting at `start`.
function quotedEnd(sql: string, start: number): number {
  const quote = sql[start];
  let index = start + 1;
  while (index < sql.length) {
    const char = sql[index];
    if (char !== quote) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

export interface FakeDb {
  exec(sql: string): void;
  all(sql: string, params?: SqlParam[]): DbRow[];
  get(sql: string, params?: SqlParam[]): DbRow | null;
  run(sql: string, params?: SqlParam[]): DbWriteResult;
  batch(statements: DbStatement[]): DbWriteResult[];
  close(): void;
}

export function createFakeDb(): FakeDb {
  const db = new (loadDatabase())(':memory:');
  db.run('pragma foreign_keys = on');
  return {
    exec(sql: string): void {
      guardSql(sql);
      db.run(sql);
    },
    all(sql: string, params?: SqlParam[]): DbRow[] {
      guardSql(sql);
      return db.prepare(sql).all(...(params ?? [])) as DbRow[];
    },
    get(sql: string, params?: SqlParam[]): DbRow | null {
      guardSql(sql);
      return (db.prepare(sql).get(...(params ?? [])) ?? null) as DbRow | null;
    },
    run(sql: string, params?: SqlParam[]): DbWriteResult {
      guardSql(sql);
      const result = db.run(sql, params ?? []);
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    batch(statements: DbStatement[]): DbWriteResult[] {
      const apply = (): DbWriteResult[] =>
        statements.map((statement) => {
          guardSql(statement.sql);
          const result = db.run(statement.sql, statement.params ?? []);
          return {
            changes: Number(result.changes),
            lastInsertRowid: Number(result.lastInsertRowid),
          };
        });
      return db.transaction(apply)();
    },
    close(): void {
      db.close();
    },
  };
}
