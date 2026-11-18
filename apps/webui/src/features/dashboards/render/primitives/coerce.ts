export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function asNumber(value: unknown, fallback: number): number {
  return asOptionalNumber(value) ?? fallback;
}

/** Numbers and numeric strings: a bound state value is often a string. */
export function asNumeric(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Display text from any JSON scalar; objects and nullish values drop out. */
export function asText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

export function asBool(value: unknown): boolean {
  return value === true;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  return asArray(value).filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}
