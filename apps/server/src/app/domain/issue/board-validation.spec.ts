import { describe, expect, test } from 'bun:test';
import type { BoardStatus } from '@harnesys/contracts';
import { validateStatuses } from './board-validation.ts';

function status(partial: Partial<BoardStatus> & { key: string }): BoardStatus {
  return {
    label: partial.key,
    category: 'started',
    order: 0,
    isEntry: false,
    ...partial,
  };
}

describe('validateStatuses', () => {
  test('single status is too-few', () => {
    expect(validateStatuses([status({ key: 'a', isEntry: true })])).toEqual([
      { field: 'statuses', code: 'too-few' },
    ]);
  });

  test('zero and two entry statuses are entry-count violations', () => {
    const none = [status({ key: 'a' }), status({ key: 'b', order: 1 })];
    const twice = [
      status({ key: 'a', isEntry: true }),
      status({ key: 'b', isEntry: true, order: 1 }),
    ];
    expect(validateStatuses(none)).toEqual([{ field: 'statuses', code: 'entry-count' }]);
    expect(validateStatuses(twice)).toEqual([{ field: 'statuses', code: 'entry-count' }]);
  });

  test('duplicate keys are dup-key', () => {
    const issues = validateStatuses([
      status({ key: 'a', isEntry: true }),
      status({ key: 'a', order: 1 }),
    ]);
    expect(issues).toContainEqual({ field: 'statuses', code: 'dup-key', key: 'a' });
  });

  test('empty label is empty-label', () => {
    const issues = validateStatuses([
      status({ key: 'a', isEntry: true, label: '  ' }),
      status({ key: 'b', order: 1 }),
    ]);
    expect(issues).toContainEqual({ field: 'statuses', code: 'empty-label', key: 'a' });
  });

  test('valid board set passes', () => {
    expect(
      validateStatuses([status({ key: 'a', isEntry: true }), status({ key: 'b', order: 1 })]),
    ).toEqual([]);
  });
});
