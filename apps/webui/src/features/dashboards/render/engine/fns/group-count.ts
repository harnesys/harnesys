import { readPath } from '../path';
import type { ExprFn } from './types.ts';
import { asList, isPlainObject, stringOf } from './values.ts';

interface ExprGroupCount {
  key: string;
  count: number;
}

function groupKeyOf(entry: unknown, path: string | null): string {
  const value = path !== null && isPlainObject(entry) ? readPath(entry, path) : entry;
  return value === null || value === undefined ? '' : stringOf(value);
}

export const groupCount: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  const path = args[1];
  const key = typeof path === 'string' && path !== '' ? path : null;
  const counts = new Map<string, number>();
  for (const entry of list) {
    const group = groupKeyOf(entry, key);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const groups: ExprGroupCount[] = [...counts].map(([groupKey, count]) => ({
    key: groupKey,
    count,
  }));
  return groups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};
