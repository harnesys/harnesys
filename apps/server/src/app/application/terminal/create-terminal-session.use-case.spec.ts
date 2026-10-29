import { describe, expect, test } from 'bun:test';
import { TerminalCwdInvalidException } from '../../domain/terminal/terminal.error.ts';
import { resolveTerminalCwd } from './create-terminal-session.use-case.ts';

describe('resolveTerminalCwd', () => {
  test('defaults to source root', () => {
    expect(resolveTerminalCwd('/srv/src', undefined)).toBe('/srv/src');
    expect(resolveTerminalCwd('/srv/src', '.')).toBe('/srv/src');
    expect(resolveTerminalCwd('/srv/src', '')).toBe('/srv/src');
  });

  test('resolves relative path inside root', () => {
    expect(resolveTerminalCwd('/srv/src', 'packages/app')).toBe('/srv/src/packages/app');
  });

  test('rejects path that escapes root', () => {
    expect(() => resolveTerminalCwd('/srv/src', '../outside')).toThrow(TerminalCwdInvalidException);
  });
});
