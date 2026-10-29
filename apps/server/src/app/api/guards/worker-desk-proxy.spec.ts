import { describe, expect, test } from 'bun:test';
import { orgIdFromRequest } from './worker-desk-proxy.ts';

describe('worker desk proxy helpers', () => {
  test('reads org id from header or path', () => {
    const url = new URL('http://localhost/api/orgs/abc/agents');
    expect(orgIdFromRequest(url, 'hdr')).toBe('hdr');
    expect(orgIdFromRequest(url, null)).toBe('abc');
  });
});
