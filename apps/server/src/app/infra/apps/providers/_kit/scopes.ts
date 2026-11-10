export type ScopeMapping = Record<string, string>;

export function toProviderScopes(keys: readonly string[], mapping: ScopeMapping): string[] {
  return keys.map((key) => mapping[key]).filter((value): value is string => value !== undefined);
}

export function fromProviderScopes(raw: string | undefined, mapping: ScopeMapping): string[] {
  if (!raw) {
    return [];
  }
  const reverse = new Map(Object.entries(mapping).map(([key, value]) => [value, key]));
  return raw
    .split(/[\s,]+/)
    .map((value) => reverse.get(value))
    .filter((value): value is string => value !== undefined);
}
