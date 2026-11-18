import { describe, expect, test } from 'bun:test';
import type {
  ExternalSource,
  ParamSubstitution,
  SourceParamValues,
  WidgetDocIssue,
  WidgetParams,
} from '@harnesys/contracts';
import { substituteParams } from '@harnesys/contracts';
import { DashboardWidgetValidationException } from '../../domain/dashboards/dashboard.error.ts';
import { validateWidgetDoc } from '../../domain/dashboards/widget-doc.guard.ts';
import { cacheKeyOf } from './source-cache.ts';

const ORG_ID = 'acme';

const source: ExternalSource = {
  kind: 'external',
  id: 'weather',
  method: 'GET',
  url: 'https://api.test/weather',
  headers: { accept: 'application/json' },
  cacheTtlSeconds: 60,
};

function resolved(
  values: SourceParamValues,
  params?: WidgetParams,
): ParamSubstitution<SourceParamValues> {
  return substituteParams(values, params);
}

function substitutedValues(values: SourceParamValues, params?: WidgetParams): SourceParamValues {
  const substituted = resolved(values, params);
  if (!substituted.ok) {
    throw new Error(`unexpected param_missing: ${substituted.param}`);
  }
  return substituted.value;
}

describe('param substitution', () => {
  test('substitutes placeholders in query values and body string leaves', () => {
    const values = substitutedValues(
      {
        query: { city: '{{param:city}}', unit: 'metric' },
        body: {
          location: '{{param:city}}',
          filters: [{ tag: 'forecast-{{param:city}}' }],
          limit: 5,
        },
      },
      { city: 'Paris' },
    );
    expect(values.query).toEqual({ city: 'Paris', unit: 'metric' });
    expect(values.body).toEqual({
      location: 'Paris',
      filters: [{ tag: 'forecast-Paris' }],
      limit: 5,
    });
  });

  test('a body string that is one whole placeholder keeps the JSON type of the param', () => {
    const values = substitutedValues(
      { body: { limit: '{{param:limit}}', flag: '{{param:flag}}', none: '{{param:none}}' } },
      { limit: 10, flag: false, none: null },
    );
    expect(values.body).toEqual({ limit: 10, flag: false, none: null });
  });

  test('query values are always text', () => {
    const values = substitutedValues({ query: { page: '{{param:page}}' } }, { page: 3 });
    expect(values.query).toEqual({ page: '3' });
  });

  test('unknown or missing placeholder fails with param_missing naming the parameter', () => {
    expect(resolved({ query: { city: '{{param:city}}' } }, {})).toEqual({
      ok: false,
      param: 'city',
    });
    expect(resolved({ body: { nested: ['{{param:country}}'] } }, { city: 'Paris' })).toEqual({
      ok: false,
      param: 'country',
    });
  });

  test('url and headers are not part of the substitution surface', () => {
    const values = substitutedValues({ query: { city: '{{param:city}}' } }, { city: 'Paris' });
    expect(Object.keys(values)).toEqual(['query']);
    expect(values.query).toEqual({ city: 'Paris' });
  });
});

describe('source cache key', () => {
  const request = (params?: WidgetParams) => ({
    widgetId: 'widget-1',
    source,
    ...(params === undefined ? {} : { params }),
  });

  test('two params sets never share a cache entry', () => {
    const parisKey = cacheKeyOf(ORG_ID, request({ city: 'Paris' }), { query: { city: 'Paris' } });
    const romeKey = cacheKeyOf(ORG_ID, request({ city: 'Rome' }), { query: { city: 'Rome' } });
    expect(parisKey).not.toBe(romeKey);
  });

  test('key does not depend on the client key order', () => {
    const first = cacheKeyOf(ORG_ID, request({ city: 'Paris', unit: 'metric' }), {});
    const second = cacheKeyOf(ORG_ID, request({ unit: 'metric', city: 'Paris' }), {});
    expect(first).toBe(second);
  });

  test('key differs when params differ but the substituted query matches', () => {
    const withParam = cacheKeyOf(ORG_ID, request({ city: 'Paris' }), { query: { q: 'x' } });
    const withoutParam = cacheKeyOf(ORG_ID, request(), { query: { q: 'x' } });
    expect(withParam).not.toBe(withoutParam);
  });
});

function sourceIssues(source: Record<string, unknown>): WidgetDocIssue[] {
  const doc = { schemaVersion: 1, title: 'Params', sources: [source], items: [] };
  try {
    validateWidgetDoc(ORG_ID, doc);
    return [];
  } catch (error) {
    if (error instanceof DashboardWidgetValidationException) {
      const details = error.details as { issues?: WidgetDocIssue[] } | undefined;
      return details?.issues ?? [];
    }
    throw error;
  }
}

describe('guard placeholder placement', () => {
  test('placeholder in an external url is rejected at save time', () => {
    const issues = sourceIssues({
      ...source,
      url: 'https://api.test/weather/{{param:city}}',
    });
    expect(issues).toContainEqual({
      path: 'sources[0].url',
      message: 'params are only substitutable in query and body',
    });
  });

  test('placeholder in a header is rejected at save time', () => {
    const issues = sourceIssues({
      ...source,
      headers: { authorization: 'Bearer {{param:token}}' },
    });
    expect(issues).toContainEqual({
      path: 'sources[0].headers.authorization',
      message: 'params are only substitutable in query and body',
    });
  });

  test('placeholder in refresh topics is rejected at save time', () => {
    const issues = sourceIssues({
      ...source,
      refresh: { mode: 'onEvent', topics: ['{{param:topic}}'] },
    });
    expect(issues).toContainEqual({
      path: 'sources[0].refresh.topics',
      message: 'params are only substitutable in query and body',
    });
  });

  test('query and body placeholders pass the guard for an external source', () => {
    expect(
      sourceIssues({
        ...source,
        query: { city: '{{param:city}}' },
        body: { city: '{{param:city}}' },
      }),
    ).toEqual([]);
  });

  test('orgApi sources reject params with an external-only message', () => {
    const issues = sourceIssues({
      kind: 'orgApi',
      id: 'approvals',
      method: 'GET',
      path: '/orgs/acme/approvals',
      query: { status: '{{param:status}}' },
    });
    expect(issues).toContainEqual({
      path: 'sources[0].query.status',
      message: 'params are external-only: orgApi sources cannot use {{param:name}}',
    });
  });
});
