import type { ThreadKind } from '@harnesys/contracts';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface CreateThreadForChatDeps {
  connectors: ConnectorRepositoryPort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
}

export interface CreateThreadForChatInput {
  orgId: string;
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
  kind: Extract<ThreadKind, 'chat' | 'group'>;
  agentIds: string[];
  autoReplyAgentId: string | null;
  title?: string;
}

export function createThreadForChat(
  deps: CreateThreadForChatDeps,
  input: CreateThreadForChatInput,
): ThreadRecord {
  const now = new Date().toISOString();
  const thread = deps.threads.insert({
    id: crypto.randomUUID(),
    orgId: input.orgId,
    title: input.title ?? input.binding.title ?? `Telegram · ${input.connector.botUsername}`,
    kind: input.kind,
    autoReplyAgentId: input.autoReplyAgentId,
    policy: { version: 1 },
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: { connectorId: input.connector.id, provider: input.connector.provider },
    issueId: null,
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  });
  for (const agentId of input.agentIds) {
    deps.threadAgents.ensure(input.orgId, thread.id, agentId);
  }
  deps.connectors.attachBindingThread(input.orgId, input.binding.id, thread.id, now);
  return deps.threads.findById(input.orgId, thread.id) ?? thread;
}
