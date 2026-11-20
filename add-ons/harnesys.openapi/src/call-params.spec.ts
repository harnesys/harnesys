import { describe, expect, test } from 'bun:test';
import { splitOperationParams } from './call.ts';
import type { OperationSpec } from './openapi/types.ts';
import { buildUrl, withQuery } from './url.ts';

const SPEC: OperationSpec = {
  params: [
    { name: 'petId', in: 'path', required: true },
    { name: 'verbose', in: 'query', required: false },
    { name: 'X-Trace', in: 'header', required: false, schema: { type: 'string' } },
  ],
  bodyRequired: false,
  bodySchema: null,
  responses: [],
};

describe('splitOperationParams', () => {
  test('routes flat params to path, query and header', () => {
    const split = splitOperationParams(SPEC, { petId: 'a/b', verbose: true, 'X-Trace': 't1' });
    expect(split.path).toEqual({ petId: 'a/b' });
    expect(split.query).toEqual({ verbose: 'true' });
    expect(split.headers).toEqual({ 'X-Trace': 't1' });
    expect(split.missing).toEqual([]);
    expect(split.unknown).toEqual([]);
  });

  test('reports missing required and unknown keys', () => {
    const split = splitOperationParams(SPEC, { noise: 1, petId: null });
    expect(split.missing).toEqual(['petId (path)']);
    expect(split.unknown).toEqual(['noise']);
  });

  test('serializes non-scalar values as JSON', () => {
    const split = splitOperationParams(SPEC, { petId: ['a', 'b'] });
    expect(split.path.petId).toBe('["a","b"]');
  });

  test('matches header names case-insensitively', () => {
    const split = splitOperationParams(SPEC, { petId: 'a', 'x-trace': 't1' });
    expect(split.headers).toEqual({ 'X-Trace': 't1' });
    expect(split.unknown).toEqual([]);
  });

  test('required header is satisfied by a case-variant key', () => {
    const spec: OperationSpec = {
      params: [{ name: 'Accept-Language', in: 'header', required: true }],
      bodyRequired: false,
      bodySchema: null,
      responses: [],
    };
    const split = splitOperationParams(spec, { 'accept-language': 'en' });
    expect(split.headers).toEqual({ 'Accept-Language': 'en' });
    expect(split.missing).toEqual([]);
    expect(split.unknown).toEqual([]);
  });

  test('empty path values are reported as missing', () => {
    const split = splitOperationParams(SPEC, { petId: '' });
    expect(split.missing).toEqual(['petId (path, non-empty value required)']);
    expect(split.path).toEqual({});
  });
});

describe('buildUrl', () => {
  test('substitutes path params and joins the base URL', () => {
    expect(buildUrl('https://api.example/v1/', '/pets/{petId}', { petId: 'a/b' })).toBe(
      'https://api.example/v1/pets/a%2Fb',
    );
    expect(buildUrl('https://api.example', 'pets', {})).toBe('https://api.example/pets');
    expect(buildUrl('https://api.example', '/pets/{petId}', {})).toBe(
      'https://api.example/pets/{petId}',
    );
  });
});

describe('withQuery', () => {
  test('appends query params with encoding', () => {
    expect(withQuery('https://api.example/pets', { verbose: 'true', q: 'a b&c' })).toBe(
      'https://api.example/pets?verbose=true&q=a+b%26c',
    );
    expect(withQuery('https://api.example/pets?x=1', {})).toBe('https://api.example/pets?x=1');
    expect(withQuery('https://api.example/pets?x=1', { y: '2' })).toBe(
      'https://api.example/pets?x=1&y=2',
    );
  });
});
