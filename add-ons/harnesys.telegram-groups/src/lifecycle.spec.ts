import { describe, expect, test } from 'bun:test';
import { memberGoneStatus } from './lifecycle.ts';

describe('membership lifecycle', () => {
  test('a bot removed from the chat ends every binding of that chat', () => {
    expect(memberGoneStatus('left')).toBe(true);
    expect(memberGoneStatus('kicked')).toBe(true);
  });

  test('present memberships keep the bindings alive', () => {
    expect(memberGoneStatus('member')).toBe(false);
    expect(memberGoneStatus('administrator')).toBe(false);
    expect(memberGoneStatus('creator')).toBe(false);
    expect(memberGoneStatus(undefined)).toBe(false);
    expect(memberGoneStatus(null)).toBe(false);
  });
});
