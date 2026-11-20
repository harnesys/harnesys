function jsonOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function plainToolCallArgs(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) {
    return {};
  }
  const value = typeof raw === 'string' ? jsonOrRaw(raw) : raw;
  if (isPlainObject(value)) {
    return value;
  }
  return { input: value };
}
