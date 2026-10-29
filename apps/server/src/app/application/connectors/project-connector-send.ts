import type { SessionEvent } from 'harnesys';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { ProjectEventInput, ProjectionPlan } from '../../domain/connector/project-event.ts';
import type { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import type { DraftSendState } from './project-connector-draft.ts';

export interface ProjectSendDeps {
  connectors: ConnectorRepositoryPort;
  telegram: TelegramApiPort;
}

export async function sendAskMessage(
  deps: ProjectSendDeps,
  state: DraftSendState,
  plan: Extract<ProjectionPlan, { type: 'ask' }>,
): Promise<void> {
  const text = plan.text.length > 0 ? plan.text : 'Choose an option';
  const buttons: Array<{ label: string; value: string }> = [];
  for (const button of plan.buttons) {
    const id = crypto.randomUUID();
    deps.connectors.upsertDelivery(state.orgId, {
      id,
      connectorId: state.connectorId,
      bindingId: state.bindingId,
      threadId: state.threadId,
      runId: state.runId,
      blockKey: `ask:${plan.interruptId}:${button.value}`,
      interruptId: plan.interruptId,
      draftId: null,
      lastText: button.value,
      externalMessageId: null,
      status: 'streaming',
      updatedAt: new Date().toISOString(),
    });
    buttons.push({ label: button.label, value: id });
  }
  const sent = await deps.telegram.sendMessage(state.token, state.chatId, text, {
    replyMarkup: { inlineKeyboard: [buttons] },
  });
  for (const button of buttons) {
    const delivery = deps.connectors.findDelivery(state.orgId, button.value);
    if (!delivery) {
      continue;
    }
    deps.connectors.upsertDelivery(state.orgId, {
      ...delivery,
      externalMessageId: sent.messageId,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function sendStatusMessage(
  deps: ProjectSendDeps,
  state: DraftSendState,
  blockKey: string,
  text: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const sent = await deps.telegram.sendMessage(state.token, state.chatId, text);
  deps.connectors.upsertDelivery(state.orgId, {
    id,
    connectorId: state.connectorId,
    bindingId: state.bindingId,
    threadId: state.threadId,
    runId: state.runId,
    blockKey,
    interruptId: null,
    draftId: null,
    lastText: text,
    externalMessageId: sent.messageId,
    status: 'final',
    updatedAt: new Date().toISOString(),
  });
}

export async function sendFileMessage(
  deps: ProjectSendDeps,
  state: DraftSendState,
  event: SessionEvent,
): Promise<void> {
  if (event.type !== 'file') {
    return;
  }
  const file = asRecord(event.file);
  if (file === null) {
    return;
  }
  const bytes = fileBytes(file);
  if (!bytes) {
    return;
  }
  const filename = typeof file.name === 'string' ? file.name : 'file';
  const mediaType = typeof file.mediaType === 'string' ? file.mediaType : '';
  const id = crypto.randomUUID();
  const sent =
    mediaType.startsWith('image/') || looksImage(filename)
      ? await deps.telegram.sendPhoto(state.token, state.chatId, bytes, filename)
      : await deps.telegram.sendDocument(state.token, state.chatId, bytes, filename);
  deps.connectors.upsertDelivery(state.orgId, {
    id,
    connectorId: state.connectorId,
    bindingId: state.bindingId,
    threadId: state.threadId,
    runId: state.runId,
    blockKey: `file:${event.seq ?? id}`,
    interruptId: null,
    draftId: null,
    lastText: filename,
    externalMessageId: sent.messageId,
    status: 'final',
    updatedAt: new Date().toISOString(),
  });
}

export function toProjectEvent(event: SessionEvent, connectorId: string): ProjectEventInput {
  if (event.type === 'user') {
    return {
      type: 'user',
      text: event.text,
      origin: event.origin,
      connectorId,
    };
  }
  if (event.type === 'text-delta') {
    return { type: 'text-delta', text: event.text };
  }
  if (event.type === 'ask') {
    return {
      type: 'ask',
      askId: event.askId,
      source: event.source,
      schema: event.schema,
      prompt: event.prompt,
      ...(event.tool === undefined
        ? {}
        : { tool: { name: event.tool.name, input: event.tool.input } }),
    };
  }
  if (event.type === 'run.failed') {
    return { type: 'run.failed', message: event.message };
  }
  if (event.type === 'run.completed') {
    return { type: 'run.completed', text: event.text };
  }
  if (event.type === 'file') {
    return { type: 'file' };
  }
  if (event.type === 'tool') {
    return { type: 'tool' };
  }
  return { type: event.type };
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function fileBytes(file: Record<string, unknown>): Uint8Array | null {
  if (file.bytes instanceof Uint8Array) {
    return file.bytes;
  }
  return null;
}

function looksImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}
