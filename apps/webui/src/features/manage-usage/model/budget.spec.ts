import { describe, expect, test } from 'bun:test';
import { budgetLevel, budgetStatus, formatBudgetPercent } from './budget';

describe('budgetStatus', () => {
  test('no budget means no status', () => {
    expect(budgetStatus(12, null)).toBeNull();
    expect(budgetStatus(12, 0)).toBeNull();
  });

  test('percent is spend over the daily budget', () => {
    expect(budgetStatus(5, 10)?.percent).toBe(50);
    expect(budgetStatus(0.25, 10)?.percent).toBe(2.5);
  });

  test('level follows the budget thresholds', () => {
    expect(budgetStatus(4.9, 10)?.level).toBe('ok');
    expect(budgetStatus(5, 10)?.level).toBe('warn');
    expect(budgetStatus(9, 10)?.level).toBe('critical');
    expect(budgetStatus(10, 10)?.level).toBe('exhausted');
    expect(budgetStatus(12, 10)?.level).toBe('exhausted');
  });
});

describe('budgetLevel', () => {
  test('boundaries are inclusive on the lower edge', () => {
    expect(budgetLevel(49.9)).toBe('ok');
    expect(budgetLevel(50)).toBe('warn');
    expect(budgetLevel(90)).toBe('critical');
    expect(budgetLevel(100)).toBe('exhausted');
  });
});

describe('formatBudgetPercent', () => {
  test('small values keep one decimal, large values are rounded', () => {
    expect(formatBudgetPercent(7.25)).toBe('7.3%');
    expect(formatBudgetPercent(42.4)).toBe('42%');
    expect(formatBudgetPercent(100)).toBe('100%');
    expect(formatBudgetPercent(133.6)).toBe('134%');
  });
});
