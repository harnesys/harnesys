import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { UsageGroupBy } from '@/entities/usage';
import { getUsage, getUsageRuns } from '@/entities/usage';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { fetchOrgAgents } from '@/shared/api/agents';
import { startOfDayInTimeZone } from '@/shared/lib/time-zone';
import {
  coarsestGroupForPreset,
  groupAllowedForPreset,
  type UsageRangePreset,
  usageRangeFromPreset,
} from './usage-filters';

const RUNS_LIMIT = 50;

export interface AgentBudgetInfo {
  name: string;
  budgetUsdDaily: number | null;
}

export function useUsageBoard(orgId: string) {
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('day');
  const [preset, setPreset] = useState<UsageRangePreset>(30);
  const [agents, setAgents] = useState<string[]>([]);
  const timeZone = useOrgTimeZone();
  const reportQuery = useQuery({
    queryKey: ['usage', orgId, { groupBy, agents, preset, timeZone }],
    queryFn: () => getUsage(orgId, { groupBy, agents, ...usageRangeFromPreset(preset, timeZone) }),
    enabled: Boolean(orgId),
  });
  const optionsQuery = useQuery({
    queryKey: ['usage', orgId, 'agent-options', timeZone],
    queryFn: () => getUsage(orgId, { groupBy: 'agent', ...usageRangeFromPreset(90, timeZone) }),
    enabled: Boolean(orgId),
  });
  const agentsQuery = useQuery({
    queryKey: ['usage', orgId, 'agents'],
    queryFn: () => fetchOrgAgents(orgId),
    enabled: Boolean(orgId),
  });
  const todayQuery = useQuery({
    queryKey: ['usage', orgId, 'budget-day', timeZone],
    queryFn: () => {
      const now = new Date();
      return getUsage(orgId, {
        groupBy: 'agent',
        from: startOfDayInTimeZone(timeZone, now),
        to: now.toISOString(),
      });
    },
    enabled: Boolean(orgId),
  });
  const runsQuery = useQuery({
    queryKey: ['usage', orgId, 'runs', preset, timeZone],
    queryFn: () =>
      getUsageRuns(orgId, { ...usageRangeFromPreset(preset, timeZone), limit: RUNS_LIMIT }),
    enabled: Boolean(orgId),
  });
  const compare = agents.length >= 2;
  const perAgentQueries = useQueries({
    queries: agents.map((agentId) => ({
      queryKey: ['usage', orgId, { groupBy, agentId, preset, timeZone }],
      queryFn: () =>
        getUsage(orgId, { groupBy, agents: [agentId], ...usageRangeFromPreset(preset, timeZone) }),
      enabled: Boolean(orgId) && compare,
    })),
  });
  const changePreset = (next: UsageRangePreset) => {
    if (!groupAllowedForPreset(groupBy, next)) {
      setGroupBy(coarsestGroupForPreset(next));
    }
    setPreset(next);
  };
  const toggleAgent = (agentId: string) => {
    setAgents((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  };
  return {
    groupBy,
    setGroupBy,
    preset,
    setPreset: changePreset,
    agents,
    toggleAgent,
    clearAgents: () => setAgents([]),
    agentOptions: optionsQuery.data?.rows.map((row) => row.key).filter((key) => key !== null) ?? [],
    perAgentRows: agents.map((agentId, index) => ({
      agentId,
      rows: perAgentQueries[index]?.data?.rows ?? [],
    })),
    isComparing: compare,
    agentBudgets: agentBudgetsOf(agentsQuery.data?.items ?? []),
    agentNames: agentNamesOf(agentsQuery.data?.items ?? []),
    todaySpend: todaySpendOf(todayQuery.data?.rows ?? []),
    runs: runsQuery.data,
    report: reportQuery.data,
    isLoading: reportQuery.isLoading,
  };
}

function agentBudgetsOf(
  items: { id: string; name: string; budgetUsdDaily: number | null }[],
): Record<string, AgentBudgetInfo> {
  const result: Record<string, AgentBudgetInfo> = {};
  for (const item of items) {
    result[item.id] = { name: item.name, budgetUsdDaily: item.budgetUsdDaily };
  }
  return result;
}

function agentNamesOf(items: { id: string; name: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    result[item.id] = item.name;
  }
  return result;
}

function todaySpendOf(rows: { key: string | null; costUsd: number }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.key !== null) {
      result[row.key] = row.costUsd;
    }
  }
  return result;
}
