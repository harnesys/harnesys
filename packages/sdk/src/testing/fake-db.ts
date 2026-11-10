import type { DbRow, DbStatement, DbWriteResult, SqlParam } from '../addon-context.ts';

type BunDatabaseCtor = new (path: string, options?: Record<string, unknown>) => import('bun:sqlite').Database;
const loadDatabase = (): BunDatabaseCtor => {
  // bun:sqlite must not be evaluated in browser bundles — resolved lazily.
  const mod = require('bun:sqlite') as typeof import('bun:sqlite');
  return mod.Database as unknown as BunDatabaseCtor;
};

const FORBIDDEN_SQL = [/\battach\b/i, /\bdetach\b/i, /\bload_extension\s*\(/i];
const ALLOWED_PRAGMAS = [
  /^pragma\s+user_version\b/i,
  /^pragma\s+foreign_keys\b/i,
  /^pragma\s+table_info\b/i,
];

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
  const trimmed = sql.trim().toLowerCase();
  if (trimmed.startsWith('pragma') && !ALLOWED_PRAGMAS.some((pattern) => pattern.test(trimmed))) {
    throw new SqlAuthorizerError(`pragma is not allowed: ${sql}`);
  }
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
