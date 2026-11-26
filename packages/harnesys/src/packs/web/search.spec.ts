import { describe, expect, test } from 'bun:test';
import { resolveQueries } from './search.ts';
import { buildSearxngParams, parseSearxngResponse } from './search-providers.ts';

describe('buildSearxngParams', () => {
  test('defaults to general category and all languages', () => {
    const params = buildSearxngParams('q', {});
    expect(params.get('categories')).toBe('general');
    expect(params.get('language')).toBe('all');
    expect(params.get('time_range')).toBeNull();
    expect(params.get('engines')).toBeNull();
  });
  test('maps refinements to the SearXNG API shape', () => {
    const params = buildSearxngParams('q', {
      language: 'pl',
      timeRange: 'week',
      categories: 'news',
      pageno: 2,
      engines: ['bing', 'startpage'],
    });
    expect(params.get('language')).toBe('pl');
    expect(params.get('time_range')).toBe('week');
    expect(params.get('categories')).toBe('news');
    expect(params.get('pageno')).toBe('2');
    expect(params.get('engines')).toBe('bing,startpage');
  });
});

describe('parseSearxngResponse', () => {
  test('flattens diagnostics into meta', () => {
    const parsed = parseSearxngResponse({
      results: [
        { title: 'T', url: 'https://a.pl', content: 'S', engine: 'bing' },
        { title: 'T2', url: 'https://b.pl', engine: 'bing' },
      ],
      number_of_results: 42,
      unresponsive_engines: [
        ['google', 'timeout'],
        ['ddg', 'blocked'],
      ],
      answers: ['42'],
      infoboxes: [{ infobox: 'Wiki', content: 'summary', url: 'https://wiki' }],
    });
    expect(parsed.results[0]).toEqual({ title: 'T', url: 'https://a.pl', snippet: 'S' });
    expect(parsed.meta?.numberOfResults).toBe(42);
    expect(parsed.meta?.enginesUsed).toEqual(['bing']);
    expect(parsed.meta?.unresponsiveEngines).toEqual(['google: timeout', 'ddg: blocked']);
    expect(parsed.meta?.infoboxes).toEqual([
      { title: 'Wiki', url: 'https://wiki', content: 'summary' },
    ]);
  });
  test('omits meta entirely for a bare response', () => {
    const parsed = parseSearxngResponse({ results: [] });
    expect(parsed).toEqual({ results: [] });
  });
});

describe('resolveQueries', () => {
  test('trims, dedupes and caps the batch', () => {
    const resolved = resolveQueries({ queries: [' a ', 'a', 'b', 'c', 'd', 'e', 'f'] });
    expect(resolved).toEqual({ error: 'up to 5 queries per call' });
    expect(resolveQueries({ query: 'x', queries: ['x', 'y'] })).toEqual({ queries: ['x', 'y'] });
  });
  test('requires at least one non-blank query', () => {
    expect(resolveQueries({ queries: ['  '] })).toEqual({ error: 'query is required' });
    expect(resolveQueries({})).toEqual({ error: 'query is required' });
  });
});
