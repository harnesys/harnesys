import type { ThreadKind } from '@harnesys/contracts';
import { isGroupChat } from '../../domain/connector/channel-capabilities.ts';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface OpenConnectorThreadDeps {
  connectors: ConnectorRepositoryPort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
}

export interface OpenConnectorThreadInput {
  orgId: string;
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
  autoReplyAgentId?: string | null;
  title?: string;
}

export function openConnectorThread(
  deps: OpenConnectorThreadDeps,
  input: OpenConnectorThreadInput,
): ThreadRecord | null {
  if (input.binding.threadId !== null) {
    return deps.threads.findById(input.orgId, input.binding.threadId) ?? null;
  }
  const agentIds = deps.connectors.listAgentIds(input.orgId, input.connector.id);
  if (agentIds.length === 0) {
    return null;
  }
  const now = new Date().toISOString();
  const kind = threadKindOf(input.binding.chatType, agentIds.length);
  const thread = deps.threads.insert({
    id: crypto.randomUUID(),
    orgId: input.orgId,
    title: input.title ?? input.binding.title ?? `Telegram · ${input.connector.botUsername}`,
    kind,
    autoReplyAgentId: autoReplyOf({ kind, agentIds, requested: input.autoReplyAgentId }),
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
  for (const agentId of agentIds) {
    deps.threadAgents.ensure(input.orgId, thread.id, agentId);
  }
  deps.connectors.attachBindingThread(input.orgId, input.binding.id, thread.id, now);
  return deps.threads.findById(input.orgId, thread.id) ?? thread;
}

export function threadKindOf(chatType: string, agentCount: number): ThreadKind {
  return isGroupChat(chatType) || agentCount > 1 ? 'group' : 'chat';
}

function autoReplyOf(input: {
  kind: ThreadKind;
  agentIds: string[];
  requested: string | null | undefined;
}): string | null {
  if (input.requested !== undefined) {
    return input.requested;
  }
  if (input.kind === 'chat') {
    return input.agentIds[0] ?? null;
  }
  return input.agentIds.length === 1 ? (input.agentIds[0] ?? null) : null;
}
