import type { ThreadAgentRecord } from '../../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';

export class MemoryThreadAgents implements ThreadAgentRepositoryPort {
  rows: ThreadAgentRecord[] = [];

  listByThread(_orgId: string, threadId: string): ThreadAgentRecord[] {
    return this.rows.filter((row) => row.threadId === threadId);
  }

  listByThreads(_orgId: string, threadIds: string[]): ThreadAgentRecord[] {
    return this.rows.filter((row) => threadIds.includes(row.threadId));
  }

  ensure(_orgId: string, threadId: string, agentId: string): ThreadAgentRecord {
    const found = this.rows.find((row) => row.threadId === threadId && row.agentId === agentId);
    if (found) {
      return found;
    }
    const row = { threadId, agentId, createdAt: new Date().toISOString() };
    this.rows.push(row);
    return row;
  }

  remove(_orgId: string, threadId: string, agentId: string): void {
    this.rows = this.rows.filter((row) => !(row.threadId === threadId && row.agentId === agentId));
  }

  listThreadIdsByAgent(_orgId: string, agentId: string): string[] {
    return this.rows.filter((row) => row.agentId === agentId).map((row) => row.threadId);
  }
}
