import { describe, expect, test } from 'bun:test';
import { migrateRepositoryWorktreeBranchUniqueIndex } from './org-sql-worktrees.ts';

function fakeTables(indexNames: string[], dupes: number) {
  return {
    exec: (_sql: string) => {},
    all: (sql: string): { name: string }[] => {
      if (sql.startsWith('PRAGMA index_list')) {
        return indexNames.map((name) => ({ name }));
      }
      return Array.from({ length: dupes }, (_, i) => ({ name: `dup-${i}` }));
    },
  };
}

describe('migrateRepositoryWorktreeBranchUniqueIndex', () => {
  test('returns 0 and skips query when index already present', () => {
    const tables = fakeTables(['repository_worktrees_active_branch_unique'], 5);
    expect(migrateRepositoryWorktreeBranchUniqueIndex(tables.exec, tables.all)).toBe(0);
  });

  test('returns 0 when index created cleanly', () => {
    const tables = fakeTables([], 0);
    expect(migrateRepositoryWorktreeBranchUniqueIndex(tables.exec, tables.all)).toBe(0);
  });

  test('returns duplicate group count when creation fails on existing dupes', () => {
    const exec = (sql: string) => {
      if (sql.includes('CREATE UNIQUE INDEX')) {
        throw new Error('UNIQUE constraint failed');
      }
    };
    const all = (sql: string): { name: string }[] => {
      if (sql.startsWith('PRAGMA index_list')) {
        return [];
      }
      return [{ name: 'g1' }, { name: 'g2' }];
    };
    expect(migrateRepositoryWorktreeBranchUniqueIndex(exec, all)).toBe(2);
  });
});
