import { describe, expect, test } from 'bun:test';
import {
  effectiveQueryOf,
  excludeTermsOf,
  gmailDateOf,
  matchesExclude,
  parseList,
} from './gmail-filter.ts';

describe('effectiveQueryOf', () => {
  test('empty config yields an empty query', () => {
    expect(effectiveQueryOf({})).toBe('');
  });

  test('joins query and label terms with Gmail search syntax', () => {
    const query = effectiveQueryOf({
      query: 'from:alice has:attachment',
      labels: 'INBOX, Work Items',
    });
    expect(query).toBe('from:alice has:attachment label:INBOX label:"Work Items"');
  });

  test('strips double quotes from labels', () => {
    expect(effectiveQueryOf({ labels: 'a"b' })).toBe('label:ab');
  });
});

describe('excludeTermsOf', () => {
  test('parses comma and newline separated lowercase terms', () => {
    expect(excludeTermsOf({ exclude: 'Newsletter, promo\nFYI' })).toEqual([
      'newsletter',
      'promo',
      'fyi',
    ]);
  });
});

describe('matchesExclude', () => {
  test('skips messages containing any excluded term', () => {
    expect(matchesExclude(['newsletter'], 'Weekly Newsletter #12')).toBe(true);
    expect(matchesExclude(['newsletter'], 'Invoice from Alice')).toBe(false);
    expect(matchesExclude([], 'anything')).toBe(false);
  });
});

describe('gmailDateOf', () => {
  test('formats an ISO timestamp as a Gmail after: date', () => {
    expect(gmailDateOf('2026-11-12T03:04:05.678Z')).toBe('2026/11/12');
  });

  test('falls back to the epoch on a malformed timestamp', () => {
    expect(gmailDateOf('not-a-date')).toBe('1970/01/01');
  });
});

describe('parseList', () => {
  test('returns an empty list for non-string values', () => {
    expect(parseList(undefined)).toEqual([]);
  });
});
