import type { ThreadKind } from '@harnesys/contracts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { insertAgentThread } from './thread.helpers.ts';

export interface DedicatedThreadDeps {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
}

export interface DedicatedThreadInput {
  orgId: string;
  agentId: string;
  title: string;
  kind: ThreadKind;
}

export function insertDedicatedThread(deps: DedicatedThreadDeps, input: DedicatedThreadInput) {
  const now = new Date().toISOString();
  return insertAgentThread(
    deps,
    {
      id: crypto.randomUUID(),
      orgId: input.orgId,
      title: input.title,
      kind: input.kind,
      parentThreadId: null,
      forkAt: null,
      inheritedEventCount: 0,
      metadata: {},
      runProfileId: null,
      runDirectory: null,
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    },
    input.agentId,
  );
}
