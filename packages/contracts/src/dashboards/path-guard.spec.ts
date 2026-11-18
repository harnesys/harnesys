import { describe, expect, test } from 'bun:test';
import * as barrel from './index.ts';
import { isRiskyOrgApiPath, parseOrgApiPath, parseOrgApiPathShape } from './path-guard.ts';

describe('parseOrgApiPath', () => {
  test('accepts a resource path in the widget org', () => {
    expect(parseOrgApiPath('/orgs/acme/threads', 'acme')).toEqual({
      ok: true,
      path: '/orgs/acme/threads',
    });
  });

  test('accepts a bare org path', () => {
    expect(parseOrgApiPath('/orgs/acme', 'acme')).toEqual({ ok: true, path: '/orgs/acme' });
  });

  test('rejects traversal segments', () => {
    const result = parseOrgApiPath('/orgs/acme/../../fleet/nodes', 'acme');
    expect(result).toEqual({ ok: false, reason: 'path traversal segment' });
  });

  test('rejects percent-encoded traversal', () => {
    const result = parseOrgApiPath('/orgs/acme/%2e%2e/fleet', 'acme');
    expect(result.ok).toBe(false);
  });

  test('rejects another org', () => {
    expect(parseOrgApiPath('/orgs/other/threads', 'acme')).toEqual({
      ok: false,
      reason: 'foreign org',
    });
  });

  test('rejects backslashes', () => {
    const result = parseOrgApiPath('/orgs/acme\\fleet/nodes', 'acme');
    expect(result).toEqual({ ok: false, reason: 'forbidden character' });
  });

  test('rejects query strings', () => {
    const result = parseOrgApiPath('/orgs/acme/threads?limit=5', 'acme');
    expect(result).toEqual({ ok: false, reason: 'forbidden character' });
  });

  test('rejects empty segments', () => {
    expect(parseOrgApiPath('/orgs//threads', 'acme')).toEqual({
      ok: false,
      reason: 'empty segment',
    });
    expect(parseOrgApiPath('/orgs/acme/threads/', 'acme')).toEqual({
      ok: false,
      reason: 'empty segment',
    });
  });

  test('rejects non-org and non-string paths', () => {
    expect(parseOrgApiPath('/fleet/nodes', 'acme').ok).toBe(false);
    expect(parseOrgApiPath(42, 'acme')).toEqual({ ok: false, reason: 'path must be a string' });
  });
});

describe('parseOrgApiPathShape', () => {
  test('accepts any org because it does not compare', () => {
    expect(parseOrgApiPathShape('/orgs/other/threads')).toEqual({
      ok: true,
      path: '/orgs/other/threads',
    });
  });

  test('reports structure errors with a reason', () => {
    expect(parseOrgApiPathShape('/orgs/acme/./threads')).toEqual({
      ok: false,
      reason: 'path traversal segment',
    });
  });
});

describe('isRiskyOrgApiPath', () => {
  test('flags risky resource families', () => {
    expect(isRiskyOrgApiPath('/orgs/acme/vault/items')).toBe(true);
    expect(isRiskyOrgApiPath('/orgs/acme/permission-grants')).toBe(true);
    expect(isRiskyOrgApiPath('/orgs/acme/fleet/nodes')).toBe(true);
  });

  test('ignores ordinary resource families and org names', () => {
    expect(isRiskyOrgApiPath('/orgs/acme/threads')).toBe(false);
    expect(isRiskyOrgApiPath('/orgs/vault/threads')).toBe(false);
  });
});

describe('path-guard module location', () => {
  test('the dashboards barrel re-exports the guard instance', () => {
    expect(barrel.parseOrgApiPath).toBe(parseOrgApiPath);
    expect(barrel.parseOrgApiPathShape).toBe(parseOrgApiPathShape);
    expect(barrel.isRiskyOrgApiPath).toBe(isRiskyOrgApiPath);
  });
});
