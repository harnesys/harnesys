import { describe, expect, test } from 'bun:test';
import { resolveInsideSource } from './lsp-query.use-case.ts';

describe('resolveInsideSource', () => {
  test('resolves relative path inside the source root', () => {
    const result = resolveInsideSource('/srv/org/src', 'lib/main.ts');
    expect(result).toBe('/srv/org/src/lib/main.ts');
  });

  test('rejects escaping paths', () => {
    expect(() => resolveInsideSource('/srv/org/src', '../outside/x.ts')).toThrow(
      /escapes the source root/,
    );
  });

  test('rejects absolute paths outside the root', () => {
    expect(() => resolveInsideSource('/srv/org/src', '/etc/passwd')).toThrow(
      /escapes the source root/,
    );
  });
});
