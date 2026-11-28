import { describe, expect, test } from 'bun:test';
import type { PlanItemStatus } from 'harnesys';
import { derivePlanStatus } from './org-plan.port.ts';

function withStatuses(...statuses: PlanItemStatus[]): Array<{ status: PlanItemStatus }> {
  return statuses.map((status) => ({ status }));
}

describe('derivePlanStatus', () => {
  test('empty plan is draft', () => {
    expect(derivePlanStatus([])).toBe('draft');
  });

  test('all pending is draft', () => {
    expect(derivePlanStatus(withStatuses('pending', 'pending', 'pending'))).toBe('draft');
  });

  test('first active item moves the plan to in_progress', () => {
    expect(derivePlanStatus(withStatuses('pending', 'in_progress', 'pending'))).toBe('in_progress');
  });

  test('mixed settled without all done stays in_progress', () => {
    expect(derivePlanStatus(withStatuses('completed', 'failed'))).toBe('in_progress');
    expect(derivePlanStatus(withStatuses('completed', 'pending'))).toBe('in_progress');
    expect(derivePlanStatus(withStatuses('completed', 'cancelled', 'failed'))).toBe('in_progress');
  });

  test('all completed or cancelled is completed', () => {
    expect(derivePlanStatus(withStatuses('completed', 'cancelled', 'completed'))).toBe('completed');
  });
});
