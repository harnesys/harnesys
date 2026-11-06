import { describe, expect, test } from 'bun:test';
import type { FilterStage, PostRecord } from '../model/records.ts';
import { matchesFilter } from './filter.ts';

function post(text: string, authorTitle: string | null = null): PostRecord {
  return {
    id: '1',
    sourceId: 's',
    postId: 1,
    topicId: null,
    authorTitle,
    text,
    mediaKinds: [],
    publishedAt: '2026-11-06T00:00:00.000Z',
    receivedAt: '2026-11-06T00:00:00.000Z',
    outcome: 'new',
    fireCount: 0,
  };
}

function keywords(
  terms: string[],
  match: 'any' | 'all' = 'any',
  exclude: string[] = [],
): FilterStage[] {
  return [{ type: 'keywords', config: { terms, match, exclude } }];
}

describe('matchesFilter', () => {
  test('empty stages pass everything', () => {
    expect(matchesFilter([], post('anything'))).toBe(true);
  });

  test('any matches one term case-insensitively', () => {
    expect(matchesFilter(keywords(['Rust']), post('A new Rust release'))).toBe(true);
    expect(matchesFilter(keywords(['rust']), post('A new Go release'))).toBe(false);
  });

  test('all requires every term', () => {
    expect(matchesFilter(keywords(['rust', 'wasm'], 'all'), post('rust and wasm'))).toBe(true);
    expect(matchesFilter(keywords(['rust', 'wasm'], 'all'), post('only rust'))).toBe(false);
  });

  test('exclude wins over a matching term', () => {
    expect(matchesFilter(keywords(['rust'], 'any', ['job']), post('rust job opening'))).toBe(false);
  });

  test('author title is part of the haystack', () => {
    expect(matchesFilter(keywords(['Harnesys']), post('release', 'Harnesys'))).toBe(true);
  });
});
