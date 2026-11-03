import type { ManagerPulse, ManagerPulseAgent, ManagerPulseThread } from 'harnesys';
import type { AgentRecord } from '../agent/agent.ts';
import type { ThreadRecord } from '../thread/thread.ts';

export interface BuildPulseInput {
  agents: AgentRecord[];
  threads: ThreadRecord[];
  agentIdByThread: Map<string, string>;
  spentByAgent: Map<string, number>;
  pendingApprovals: number;
  openIssues: number;
  day: string;
}

export function budgetPercentOf(spent: number, budget: number | null): number | null {
  if (budget === null || budget === 0) {
    return null;
  }
  return Math.round((spent / budget) * 100);
}

export function buildPulse(input: BuildPulseInput): ManagerPulse {
  const nameByAgent = new Map(input.agents.map((agent) => [agent.id, agent.name]));
  const agents: ManagerPulseAgent[] = input.agents.map((agent) => {
    const spentUsdToday = input.spentByAgent.get(agent.id) ?? 0;
    return {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      spentUsdToday,
      budgetUsdDaily: agent.budgetUsdDaily,
      budgetPercent: budgetPercentOf(spentUsdToday, agent.budgetUsdDaily),
    };
  });
  const failedThreads: ManagerPulseThread[] = input.threads.flatMap((thread) => {
    const lastError = lastErrorMessageOf(thread);
    if (lastError === null) {
      return [];
    }
    const agentId = input.agentIdByThread.get(thread.id) ?? '';
    return [
      {
        threadId: thread.id,
        title: thread.title,
        agentId,
        agentName: nameByAgent.get(agentId) ?? null,
        kind: thread.kind,
        lastError,
        updatedAt: thread.updatedAt,
      },
    ];
  });
  let spendUsdToday = 0;
  for (const spent of input.spentByAgent.values()) {
    spendUsdToday += spent;
  }
  return {
    agents,
    failedThreads,
    pendingApprovals: input.pendingApprovals,
    openIssues: input.openIssues,
    spendUsdToday,
  };
}

function lastErrorMessageOf(thread: ThreadRecord): string | null {
  const raw = thread.metadata.lastError;
  if (typeof raw === 'string' && raw !== '') {
    return raw;
  }
  if (raw !== null && typeof raw === 'object') {
    const message = (raw as Record<string, unknown>).message;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }
  return null;
}
