import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Container } from '../di/container';
import type { ErrorResponse } from '../errors/error-filter';
import { APP_FILTER, ErrorFilter, mapToErrorResponse } from '../errors/error-filter';
import { mapNotFound, planResponse, resolveErrorMapper } from './hono-adapter';
import type { RouteDef } from './routes';

function route(overrides: Partial<RouteDef> = {}): RouteDef {
  return { method: 'GET', path: '/x', handlerName: 'x', params: [], ...overrides };
}

describe('planResponse', () => {
  test('passes a Response through untouched', () => {
    const response = new Response('raw', { status: 202 });

    expect(planResponse(response, route())).toEqual({ kind: 'response', response });
  });

  test('void result becomes an empty 204', () => {
    expect(planResponse(undefined, route())).toEqual({ kind: 'empty', status: 204 });
  });

  test('explicit HttpCode wins over the 204 default for a void result', () => {
    expect(planResponse(undefined, route({ httpCode: 201 }))).toEqual({
      kind: 'empty',
      status: 201,
    });
  });

  test('HttpCode 204 drops the body', () => {
    expect(planResponse({ ok: true }, route({ httpCode: 204 }))).toEqual({
      kind: 'empty',
      status: 204,
    });
  });

  test('POST defaults to 201, GET to 200, explicit HttpCode wins', () => {
    expect(planResponse({ a: 1 }, route({ method: 'POST' }))).toEqual({
      kind: 'json',
      status: 201,
      value: { a: 1 },
    });
    expect(planResponse({ a: 1 }, route())).toEqual({
      kind: 'json',
      status: 200,
      value: { a: 1 },
    });
    expect(planResponse({ a: 1 }, route({ httpCode: 202 }))).toEqual({
      kind: 'json',
      status: 202,
      value: { a: 1 },
    });
  });

  test('null is a json body, not an empty response', () => {
    expect(planResponse(null, route())).toEqual({ kind: 'json', status: 200, value: null });
  });
});

describe('resolveErrorMapper', () => {
  test('falls back to mapToErrorResponse when no APP_FILTER is registered', () => {
    const map = resolveErrorMapper(new Container());

    expect(map(new Error('boom'), { path: '/x' }).errorCode).toBe('INTERNAL_ERROR');
  });

  test('maps through the registered APP_FILTER instance', () => {
    const calls: string[] = [];
    const filter = new (class extends ErrorFilter {
      map(): ErrorResponse {
        calls.push('mapped');
        return {
          statusCode: 499,
          errorCode: 'CUSTOM',
          message: 'm',
          path: '/x',
          timestamp: 't',
        };
      }
    })();
    const container = new Container();
    container.register({ provide: APP_FILTER, useValue: filter });

    const body = resolveErrorMapper(container)(new Error('boom'), { path: '/x' });

    expect(calls).toEqual(['mapped']);
    expect(body.errorCode).toBe('CUSTOM');
    expect(body.statusCode).toBe(499);
  });
});

describe('mapNotFound', () => {
  test('routes the 404 through the provided mapper', () => {
    const seen: unknown[] = [];
    const body = mapNotFound('/nope', 't-1', (err, args) => {
      seen.push([err, args]);
      return mapToErrorResponse(err, args);
    });

    expect(body.statusCode).toBe(404);
    expect(body.errorCode).toBe('NOT_FOUND');
    expect(body.traceId).toBe('t-1');
    expect(seen.length).toBe(1);
  });
});
