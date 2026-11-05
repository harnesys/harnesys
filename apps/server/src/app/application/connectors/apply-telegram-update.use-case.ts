import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type {
  ConnectorBindingRecord,
  ConnectorInboxKind,
  ConnectorRecord,
} from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  type ActiveRunStatus,
  decideInbound,
  type InboundBinding,
  type InboundDecision,
} from '../../domain/connector/inbound-decision.ts';
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
import {
  claimBinding,
  enqueueInbound,
  pairConnector,
  respondInboundCallback,
  respondInboundText,
  stopActiveRun,
} from './apply-telegram-actions.ts';
import {
  type ApplyActionContext,
  type ApplyActionDeps,
  connectorMembersOf,
  replyText,
} from './apply-telegram-context.ts';
import { discoverChat } from './discover-chat.ts';
import { RunTelegramCommandUseCase } from './run-telegram-command.use-case.ts';

export interface ApplyTelegramUpdateRequest {
  orgId: string;
  connectorId: string;
  updateId: number;
  update: CanonicalUpdate;
}

@Injectable()
export class ApplyTelegramUpdateUseCase {
  private readonly deps: ApplyActionDeps;

  constructor(
    connectors: ConnectorRepositoryPort,
    secrets: SecretStorePort,
    threads: ThreadRepositoryPort,
    threadAgents: ThreadAgentRepositoryPort,
    participants: ThreadParticipantRepositoryPort,
    agents: AgentRegistryPort,
    telegram: TelegramApiPort,
    executor: LocalExecutorPort,
    sendMessage: SendThreadMessageUseCase,
    respondRun: RespondRunUseCase,
    cancelRun: CancelRunUseCase,
    uploadAttachment: UploadThreadAttachmentUseCase,
    outbound: ConnectorOutboundPort,
    private readonly runCommand: RunTelegramCommandUseCase,
  ) {
    this.deps = {
      connectors,
      secrets,
      threads,
      threadAgents,
      participants,
      agents,
      telegram,
      executor,
      sendMessage,
      respondRun,
      cancelRun,
      uploadAttachment,
      outbound,
    };
  }

