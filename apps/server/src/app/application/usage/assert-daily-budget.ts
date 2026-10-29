import type { AgentRecord } from '../../domain/agent/agent.ts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import {
  DAILY_BUDGET_FULL_PERCENT,
  DAILY_BUDGET_SCOPE,
  dailyBudgetExceeded,
  localDayRange,
} from '../../domain/usage/daily-budget.ts';
import type { UsagePort } from '../../domain/usage/usage-port.ts';

export function assertDailyBudget(input: {
  usage: UsagePort;
  orgId: string;
  agent: AgentRecord;
  timezone: string;
}): void {
  const range = localDayRange(input.timezone, new Date());
  const spent = input.usage.sumAgentDayCostUsd(
    input.orgId,
    input.agent.id,
    range.startIso,
    range.endIso,
  );
  if (!dailyBudgetExceeded(input.agent.budgetUsdDaily, spent)) {
    return;
  }
  input.usage.markBudgetMark(
    input.orgId,
    `${input.agent.id}:${range.day}`,
    DAILY_BUDGET_SCOPE,
    DAILY_BUDGET_FULL_PERCENT,
    new Date().toISOString(),
  );
  throw new RunConflictException('Daily budget exceeded for agent', {
    agentId: input.agent.id,
    day: range.day,
    spentUsd: spent,
    limitUsd: input.agent.budgetUsdDaily ?? 0,
  });
}
