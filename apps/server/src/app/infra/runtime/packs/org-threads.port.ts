import type { CapabilityScope, ThreadSummary, ThreadsPort } from 'harnesys';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import type { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import type { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';
import type { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';

export interface OrgThreadsPortDeps {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  schedules?: ScheduleRepositoryPort;
}

export class OrgThreadsPort implements ThreadsPort {
  constructor(private readonly deps: OrgThreadsPortDeps) {}

  list(scope: CapabilityScope): Promise<ThreadSummary[]> {
    const schedules = this.deps.schedules?.listByOrg(scope.orgId) ?? [];
    const occupied = new Set(schedules.map((row) => row.threadId));
    const rows = this.deps.threads.listByOrg(scope.orgId);
    const agentIdByThread = new Map<string, string>();
    for (const member of this.deps.threadAgents.listByThreads(
      scope.orgId,
      rows.map((row) => row.id),
    )) {
      if (!agentIdByThread.has(member.threadId)) {
        agentIdByThread.set(member.threadId, member.agentId);
      }
    }
    const items = rows.map((row) => {
      const agentId = agentIdByThread.get(row.id) ?? '';
      const agent = agentId ? this.deps.agents.findById(scope.orgId, agentId) : undefined;
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        agentId,
        agentName: agent?.name ?? agentId,
        hasSchedule: occupied.has(row.id),
      };
    });
    return Promise.resolve(items);
  }
}
