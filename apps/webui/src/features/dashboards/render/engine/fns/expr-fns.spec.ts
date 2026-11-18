import { describe, expect, test } from 'bun:test';
import { EXPR_FN_SIGNATURES } from '@harnesys/contracts';
import { EXPR_FNS } from './index';

const ROWS = [
  { id: 'a', status: 'open', score: 2 },
  { id: 'b', status: '', score: 5 },
  { id: 'c', status: 'open', score: null },
];

describe('expr function library', () => {
  test('every signature has an implementation', () => {
    for (const name of Object.keys(EXPR_FN_SIGNATURES)) {
      expect(typeof EXPR_FNS[name as keyof typeof EXPR_FNS]).toBe('function');
    }
  });

  test('aggregates reduce a list and reject non-lists', () => {
    expect(EXPR_FNS.count([ROWS])).toBe(3);
    expect(EXPR_FNS.count(['abc'])).toBe(3);
    expect(EXPR_FNS.sum([[1, 2, '3', null]])).toBe(6);
    expect(EXPR_FNS.avg([[2, 4]])).toBe(3);
    expect(EXPR_FNS.min([[3, 1, 2]])).toBe(1);
    expect(EXPR_FNS.max([[3, 1, 2]])).toBe(3);
    expect(EXPR_FNS.count([null])).toBeNull();
    expect(EXPR_FNS.sum([null])).toBeNull();
    expect(EXPR_FNS.avg([[]])).toBeNull();
    expect(EXPR_FNS.min([[]])).toBeNull();
    expect(EXPR_FNS.max([{ not: 'a list' }])).toBeNull();
  });

  test('accessors read positions and paths', () => {
    expect(EXPR_FNS.first([['x', 'y']])).toBe('x');
    expect(EXPR_FNS.last([['x', 'y']])).toBe('y');
    expect(EXPR_FNS.pluck([ROWS, 'id'])).toEqual(['a', 'b', 'c']);
    expect(EXPR_FNS.pick([ROWS[0], 'status'])).toBe('open');
    expect(EXPR_FNS.length(['abcd'])).toBe(4);
    expect(EXPR_FNS.first([[]])).toBeNull();
    expect(EXPR_FNS.pluck([ROWS, 7])).toBeNull();
    expect(EXPR_FNS.pick([null, 'status'])).toBeNull();
    expect(EXPR_FNS.length([12])).toBeNull();
  });

  test('transforms keep the input when they cannot run', () => {
    expect(EXPR_FNS.filter([ROWS, 'status'])).toEqual([ROWS[0], ROWS[2]]);
    expect(EXPR_FNS.sort([[3, 1, 2]])).toEqual([1, 2, 3]);
    expect(EXPR_FNS.sort([ROWS, 'score'])).toEqual([ROWS[0], ROWS[1], ROWS[2]]);
    expect(EXPR_FNS.limit([[1, 2, 3], 2])).toEqual([1, 2]);
    expect(EXPR_FNS.where([ROWS, 'status', 'eq', 'open'])).toEqual([ROWS[0], ROWS[2]]);
    expect(EXPR_FNS.where([ROWS, 'status', 'neq', 'open'])).toEqual([ROWS[1]]);
    expect(EXPR_FNS.where([ROWS, 'score', 'gt', 3])).toEqual([ROWS[1]]);
    expect(EXPR_FNS.where([ROWS, 'score', 'lte', 2])).toEqual([ROWS[0]]);
    expect(EXPR_FNS.where([ROWS, 'status', 'contains', 'pe'])).toEqual([ROWS[0], ROWS[2]]);
    expect(EXPR_FNS.where([ROWS, 'score', 'missing'])).toEqual([ROWS[2]]);
    expect(EXPR_FNS.where([ROWS, 'score', 'exists'])).toEqual([ROWS[0], ROWS[1]]);
    expect(EXPR_FNS.where([ROWS, 'status', 'bogus', 'open'])).toEqual(ROWS);
    expect(EXPR_FNS.where([ROWS, 'status', 'eq'])).toEqual(ROWS);
    expect(EXPR_FNS.where([ROWS, 'status', 'contains', null])).toEqual([]);
    expect(EXPR_FNS.where(['not a list', 'status', 'eq', 'open'])).toBe('not a list');
    expect(EXPR_FNS.filter(['not a list', 'x'])).toBe('not a list');
    expect(EXPR_FNS.sort([null])).toBeNull();
    expect(EXPR_FNS.limit([[1, 2], 'many'])).toEqual([1, 2]);
  });

  test('groupCount builds a chart-shaped frequency table', () => {
    expect(EXPR_FNS.groupCount([ROWS, 'status'])).toEqual([
      { key: 'open', count: 2 },
      { key: '', count: 1 },
    ]);
    expect(EXPR_FNS.groupCount([null])).toBeNull();
  });

  test('text helpers flatten and join', () => {
    expect(EXPR_FNS.concat([[1], [2, 3], null, 4])).toEqual([1, 2, 3, 4]);
    expect(EXPR_FNS.join([[1, 2], '-'])).toBe('1-2');
    expect(EXPR_FNS.join([null])).toBeNull();
  });

  test('format covers every kind and rejects unformattable input', () => {
    expect(EXPR_FNS.format([1234.5, { kind: 'number', locale: 'en-US' }])).toBe('1,234.5');
    expect(EXPR_FNS.format([0.42, { kind: 'percent', locale: 'en-US' }])).toBe('42%');
    expect(EXPR_FNS.format([12, { kind: 'currency', currency: 'USD', locale: 'en-US' }])).toBe(
      '$12.00',
    );
    expect(EXPR_FNS.format(['2024-01-15', { kind: 'date', locale: 'en-US' }])).toBe('Jan 15, 2024');
    expect(EXPR_FNS.format([Date.now(), { kind: 'relative', locale: 'en-US' }])).toBe('now');
    expect(EXPR_FNS.format([null])).toBeNull();
    expect(EXPR_FNS.format(['abc', 'number'])).toBeNull();
    expect(EXPR_FNS.format([1, 'unknown-kind'])).toBeNull();
  });

  test('comparisons compare numbers, strings, and structures', () => {
    expect(EXPR_FNS.eq([1, 1])).toBe(true);
    expect(EXPR_FNS.eq([{ a: 1 }, { a: 1 }])).toBe(true);
    expect(EXPR_FNS.eq([null, null])).toBe(true);
    expect(EXPR_FNS.neq([1, 2])).toBe(true);
    expect(EXPR_FNS.gt([2, 1])).toBe(true);
    expect(EXPR_FNS.gte([2, 2])).toBe(true);
    expect(EXPR_FNS.lt(['aa', 'ab'])).toBe(true);
    expect(EXPR_FNS.lte([2, 1])).toBe(false);
    expect(EXPR_FNS.gt([null, 1])).toBeNull();
  });

  test('logic short-circuits and defaults', () => {
    expect(EXPR_FNS.and([true, 1, 'x'])).toBe(true);
    expect(EXPR_FNS.and([true, 0])).toBe(false);
    expect(EXPR_FNS.or([false, 0, 'x'])).toBe(true);
    expect(EXPR_FNS.not([0])).toBe(true);
    expect(EXPR_FNS.if([true, 'yes', 'no'])).toBe('yes');
    expect(EXPR_FNS.if([false, 'yes', 'no'])).toBe('no');
    expect(EXPR_FNS.if([false, 'yes'])).toBeNull();
    expect(EXPR_FNS.coalesce([null, undefined, 7])).toBe(7);
  });
});
