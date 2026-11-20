import { describe, expect, test } from 'bun:test';
import { buildAuth } from './auth.ts';

describe('buildAuth', () => {
  test('none adds nothing', () => {
    expect(buildAuth('none', null, 'tok', null)).toEqual({ headers: {}, query: {} });
  });

  test('bearer sets the Authorization header', () => {
    expect(buildAuth('bearer', null, 'tok', null)).toEqual({
      headers: { Authorization: 'Bearer tok' },
      query: {},
    });
  });

  test('basic encodes user:token as base64', () => {
    const result = buildAuth('basic', null, 'tok', 'alice');
    expect(result.headers.Authorization).toBe(`Basic ${btoa('alice:tok')}`);
    expect(result.query).toEqual({});
  });

  test('header uses the configured parameter name', () => {
    expect(buildAuth('header', 'X-Api-Key', 'tok', null)).toEqual({
      headers: { 'X-Api-Key': 'tok' },
      query: {},
    });
  });

  test('query uses the configured parameter name', () => {
    expect(buildAuth('query', 'api_key', 'tok', null)).toEqual({
      headers: {},
      query: { api_key: 'tok' },
    });
  });

  test('header and query fall back to a default parameter name', () => {
    expect(buildAuth('header', null, 'tok', null)).toEqual({
      headers: { 'X-Api-Key': 'tok' },
      query: {},
    });
    expect(buildAuth('query', null, 'tok', null)).toEqual({
      headers: {},
      query: { api_key: 'tok' },
    });
  });
});
