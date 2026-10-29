import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../domain/identity/principal.ts';
import {
  assertRunStart,
  mechanicalRunStart,
  principalUserId,
  recordOwnerOnWrite,
} from './run-attribution.ts';

const user: Principal = { kind: 'user', userId: 'u1', capabilities: [], orgId: 'o1' };
const node: Principal = { kind: 'node', nodeId: 'n1', orgId: 'o1' };

describe('mechanical run attribution', () => {
  test('schedule/webhook/rule owner stamps a user on via=agent and stays exempt from the anonymous reject', () => {
    const start = mechanicalRunStart('mira');
    expect(start).toEqual({ startedByUserId: 'mira', via: 'agent' });
    expect(() => assertRunStart(start)).not.toThrow();
    expect(() => assertRunStart(mechanicalRunStart(null))).not.toThrow();
    expect(mechanicalRunStart(null)).toEqual({ via: 'agent' });
  });

  test('record owner is the creating user, node principals leave it empty', () => {
    expect(principalUserId(user)).toBe('u1');
    expect(principalUserId(node)).toBeNull();
    expect(principalUserId(undefined)).toBeNull();
    expect(recordOwnerOnWrite(null, principalUserId(user))).toBe('u1');
    expect(recordOwnerOnWrite(null, principalUserId(node))).toBeNull();
  });

  test('update keeps the recorded owner and only adopts one when absent', () => {
    expect(recordOwnerOnWrite('mira', 'nadya')).toBe('mira');
    expect(recordOwnerOnWrite(null, 'nadya')).toBe('nadya');
    expect(recordOwnerOnWrite('mira', null)).toBe('mira');
    expect(recordOwnerOnWrite(null, null)).toBeNull();
  });
});
