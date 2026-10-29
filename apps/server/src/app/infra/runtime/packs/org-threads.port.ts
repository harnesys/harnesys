import type { CapabilityScope, ThreadSummary, ThreadsPort } from 'harnesys';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import type { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import type { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';

export interface OrgThreadsPortDeps {
  threads: ThreadRepositoryPort;
  agents: AgentRegistryPort;
  schedules?: ScheduleRepositoryPort;
}

export class OrgThreadsPort implements ThreadsPort {
  constructor(private readonly deps: OrgThreadsPortDeps) {}

  list(scope: CapabilityScope): Promise<ThreadSummary[]> {
    const schedules = this.deps.schedules?.listByOrg(scope.orgId) ?? [];
    const occupied = new Set(schedules.map((row) => row.threadId));
    const items = this.deps.threads.listByOrg(scope.orgId).map((row) => {
      const agent = this.deps.agents.findById(scope.orgId, row.agentId);
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        agentId: row.agentId,
        agentName: agent?.name ?? row.agentId,
        hasSchedule: occupied.has(row.id),
      };
    });
    return Promise.resolve(items);
  }
}
