import { sql } from 'drizzle-orm';
import { offsetModifierOf, zoneOffsetMinutes } from '../../domain/usage/daily-budget.ts';
import type { UsagePricingSource } from '../../domain/usage/usage-port.ts';
import { usageTable } from '../org-sqlite/schema/usage.ts';

export type UsageGroupBy = 'day' | 'hour' | 'minute' | 'agent';

export function reportRangeOffsetModifier(timezone: string | undefined, from: string): string {
  const parsed = new Date(from);
  const instant = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return offsetModifierOf(zoneOffsetMinutes(timezone ?? 'UTC', instant));
}

export function keyExpressionOf(
  groupBy: UsageGroupBy,
  agentId: typeof usageTable.agentId,
  modifier: string,
) {
  if (groupBy === 'day') {
    return sql<string>`strftime('%Y-%m-%d', ${usageTable.ts}, ${modifier})`;
  }
  if (groupBy === 'hour') {
    return sql<string>`strftime('%Y-%m-%d %H:00', ${usageTable.ts}, ${modifier})`;
  }
  if (groupBy === 'minute') {
    return sql<string>`strftime('%Y-%m-%d %H:%M', ${usageTable.ts}, ${modifier})`;
  }
  return agentId;
}

export function pricingSourceOf(value: string): UsagePricingSource {
  if (value === 'provider' || value === 'manual' || value === 'catalog') {
    return value;
  }
  return 'none';
}
