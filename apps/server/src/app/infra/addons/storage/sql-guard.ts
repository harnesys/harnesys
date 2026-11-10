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
  const pragma = pragmaName(sql);
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

function pragmaName(sql: string): { name: string; value: string | null } | null {
  const match = /^\s*pragma\s+([a-zA-Z_]+)\s*(=\s*(.+))?$/i.exec(sql);
  if (!match) {
    return null;
  }
  const name = match[1] ?? '';
  const write = match[3] ?? null;
  return { name: name.toLowerCase(), value: write };
}
