import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type { ConnectorInboxKind, ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  type ActiveRunStatus,
  decideInbound,
  type InboundDecision,
} from '../../domain/connector/inbound-decision.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import type { CanonicalUpdate } from '../../domain/connector/telegram-update.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { CancelRunUseCase } from '../threads/cancel-run.use-case.ts';
import { RespondRunUseCase } from '../threads/respond-run.use-case.ts';
import { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';
import { UploadThreadAttachmentUseCase } from '../threads/upload-thread-attachment.use-case.ts';
import {
  type ApplyActionContext,
  type ApplyActionDeps,
  enqueueInbound,
  pairConnector,
  replyText,
  respondInboundCallback,
  respondInboundText,
  stopActiveRun,
} from './apply-telegram-actions.ts';
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
    agents: AgentRegistryPort,
    telegram: TelegramApiPort,
    executor: LocalExecutorPort,
    sendRun: SendThreadRunUseCase,
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
      agents,
      telegram,
      executor,
      sendRun,
      respondRun,
      cancelRun,
      uploadAttachment,
      outbound,
    };
  }

  async execute(request: ApplyTelegramUpdateRequest): Promise<void> {
    const connector = this.requireConnector(request.orgId, request.connectorId);
    const binding = this.deps.connectors.findActiveBinding(request.orgId, connector.id);
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

    const active = binding
      ? this.deps.threads.findActiveRun(request.orgId, binding.threadId)
      : undefined;
    const decision = decideInbound({
      update: request.update,
      connectorStatus: connector.status,
      pairHash: connector.pairCodeHash,
      pairExpiresAt: connector.pairCodeExpiresAt ? Date.parse(connector.pairCodeExpiresAt) : null,
      now: Date.now(),
      bindingUserId: binding?.participantPolicy?.userId ?? null,
      activeRunStatus: (active?.status as ActiveRunStatus | undefined) ?? null,
    });

    const ctx: ApplyActionContext = {
      orgId: request.orgId,
      connector,
      inboxId,
      update: request.update,
      chatId: chatIdOf(request.update),
      threadId: binding?.threadId ?? null,
      activeRunId: active?.runId ?? null,
      activeStatus: active?.status ?? null,
    };
    await this.dispatch(ctx, decision);
  }

  private async dispatch(ctx: ApplyActionContext, decision: InboundDecision): Promise<void> {
    switch (decision.type) {
      case 'ignore':
        this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
        return;
      case 'reply':
        await replyText(this.deps, ctx, decision.text);
        this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
        return;
      case 'pair':
        await pairConnector(this.deps, ctx, decision.userId, decision.chatId);
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
      case 'command':
        if (!ctx.chatId || !ctx.threadId) {
          this.deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
          return;
        }
        await this.runCommand.execute({
          orgId: ctx.orgId,
          connector: ctx.connector,
          inboxId: ctx.inboxId,
          chatId: ctx.chatId,
          threadId: ctx.threadId,
          name: decision.name,
          activeRunId: ctx.activeRunId,
          activeStatus: ctx.activeStatus,
        });
        return;
    }
  }

  private requireConnector(orgId: string, connectorId: string): ConnectorRecord {
    const connector = this.deps.connectors.listByOrg(orgId).find((row) => row.id === connectorId);
    if (!connector) {
      throw new ConnectorNotFoundException(connectorId);
    }
    return connector;
  }
}

function inboxKindOf(update: CanonicalUpdate): ConnectorInboxKind {
  return update.kind;
}

function chatIdOf(update: CanonicalUpdate): string | null {
  if ('chatId' in update) {
    return update.chatId;
  }
  return null;
}
