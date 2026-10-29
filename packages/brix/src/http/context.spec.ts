import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import {
  createRequestContext,
  createTraceId,
  getContextValue,
  getRequestContext,
  getTraceId,
  runWithRequestContext,
  setContextValue,
  TRACE_ID_KEY,
} from './context';

function source(vars: Record<string, unknown>, header?: string) {
  return {
    get: (key: string) => vars[key],
    req: { header: (name: string) => (name === 'x-request-id' ? header : undefined) },
  };
}

function storeOf(vars: Record<string, unknown>) {
  return {
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
  };
}

describe('getTraceId', () => {
  test('prefers the generated id stored on the context', () => {
    expect(getTraceId(source({ [TRACE_ID_KEY]: 'stored' }, 'client'))).toBe('stored');
  });

  test('falls back to the x-request-id header when nothing is stored', () => {
    expect(getTraceId(source({}, 'client'))).toBe('client');
  });

  test('returns undefined when neither the context nor the header carries an id', () => {
    expect(getTraceId(source({}))).toBeUndefined();
  });
});

describe('createTraceId', () => {
  test('keeps the incoming header value', () => {
    expect(createTraceId('abc')).toBe('abc');
  });

  test('generates a fresh id when the header is missing', () => {
    const first = createTraceId(undefined);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(createTraceId(undefined)).not.toBe(first);
  });
});

describe('request context', () => {
  test('binds the context inside the callback and restores the outer one', () => {
    const request = new Request('http://localhost/api/items');
    expect(getRequestContext()).toBeUndefined();

    const seen = runWithRequestContext(
      createRequestContext(request, storeOf({ traceId: 't1' })),
      () => {
        const nested = runWithRequestContext(
          createRequestContext(request, storeOf({ traceId: 't2' })),
          () => getContextValue<string>('traceId'),
        );
        return { outer: getContextValue<string>('traceId'), nested };
      },
    );

    expect(seen).toEqual({ outer: 't1', nested: 't2' });
    expect(getRequestContext()).toBeUndefined();
  });

  test('getContextValue reads and setContextValue writes through the store', () => {
    const vars: Record<string, unknown> = {};
    runWithRequestContext(
      createRequestContext(new Request('http://localhost'), storeOf(vars)),
      () => {
        setContextValue<string>('orgId', 'org-1');
        expect(getContextValue<string>('orgId')).toBe('org-1');
        expect(vars.orgId).toBe('org-1');
      },
    );
  });

  test('persists across awaited async boundaries', async () => {
    const ctx = createRequestContext(
      new Request('http://localhost'),
      storeOf({ [TRACE_ID_KEY]: 't3' }),
    );

    const seen = await runWithRequestContext(ctx, async () => {
      await Promise.resolve();
      return getContextValue<string>(TRACE_ID_KEY);
    });

    expect(seen).toBe('t3');
  });

  test('setContextValue throws outside of a request context', () => {
    expect(() => setContextValue<string>('orgId', 'org-1')).toThrow('outside of a request context');
  });
});
