export type BudgetLevel = 'ok' | 'warn' | 'critical' | 'exhausted';

export interface BudgetStatus {
  percent: number;
  level: BudgetLevel;
}

export function budgetLevel(percent: number): BudgetLevel {
  if (percent >= 100) {
    return 'exhausted';
  }
  if (percent >= 90) {
    return 'critical';
  }
  if (percent >= 50) {
    return 'warn';
  }
  return 'ok';
}

export function budgetStatus(costUsd: number, budgetUsdDaily: number | null): BudgetStatus | null {
  if (budgetUsdDaily === null || budgetUsdDaily <= 0) {
    return null;
  }
  const percent = (costUsd / budgetUsdDaily) * 100;
  return { percent, level: budgetLevel(percent) };
}

export function formatBudgetPercent(percent: number): string {
  if (percent >= 100) {
    return `${Math.round(percent)}%`;
  }
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}
