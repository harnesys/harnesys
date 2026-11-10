import { AddonException } from '../../../domain/addons/errors.ts';

export const ADDON_DB_ALLOWED_PRAGMAS = ['user_version', 'foreign_keys'] as const;

const DENIED_KEYWORDS = [
  { pattern: /\battach\b/i, keyword: 'ATTACH' },
  { pattern: /\bdetach\b/i, keyword: 'DETACH' },
  { pattern: /\bload_extension\s*\(/i, keyword: 'load_extension' },
] as const;

export function assertAddonSqlAllowed(sql: string): void {
  for (const denied of DENIED_KEYWORDS) {
    if (denied.pattern.test(sql)) {
      throw deniedSql(`${denied.keyword} is not allowed for addon databases`);
    }
  }
  for (const statement of splitStatements(sql)) {
    assertStatementAllowed(statement);
  }
}

export function isAddonSqlAllowed(sql: string): boolean {
  try {
    assertAddonSqlAllowed(sql);
    return true;
  } catch {
    return false;
  }
}

function deniedSql(message: string): AddonException {
  return new AddonException('permission_denied', 403, message);
}

function assertStatementAllowed(statement: string): void {
  const pragma = pragmaName(statement);
  if (pragma === null) {
    return;
  }
  if (pragma.value !== null) {
    throw deniedSql(`PRAGMA ${pragma.name} writes are not allowed for addon databases`);
  }
  if (
    !ADDON_DB_ALLOWED_PRAGMAS.includes(pragma.name as (typeof ADDON_DB_ALLOWED_PRAGMAS)[number])
  ) {
    throw deniedSql(`PRAGMA ${pragma.name} is not in the addon database whitelist`);
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

function pragmaName(sql: string): { name: string; value: string | null } | null {
  const match = /^\s*pragma\s+([a-zA-Z_]+)\s*(=\s*(.+))?$/i.exec(sql);
  if (!match) {
    return null;
  }
  const name = match[1] ?? '';
  const write = match[3] ?? null;
  return { name: name.toLowerCase(), value: write };
}
