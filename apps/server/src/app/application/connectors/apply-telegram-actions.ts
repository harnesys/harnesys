import type { Attachment } from 'harnesys';
import { connectorOrigin } from '../../domain/connector/echo.ts';
import {
  type InboundDecision,
  pairedNotice,
  pendingClaimNotice,
  pendingConnectionNotice,
} from '../../domain/connector/inbound-decision.ts';
import { MAX_ATTACHMENT_BYTES } from '../../domain/thread/attachment.ts';
import { resolveResponders } from '../../domain/thread/responder-policy.ts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { allowsMentions } from '../../domain/thread/thread-policy.ts';
import {
  type ApplyActionContext,
  type ApplyActionDeps,
  claimChat,
  connectorMembersOf,
  replyText,
  requireToken,
  touchParticipant,
} from './apply-telegram-context.ts';
import { findOpenAsk, payloadForAskText, payloadForButtonValue } from './apply-telegram-hitl.ts';

export async function pairConnector(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  decision: Extract<InboundDecision, { type: 'pair' }>,
): Promise<void> {
  const now = new Date().toISOString();
  let binding = deps.connectors.findBindingByChat(
    ctx.orgId,
    ctx.connector.id,
    decision.chatId,
    ctx.topicId,
  );
  if (!binding) {
    binding = claimChat(deps, ctx, decision);
  }
  if (!binding) {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  deps.connectors.update(ctx.orgId, ctx.connector.id, {
    status: 'active',
    pairCodeHash: null,
    pairCodeExpiresAt: null,
    updatedAt: now,
  });
  deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
  await replyText(deps, { ...ctx, binding, threadId: null }, pairedNotice());
}

export async function claimBinding(deps: ApplyActionDeps, ctx: ApplyActionContext): Promise<void> {
  const update = ctx.update;
  if (update.kind !== 'message' || ctx.chatId === null) {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  if (!ctx.binding) {
    claimChat(deps, ctx, {
      chatId: ctx.chatId,
      chatType: update.chatType,
      title: update.chatTitle || update.author.displayName,
    });
  }
  deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
  await replyText(deps, ctx, pendingClaimNotice());
}

export async function enqueueInbound(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  decision: Extract<InboundDecision, { type: 'enqueue' }>,
): Promise<void> {
  const update = ctx.update;
  if (ctx.chatId === null || ctx.binding === null || update.kind !== 'message') {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  const thread = ctx.binding.threadId
    ? deps.threads.findById(ctx.orgId, ctx.binding.threadId)
    : undefined;
  if (!thread) {
    await replyText(deps, ctx, pendingConnectionNotice());
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  touchParticipant(deps, ctx, thread, update);
  const attachments: Attachment[] = [];
  if (decision.fileId) {
    const uploaded = await downloadAttachment(deps, ctx, thread, decision);
    if (uploaded === null) {
      deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
      return;
    }
    attachments.push(uploaded);
  }
  const members = connectorMembersOf(deps, ctx, thread);
  const responders = resolveResponders({
    text: update.text,
    explicitAgentId: null,
    repliedToAgentId: await repliedAgentOf(deps, ctx, update.replyToMessageId, members),
    members,
    autoReplyAgentId: thread.autoReplyAgentId,
    allowMentions: allowsMentions(thread.policy),
  });
  await deps.sendMessage.execute({
    orgId: ctx.orgId,
    threadId: thread.id,
    text: update.text,
    ...(attachments.length > 0 ? { attachments } : {}),
    origin: connectorOrigin(ctx.connector.id),
    originConnectorId: ctx.connector.id,
    author: {
      provider: ctx.connector.provider,
      providerUserId: update.author.userId,
      displayName: update.author.displayName,
    },
    targetAgentIds: responders,
    attribution: { via: 'agent' },
    triggerId: ctx.connector.id,
  });
  deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
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

async function downloadAttachment(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  thread: ThreadRecord,
  decision: Extract<InboundDecision, { type: 'enqueue' }>,
): Promise<Attachment | null> {
  if (!decision.fileId || ctx.chatId === null) {
    return null;
  }
  const token = await requireToken(deps, ctx);
  const file = await deps.telegram.getFile(token, decision.fileId);
  if (file.fileSize > MAX_ATTACHMENT_BYTES || file.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    await deps.telegram.sendMessage(token, ctx.chatId, 'File is larger than 20 MB.', {
      topicId: ctx.topicId,
    });
    return null;
  }
  const uploaded = await deps.uploadAttachment.execute({
    orgId: ctx.orgId,
    threadId: thread.id,
    name: decision.fileKind === 'photo' ? 'photo.jpg' : (file.filePath.split('/').pop() ?? 'file'),
    mediaType: decision.fileKind === 'photo' ? 'image/jpeg' : 'application/octet-stream',
    bytes: file.bytes,
  });
  if (!uploaded.path) {
    return null;
  }
  return {
    id: uploaded.id,
    kind: uploaded.kind,
    name: uploaded.name,
    mediaType: uploaded.mediaType,
    path: uploaded.path,
  };
}

async function repliedAgentOf(
  deps: ApplyActionDeps,
  ctx: ApplyActionContext,
  replyToMessageId: string | null,
  members: Array<{ id: string }>,
): Promise<string | null> {
  if (replyToMessageId === null) {
    return null;
  }
  const delivery = deps.connectors.findDeliveryByMessage(
    ctx.orgId,
    ctx.connector.id,
    replyToMessageId,
  );
  if (!delivery) {
    return null;
  }
  const lifecycle = await deps.executor.lifecycle(ctx.orgId);
  const run = await lifecycle.get(delivery.runId);
  const agentId = run?.agentId ?? null;
  return agentId !== null && members.some((member) => member.id === agentId) ? agentId : null;
}
