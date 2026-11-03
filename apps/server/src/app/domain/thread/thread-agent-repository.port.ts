import type { ThreadAgentRecord } from './thread.ts';

export abstract class ThreadAgentRepositoryPort {
  abstract listByThread(orgId: string, threadId: string): ThreadAgentRecord[];
  abstract listByThreads(orgId: string, threadIds: string[]): ThreadAgentRecord[];
  abstract ensure(orgId: string, threadId: string, agentId: string): ThreadAgentRecord;
  abstract remove(orgId: string, threadId: string, agentId: string): void;
  abstract listThreadIdsByAgent(orgId: string, agentId: string): string[];
}
