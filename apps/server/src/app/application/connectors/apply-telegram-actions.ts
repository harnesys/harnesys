import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorInboxRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import type { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { connectorOrigin } from '../../domain/connector/echo.ts';
import type { InboundDecision } from '../../domain/connector/inbound-decision.ts';
import { foldPending, type PendingInbound } from '../../domain/connector/inbox-fold.ts';
import type { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import type { CanonicalUpdate } from '../../domain/connector/telegram-update.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { MAX_ATTACHMENT_BYTES } from '../../domain/thread/attachment.ts';
import type { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { CancelRunUseCase } from '../threads/cancel-run.use-case.ts';
import type { RespondRunUseCase } from '../threads/respond-run.use-case.ts';
import type { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';
import type { UploadThreadAttachmentUseCase } from '../threads/upload-thread-attachment.use-case.ts';
import { findOpenAsk, payloadForAskText, payloadForButtonValue } from './apply-telegram-hitl.ts';
import { findConnectorThread } from './connector.helpers.ts';

export interface ApplyActionDeps {
  connectors: ConnectorRepositoryPort;
  secrets: SecretStorePort;
  threads: ThreadRepositoryPort;
  agents: AgentRegistryPort;
  telegram: TelegramApiPort;
  executor: LocalExecutorPort;
  sendRun: SendThreadRunUseCase;
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
  threadId: string | null;
  activeRunId: string | null;
  activeStatus: string | null;
}

interface PendingPayload {
  text: string;
  messageId: string;
  attachmentIds: string[];
}

export async function pairConnector(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  userId: string,
  chatId: string,
): Promise<void> {
  const thread = findConnectorThread(deps.threads, ctx.orgId, ctx.connector.id);
  if (!thread) {
    throw new ConnectorValidationException('Connector thread is missing');
  }
  const now = new Date().toISOString();
  const binding = deps.connectors.insertBinding({
    id: crypto.randomUUID(),
    connectorId: ctx.connector.id,
    orgId: ctx.orgId,
    externalChatId: chatId,
    externalTopicId: null,
    chatType: 'private',
    threadId: thread.id,
    participantPolicy: { userId },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  deps.connectors.insertRoute(ctx.orgId, {
    id: crypto.randomUUID(),
    connectorId: ctx.connector.id,
    bindingId: binding.id,
    scope: 'thread',
    threadId: thread.id,
    createdAt: now,
  });
  deps.connectors.update(ctx.orgId, ctx.connector.id, {
    status: 'active',
    pairCodeHash: null,
    pairCodeExpiresAt: null,
    updatedAt: now,
  });
  deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
}

export async function enqueueInbound(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  decision: Extract<InboundDecision, { type: 'enqueue' }>,
): Promise<void> {
  if (!ctx.threadId || !ctx.chatId) {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const messageId =
    ctx.update.kind === 'message' || ctx.update.kind === 'command'
      ? ctx.update.messageId
      : 'unknown';
  const attachmentIds: string[] = [];
  if (decision.fileId) {
    const token = await requireToken(deps, ctx);
    const file = await deps.telegram.getFile(token, decision.fileId);
    if (file.fileSize > MAX_ATTACHMENT_BYTES || file.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      await deps.telegram.sendMessage(token, ctx.chatId, 'File is larger than 20 MB.');
      deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
      return;
    }
    const uploaded = await deps.uploadAttachment.execute({
      orgId: ctx.orgId,
      threadId: ctx.threadId,
      name:
        decision.fileKind === 'photo' ? 'photo.jpg' : (file.filePath.split('/').pop() ?? 'file'),
      mediaType: decision.fileKind === 'photo' ? 'image/jpeg' : 'application/octet-stream',
      bytes: file.bytes,
    });
    attachmentIds.push(uploaded.id);
  }
  const payload: PendingPayload = { text: decision.text, messageId, attachmentIds };
  deps.connectors.updateInbox(ctx.orgId, ctx.inboxId, { status: 'pending', payload });
  if (ctx.activeStatus === null) {
    await flushPending(deps, ctx);
  }
}

export async function respondInboundText(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  text: string,
): Promise<void> {
  if (!ctx.threadId || !ctx.chatId || !ctx.activeRunId) {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const events = await deps.executor.events(ctx.orgId);
  const ask = findOpenAsk(await events.listByThread(ctx.threadId));
  if (!ask) {
    await replyText(deps, ctx, 'Use the buttons on the question above.');
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const mapped = payloadForAskText(ask, text);
  if (!mapped.ok) {
    await replyText(deps, ctx, 'Use the buttons on the question above.');
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  try {
    await deps.respondRun.execute({
      orgId: ctx.orgId,
      threadId: ctx.threadId,
      runId: ctx.activeRunId,
      body: { askId: ask.askId, payload: mapped.payload },
    });
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
  } catch (error) {
    if (error instanceof RunConflictException) {
      await replyText(deps, ctx, 'Already answered.');
      deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
      return;
    }
    throw error;
  }
}

export async function respondInboundCallback(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  deliveryId: string,
): Promise<void> {
  if (ctx.update.kind !== 'callback') {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const token = await requireToken(deps, ctx);
  const delivery = deps.connectors.findDelivery(ctx.orgId, deliveryId);
  if (
    !delivery ||
    delivery.status === 'final' ||
    !delivery.interruptId ||
    !ctx.threadId ||
    !ctx.activeRunId
  ) {
    await deps.telegram.answerCallbackQuery(token, ctx.update.callbackQueryId, 'Already answered.');
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const events = await deps.executor.events(ctx.orgId);
  const ask = findOpenAsk(await events.listByThread(ctx.threadId));
  if (!ask || ask.askId !== delivery.interruptId) {
    await deps.telegram.answerCallbackQuery(token, ctx.update.callbackQueryId, 'Already answered.');
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  try {
    await deps.respondRun.execute({
      orgId: ctx.orgId,
      threadId: ctx.threadId,
      runId: ctx.activeRunId,
      body: {
        askId: ask.askId,
        payload: payloadForButtonValue(ask, delivery.lastText ?? ''),
      },
    });
    deps.connectors.upsertDelivery(ctx.orgId, {
      ...delivery,
      status: 'final',
      updatedAt: new Date().toISOString(),
    });
    await deps.telegram.answerCallbackQuery(token, ctx.update.callbackQueryId);
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
  } catch (error) {
    if (error instanceof RunConflictException) {
      await deps.telegram.answerCallbackQuery(
        token,
        ctx.update.callbackQueryId,
        'Already answered.',
      );
      deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
      return;
    }
    throw error;
  }
}

export async function stopActiveRun(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  notify: boolean,
): Promise<void> {
  if (ctx.activeRunId && ctx.threadId) {
    await deps.cancelRun.execute({
      orgId: ctx.orgId,
      threadId: ctx.threadId,
      runId: ctx.activeRunId,
    });
    await deps.outbound.finalizeOpenDraft(ctx.connector.id, ctx.activeRunId);
    if (notify) {
      await replyText(deps, ctx, 'Stopped.');
    }
  } else if (notify) {
    await replyText(deps, ctx, 'Nothing is running.');
  }
  deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
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
  await deps.telegram.sendMessage(token, ctx.chatId, text);
}

async function flushPending(deps: ApplyActionDeps, ctx: ApplyActionContext): Promise<void> {
  if (!ctx.threadId || !ctx.chatId) {
    return;
  }
  const pending = deps.connectors.listPending(ctx.orgId, ctx.connector.id);
  if (pending.length === 0) {
    return;
  }
  const items: PendingInbound[] = [];
  for (const row of pending) {
    const payload = asPendingPayload(row);
    if (payload !== null) {
      items.push(payload);
    }
  }
  if (items.length === 0) {
    return;
  }
  const folded = foldPending(items);
  const token = await requireToken(deps, ctx);
  await deps.telegram.sendChatAction(token, ctx.chatId, 'typing');
  const agent = deps.agents.findById(ctx.orgId, ctx.connector.agentId);
  await deps.sendRun.execute({
    orgId: ctx.orgId,
    threadId: ctx.threadId,
    body: {
      text: folded.text,
      attachmentIds: folded.attachmentIds.length > 0 ? folded.attachmentIds : undefined,
      clientEventId: folded.clientEventId,
      origin: connectorOrigin(ctx.connector.id),
      mode: agent?.defaultModeId ?? undefined,
    },
    attribution: { via: 'agent' },
    trigger: { kind: 'connector', id: ctx.connector.id },
  });
  for (const row of pending) {
    deps.connectors.markInbox(ctx.orgId, row.id, 'consumed');
  }
}

async function requireToken(deps: ApplyActionDeps, ctx: ApplyActionContext): Promise<string> {
  const token = await deps.secrets.get(ctx.orgId, ctx.connector.secretRef);
  if (!token) {
    throw new ConnectorValidationException('Connector token is missing');
  }
  return token;
}

function asPendingPayload(row: ConnectorInboxRecord): PendingInbound | null {
  const payload = row.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const rec = payload as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text : '';
  const messageId = typeof rec.messageId === 'string' ? rec.messageId : String(row.updateId);
  const attachmentIds = Array.isArray(rec.attachmentIds)
    ? rec.attachmentIds.filter((id): id is string => typeof id === 'string')
    : [];
  return { text, messageId, attachmentIds };
}
