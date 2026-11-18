/**
 * Normalize an evaluated query Expr into URL parameters. Nullish entries are
 * dropped, objects and arrays are JSON encoded, scalars become their string
 * form. Returns undefined when nothing is left.
 */
export function toQueryRecord(value: unknown): Record<string, string> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) {
      continue;
    }
    record[key] = typeof entry === 'object' ? JSON.stringify(entry) : String(entry);
  }
  return Object.keys(record).length > 0 ? record : undefined;
}
