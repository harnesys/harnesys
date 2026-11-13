import { describe, expect, test } from 'bun:test';
import { parseCommaList, serializeCommaList } from './comma-list.ts';

describe('comma list codec', () => {
  test('parses with trimming and drops empty tokens', () => {
    expect(parseCommaList(' issues, pull_requests ,')).toEqual(['issues', 'pull_requests']);
  });

  test('parses non-string values as empty', () => {
    expect(parseCommaList(undefined)).toEqual([]);
    expect(parseCommaList(true)).toEqual([]);
  });

  test('serializes trimmed, deduplicated, order-preserving values', () => {
    expect(serializeCommaList(['issues', ' issues ', 'labels', ''])).toBe('issues,labels');
  });
});
