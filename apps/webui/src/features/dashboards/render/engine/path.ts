const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Read a nested value by dotted path with numeric index support:
 * `readPath(obj, 'items[0].stats.count')`.
 */
export function readPath(root: unknown, path: string): unknown {
  if (!path) {
    return root;
  }
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '')
    .split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (UNSAFE_KEYS.has(part)) {
      return undefined;
    }
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
