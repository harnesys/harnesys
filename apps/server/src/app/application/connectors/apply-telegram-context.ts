import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import type { CanonicalUpdate } from '../../domain/connector/telegram-update.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { CancelRunUseCase } from '../threads/cancel-run.use-case.ts';
import { RespondRunUseCase } from '../threads/respond-run.use-case.ts';
import { SendThreadMessageUseCase } from '../threads/send-thread-message.use-case.ts';
import { UploadThreadAttachmentUseCase } from '../threads/upload-thread-attachment.use-case.ts';

export interface ApplyActionDeps {
  connectors: ConnectorRepositoryPort;
  secrets: SecretStorePort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  participants: ThreadParticipantRepositoryPort;
  agents: AgentRegistryPort;
  telegram: TelegramApiPort;
  executor: LocalExecutorPort;
  sendMessage: SendThreadMessageUseCase;
  respondRun: RespondRunUseCase;
  cancelRun: CancelRunUseCase;
  uploadAttachment: UploadThreadAttachmentUseCase;
  outbound: ConnectorOutboundPort;
}

export interface ApplyActionContext {
  orgId: string;
  connector: ConnectorRecord;
  inboxId: string;
  update: CanonicalUpdate;
  chatId: string | null;
  topicId: string | null;
  binding: ConnectorBindingRecord | null;
  threadId: string | null;
  activeRunId: string | null;
  activeStatus: string | null;
}

export async function replyText(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  text: string,
): Promise<void> {
  if (!ctx.chatId) {
    return;
  }
  const token = await requireToken(deps, ctx);
  await deps.telegram.sendMessage(token, ctx.chatId, text, { topicId: ctx.topicId });
}

export function connectorMembersOf(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  thread: ThreadRecord,
): Array<{ id: string; name: string }> {
  const allowed = new Set(deps.connectors.listAgentIds(ctx.orgId, ctx.connector.id));
  return deps.threadAgents
    .listByThread(ctx.orgId, thread.id)
    .filter((row) => allowed.has(row.agentId))
    .map((row) => ({
      id: row.agentId,
      name: deps.agents.findById(ctx.orgId, row.agentId)?.name ?? row.agentId,
    }));
}

export function claimChat(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  input: { chatId: string; chatType: string; title: string },
): ConnectorBindingRecord | undefined {
  const now = new Date().toISOString();
  try {
    return deps.connectors.insertBinding({
      id: crypto.randomUUID(),
      connectorId: ctx.connector.id,
      orgId: ctx.orgId,
      externalChatId: input.chatId,
      externalTopicId: ctx.topicId,
      chatType: input.chatType,
      title: input.title || null,
      threadId: null,
      status: 'unpaired',
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return deps.connectors.findBindingByChat(
      ctx.orgId,
      ctx.connector.id,
      input.chatId,
      ctx.topicId,
    );
  }
}

export function touchParticipant(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  thread: ThreadRecord,
  update: Extract<CanonicalUpdate, { kind: 'message' | 'command' }>,
): void {
  const now = new Date().toISOString();
  const existing = deps.participants
    .listByThread(ctx.orgId, thread.id)
    .find(
      (row) =>
        row.provider === ctx.connector.provider && row.providerUserId === update.author.userId,
    );
  if (existing) {
    deps.participants.touchSeen(ctx.orgId, thread.id, update.author.userId, now);
    return;
  }
  deps.participants.ensure({
    id: crypto.randomUUID(),
    orgId: ctx.orgId,
    threadId: thread.id,
    provider: ctx.connector.provider,
    providerUserId: update.author.userId,
    displayName: update.author.displayName,
    username: update.author.username,
    role: 'member',
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export async function requireToken(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
): Promise<string> {
  const token = await deps.secrets.get(ctx.orgId, ctx.connector.secretRef);
  if (!token) {
    throw new ConnectorValidationException('Connector token is missing');
  }
  return token;
}