  async execute(request: ApplyTelegramUpdateRequest): Promise<void> {
    const found = this.requireConnector(request.orgId, request.connectorId);
    discoverChat(this.deps.connectors, request.orgId, found, request.update);
    const chat = chatOf(request.update);
    const binding =
      chat.chatId === null
        ? undefined
        : this.deps.connectors.findBindingByChat(
            request.orgId,
            found.id,
            chat.chatId,
            chat.topicId,
          );
    const thread =
      binding?.threadId != null
        ? this.deps.threads.findById(request.orgId, binding.threadId)
        : undefined;
    const connector = activateBound(
      this.deps.connectors,
      request.orgId,
      found,
      thread !== undefined,
    );

    const inboxId = crypto.randomUUID();
    const inserted = this.deps.connectors.insertInbox(request.orgId, {
      id: inboxId,
      connectorId: connector.id,
      bindingId: binding?.id ?? null,
      updateId: request.updateId,
      kind: inboxKindOf(request.update),
      payload: request.update,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    if (inserted === 'duplicate') {
      return;
    }

    if (request.update.kind === 'chat_member' || request.update.kind === 'topic_created') {
      this.deps.connectors.markInbox(request.orgId, inboxId, 'consumed');
      return;
    }

    const active = thread ? this.deps.threads.findActiveRun(request.orgId, thread.id) : undefined;
    const decision = decideInbound({
      update: request.update,
      pairHash: connector.pairCodeHash,
      pairExpiresAt: connector.pairCodeExpiresAt ? Date.parse(connector.pairCodeExpiresAt) : null,
      now: Date.now(),
      binding: inboundBindingOf(this.deps, connector, binding ?? null, thread),
      activeRunStatus: (active?.status as ActiveRunStatus | undefined) ?? null,
      canReadUnmentioned: connector.capabilities.canReadUnmentioned,
    });

    const ctx: ApplyActionContext = {
      orgId: request.orgId,
      connector,
      inboxId,
      update: request.update,
      chatId: chat.chatId,
      topicId: chat.topicId,
      binding: binding ?? null,
      threadId: thread?.id ?? null,
      activeRunId: active?.runId ?? null,
      activeStatus: active?.status ?? null,
    };
    await this.dispatch(ctx, decision, thread);
  }

  private async dispatch(
    ctx: ApplyActionContext,
    decision: InboundDecision,
    thread: ThreadRecord | undefined,
  ): Promise<void> {
    switch (decision.type) {
      case 'ignore':
        this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
        return;
      case 'reply':
        await replyText(this.deps, ctx, decision.text);
        this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, decision.inbox);
        return;
      case 'pair':
        await pairConnector(this.deps, ctx, decision);
        return;
      case 'claim':
        await claimBinding(this.deps, ctx);
        return;
      case 'enqueue':
        await enqueueInbound(this.deps, ctx, decision);
        return;
      case 'respond':
        await respondInboundText(this.deps, ctx, decision.text);
        return;
      case 'callback':
        await respondInboundCallback(this.deps, ctx, decision.deliveryId);
        return;
      case 'stop':
        await stopActiveRun(this.deps, ctx, false);
        return;
      case 'command': {
        if (!ctx.chatId || !ctx.threadId || !thread) {
          this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
          return;
        }
        const agentId = primaryAgentIdOf(this.deps, ctx, thread);
        if (agentId === null) {
          this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
          return;
        }
        await this.runCommand.execute({
          orgId: ctx.orgId,
          connector: ctx.connector,
          inboxId: ctx.inboxId,
          chatId: ctx.chatId,
          topicId: ctx.topicId,
          threadId: ctx.threadId,
          agentId,
          name: decision.name,
          activeRunId: ctx.activeRunId,
          activeStatus: ctx.activeStatus,
        });
        return;
      }
    }
  }

  private requireConnector(orgId: string, connectorId: string): ConnectorRecord {
    const connector = this.deps.connectors.findById(orgId, connectorId);
    if (!connector) {
      throw new ConnectorNotFoundException(connectorId);
    }
    return connector;
  }
}

function activateBound(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  bound: boolean,
): ConnectorRecord {
  if (connector.status !== 'awaiting_pair' || !bound) {
    return connector;
  }
  return connectors.update(orgId, connector.id, {
    status: 'active',
    updatedAt: new Date().toISOString(),
  });
}

function primaryAgentIdOf(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  thread: ThreadRecord,
): string | null {
  return connectorMembersOf(deps, ctx, thread)[0]?.id ?? null;
}

function inboundBindingOf(
  deps: ApplyActionDeps,
  connector: ConnectorRecord,
  binding: ConnectorBindingRecord | null,
  thread: ThreadRecord | undefined,
): InboundBinding | null {
  if (!binding) {
    return null;
  }
  return {
    chatType: binding.chatType,
    pairedUserId: pairedUserIdOf(deps, connector, binding, thread),
    threadId: binding.threadId,
    threadKind: thread?.kind ?? null,
  };
}

function pairedUserIdOf(
  deps: ApplyActionDeps,
  connector: ConnectorRecord,
  binding: ConnectorBindingRecord,
  thread: ThreadRecord | undefined,
): string | null {
  if (binding.chatType !== 'private' || binding.threadId === null || !thread) {
    return null;
  }
  const participant = deps.participants
    .listByThread(binding.orgId, thread.id)
    .find((row) => row.provider === connector.provider && row.role === 'member');
  return participant?.providerUserId ?? null;
}

function chatOf(update: CanonicalUpdate): { chatId: string | null; topicId: string | null } {
  if (update.kind === 'message' || update.kind === 'command') {
    return { chatId: update.chatId, topicId: update.topicId };
  }
  if (update.kind === 'topic_created') {
    return { chatId: update.chatId, topicId: update.topicId };
  }
  if (
    update.kind === 'callback' ||
    update.kind === 'unsupported' ||
    update.kind === 'chat_member' ||
    update.kind === 'ignored'
  ) {
    return { chatId: update.chatId, topicId: null };
  }
  return { chatId: update.chatId ?? null, topicId: null };
}

function inboxKindOf(update: CanonicalUpdate): ConnectorInboxKind {
  if (
    update.kind === 'chat_member' ||
    update.kind === 'topic_created' ||
    update.kind === 'ignored'
  ) {
    return 'unsupported';
  }
  return update.kind;
}
