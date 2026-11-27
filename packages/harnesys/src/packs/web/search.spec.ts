import { describe, expect, test } from 'bun:test';
import { resolveQueries } from './search.ts';
import {
  buildSearxngParams,
  describeFailure,
  isConnectivityFailure,
  parseSearxngResponse,
} from './search-providers.ts';

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
  test('repairs hostless and relative proxy links against the instance base', () => {
    const parsed = parseSearxngResponse(
      {
        results: [
          { title: 'A', url: 'http:///go/v1/AQ9w', content: 's', engine: 'brave' },
          { title: 'B', url: '/go/v1/B', engine: 'google' },
          { title: 'C', url: 'https://real.example/page', engine: 'brave' },
        ],
      },
      'https://search.internal',
    );
    expect(parsed.results.map((result) => result.url)).toEqual([
      'https://search.internal/go/v1/AQ9w',
      'https://search.internal/go/v1/B',
      'https://real.example/page',
    ]);
    expect(parsed.meta?.droppedUnusableLinks).toBeUndefined();
    expect(parsed.meta?.enginesUsed).toEqual(['brave', 'google']);
  });
  test('drops links that cannot be made fetchable and counts them', () => {
    const parsed = parseSearxngResponse({
      results: [
        { title: 'A', url: 'http:///go/v1/AQ9w', engine: 'brave' },
        { title: 'B', url: '', engine: 'google' },
        { title: 'C', url: 'ftp:///x', engine: 'google' },
      ],
    });
    expect(parsed.results).toEqual([]);
    expect(parsed.meta?.droppedUnusableLinks).toBe(3);
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

describe('describeFailure', () => {
  const guidance = { url: 'http://searxng:8080', providers: ['duckduckgo', 'searxng'] };

  test('connectivity failures name the configured url, settings and fallbacks', () => {
    const failure = describeFailure('searxng', new TypeError('Unable to connect'), guidance);
    expect(isConnectivityFailure(new TypeError('Unable to connect'))).toBe(true);
    expect(
      isConnectivityFailure({ name: 'TimeoutError', message: 'The operation was aborted' }),
    ).toBe(true);
    expect(failure.message).toContain('searxng at http://searxng:8080 is unreachable');
    expect(failure.message).toContain('set a different searxngUrl in the web pack settings');
    expect(failure.message).toContain('supported: duckduckgo, searxng');
    expect(failure.message).toContain('fetch for a known URL, browser_fetch/browser');
    expect(failure.message).toContain(
      'Stop retrying and tell the user that web search is temporarily unavailable.',
    );
  });

  test('non-connectivity failures keep the plain composition', () => {
    const failure = describeFailure('searxng', new Error('HTTP 500'), guidance);
    expect(failure.message).toBe(
      'searxng: HTTP 500. Stop retrying and tell the user that web search is temporarily unavailable.',
    );
    expect(describeFailure('duckduckgo', new Error('HTTP 500')).message).toBe(
      'duckduckgo: HTTP 500. Stop retrying and tell the user that web search is temporarily unavailable.',
    );
  });
});
