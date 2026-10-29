import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { BrixContext } from './context';
import { Controller } from './controller';
import { Body, collapseQueryParams, createParamDecorator } from './params';
import { Get, getRouteTable } from './routes';

const HeaderValue = createParamDecorator<{ header: string }>((data, context) => ({
  data,
  path: new URL(context.request.url).pathname,
}));

describe('collapseQueryParams', () => {
  test('single values collapse to strings, repeated values stay arrays', () => {
    expect(collapseQueryParams({ a: ['1'], b: ['1', '2'] })).toEqual({ a: '1', b: ['1', '2'] });
  });

  test('empty and missing value lists stay arrays', () => {
    expect(collapseQueryParams({ empty: [] })).toEqual({ empty: [] });
    expect(collapseQueryParams({})).toEqual({});
  });
});

describe('createParamDecorator', () => {
  @Controller('things')
  class ThingsController {
    @Get()
    list(@HeaderValue({ header: 'x-user' }) user: unknown, @Body() body: unknown): object {
      return { user, body };
    }
  }

  test('stores the factory and its data on the param definition', () => {
    const route = getRouteTable(ThingsController)[0];
    const custom = route?.params[0];

    expect(custom?.kind).toBe('custom');
    expect(custom?.data).toEqual({ header: 'x-user' });
    expect(typeof custom?.factory).toBe('function');
    expect(route?.params[1]?.kind).toBe('body');
  });

  test('factory receives its data and the request context', async () => {
    const route = getRouteTable(ThingsController)[0];
    const factory = route?.params[0]?.factory;
    if (factory === undefined) {
      throw new Error('expected a custom param factory');
    }
    const request = new Request('http://localhost/things');

    const result = (await factory(
      { header: 'x-user' },
      { request, context: {} as BrixContext },
    )) as { data: { header: string }; path: string };

    expect(result.data).toEqual({ header: 'x-user' });
    expect(result.path).toBe('/things');
  });

  test('rejects usage outside controller method parameters', () => {
    expect(() => HeaderValue()(class Target {}, undefined, 0)).toThrow('parameters only');
  });
});
