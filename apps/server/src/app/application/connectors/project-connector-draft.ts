import type {
  ConnectorDeliveryRecord,
  ConnectorRecord,
  ConnectorStreamMode,
} from '../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { nextDraftTick, takeDraftChunk } from '../../domain/connector/draft-buffer.ts';
import type { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';

export interface DraftSendState {
  orgId: string;
  connectorId: string;
  bindingId: string;
  threadId: string;
  runId: string;
  chatId: string;
  token: string;
  coalesceMs: number;
  streamMode: ConnectorStreamMode | null;
  textIndex: number;
  draftId: number;
  deliveryId: string | null;
  externalMessageId: string | null;
  pending: string;
  lastSent: string;
  lastSentAt: number;
  inFlight: boolean;
  retryUntil: number;
}

export interface DraftSendDeps {
  connectors: ConnectorRepositoryPort;
  telegram: TelegramApiPort;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  updateStreamMode: (orgId: string, connectorId: string, mode: ConnectorStreamMode) => void;
}

export async function sendThinkingDraft(deps: DraftSendDeps, state: DraftSendState): Promise<void> {
  ensureTextDelivery(deps, state, '');
  await flushDraft(deps, state, { force: true, text: '' });
}

export async function appendDraftText(
  deps: DraftSendDeps,
  state: DraftSendState,
  delta: string,
): Promise<void> {
  state.pending = `${state.pending}${delta}`;
  ensureTextDelivery(deps, state, state.pending);
  await maybeFlushDraft(deps, state);
}

export async function finalizeDraftText(
  deps: DraftSendDeps,
  state: DraftSendState,
  text?: string,
): Promise<void> {
  if (text !== undefined && text.length > 0) {
    state.pending = text;
  }
  if (state.pending.length === 0 && state.deliveryId === null) {
    return;
  }
  ensureTextDelivery(deps, state, state.pending);
  while (state.pending.length > 0 || state.externalMessageId === null) {
    if (state.pending.length >= 4000) {
      const { chunk, rest } = takeDraftChunk(state.pending);
      await sendFinalChunk(deps, state, chunk);
      state.pending = rest;
      openNextTextBlock(deps, state);
      continue;
    }
    await sendFinalChunk(deps, state, state.pending);
    state.pending = '';
    break;
  }
  markDeliveryFinal(deps, state);
  state.deliveryId = null;
  state.externalMessageId = null;
  state.lastSent = '';
  state.lastSentAt = 0;
}

export async function maybeFlushDraft(deps: DraftSendDeps, state: DraftSendState): Promise<void> {
  const tick = nextDraftTick({
    pending: state.pending,
    lastSent: state.lastSent,
    lastSentAt: state.lastSentAt,
    now: deps.now(),
    inFlight: state.inFlight,
    coalesceMs: state.coalesceMs,
  });
  if (!tick.send) {
    return;
  }
  if (tick.split) {
    const { chunk, rest } = takeDraftChunk(state.pending);
    await sendFinalChunk(deps, state, chunk);
    state.pending = rest;
    openNextTextBlock(deps, state);
    ensureTextDelivery(deps, state, state.pending);
    return;
  }
  await flushDraft(deps, state, { force: false, text: tick.text });
}

async function flushDraft(
  deps: DraftSendDeps,
  state: DraftSendState,
  input: { force: boolean; text: string },
): Promise<void> {
  if (state.inFlight) {
    return;
  }
  await waitRetry(deps, state);
  state.inFlight = true;
  try {
    if (state.streamMode === 'edit') {
      await flushEditMode(deps, state, input.text);
    } else {
      await flushDraftMode(deps, state, input.text);
    }
    state.lastSent = input.text;
    state.lastSentAt = deps.now();
    persistDelivery(deps, state, input.text);
  } catch (error) {
    if (shouldFallbackToEdit(error) && state.streamMode !== 'edit') {
      state.streamMode = 'edit';
      deps.updateStreamMode(state.orgId, state.connectorId, 'edit');
      await flushEditMode(deps, state, input.text || '…');
      state.lastSent = input.text;
      state.lastSentAt = deps.now();
      persistDelivery(deps, state, input.text);
      return;
    }
    const retryMs = retryAfterMs(error);
    if (retryMs !== null) {
      state.retryUntil = deps.now() + retryMs;
      return;
    }
    throw error;
  } finally {
    state.inFlight = false;
  }
}

async function flushDraftMode(
  deps: DraftSendDeps,
  state: DraftSendState,
  text: string,
): Promise<void> {
  await deps.telegram.sendMessageDraft(state.token, state.chatId, state.draftId, text, {
    canStop: true,
  });
  if (state.streamMode === null) {
    state.streamMode = 'draft';
    deps.updateStreamMode(state.orgId, state.connectorId, 'draft');
  }
}

async function flushEditMode(
  deps: DraftSendDeps,
  state: DraftSendState,
  text: string,
): Promise<void> {
  const body = text.length > 0 ? text : '…';
  if (state.externalMessageId === null) {
    const sent = await deps.telegram.sendMessage(state.token, state.chatId, body);
    state.externalMessageId = sent.messageId;
    return;
  }
  await deps.telegram.editMessageText(state.token, state.chatId, state.externalMessageId, body);
}

async function sendFinalChunk(
  deps: DraftSendDeps,
  state: DraftSendState,
  text: string,
): Promise<void> {
  await waitRetry(deps, state);
  if (state.externalMessageId === null) {
    const sent = await deps.telegram.sendMessage(
      state.token,
      state.chatId,
      text.length > 0 ? text : '…',
    );
    state.externalMessageId = sent.messageId;
  } else if (state.streamMode === 'edit') {
    await deps.telegram.editMessageText(
      state.token,
      state.chatId,
      state.externalMessageId,
      text.length > 0 ? text : '…',
    );
  } else {
    const sent = await deps.telegram.sendMessage(
      state.token,
      state.chatId,
      text.length > 0 ? text : '…',
    );
    state.externalMessageId = sent.messageId;
  }
  persistDelivery(deps, state, text);
}

function ensureTextDelivery(
  deps: DraftSendDeps,
  state: DraftSendState,
  lastText: string,
): ConnectorDeliveryRecord {
  if (state.deliveryId === null) {
    state.deliveryId = crypto.randomUUID();
    state.draftId = state.draftId > 0 ? state.draftId : 1;
  }
  return persistDelivery(deps, state, lastText);
}

function persistDelivery(
  deps: DraftSendDeps,
  state: DraftSendState,
  lastText: string,
): ConnectorDeliveryRecord {
  const id = state.deliveryId ?? crypto.randomUUID();
  state.deliveryId = id;
  return deps.connectors.upsertDelivery(state.orgId, {
    id,
    connectorId: state.connectorId,
    bindingId: state.bindingId,
    threadId: state.threadId,
    runId: state.runId,
    blockKey: `text:${state.textIndex}`,
    interruptId: null,
    draftId: state.draftId,
    lastText,
    externalMessageId: state.externalMessageId,
    status: 'streaming',
    updatedAt: new Date(deps.now()).toISOString(),
  });
}

function markDeliveryFinal(deps: DraftSendDeps, state: DraftSendState): void {
  if (state.deliveryId === null) {
    return;
  }
  deps.connectors.upsertDelivery(state.orgId, {
    id: state.deliveryId,
    connectorId: state.connectorId,
    bindingId: state.bindingId,
    threadId: state.threadId,
    runId: state.runId,
    blockKey: `text:${state.textIndex}`,
    interruptId: null,
    draftId: state.draftId,
    lastText: state.pending || state.lastSent,
    externalMessageId: state.externalMessageId,
    status: 'final',
    updatedAt: new Date(deps.now()).toISOString(),
  });
}

function openNextTextBlock(deps: DraftSendDeps, state: DraftSendState): void {
  markDeliveryFinal(deps, state);
  state.textIndex += 1;
  state.draftId += 1;
  state.deliveryId = null;
  state.externalMessageId = null;
  state.lastSent = '';
  state.lastSentAt = 0;
}

async function waitRetry(deps: DraftSendDeps, state: DraftSendState): Promise<void> {
  const wait = state.retryUntil - deps.now();
  if (wait > 0) {
    await deps.sleep(wait);
  }
}

function shouldFallbackToEdit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('TEXTDRAFT') || message.toLowerCase().includes('forum');
}

function retryAfterMs(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'retryAfter' in error) {
    const value = (error as { retryAfter: unknown }).retryAfter;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value * 1000;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('429')) {
    return null;
  }
  const match = /retry_after["\s:=]+(\d+)/i.exec(message);
  return match ? Number(match[1]) * 1000 : 1000;
}

export function draftStateFromConnector(
  connector: ConnectorRecord,
  input: {
    orgId: string;
    bindingId: string;
    threadId: string;
    runId: string;
    chatId: string;
    token: string;
    delivery?: ConnectorDeliveryRecord;
  },
): DraftSendState {
  return {
    orgId: input.orgId,
    connectorId: connector.id,
    bindingId: input.bindingId,
    threadId: input.threadId,
    runId: input.runId,
    chatId: input.chatId,
    token: input.token,
    coalesceMs: connector.policy.coalesceMs,
    streamMode: connector.streamMode,
    textIndex: input.delivery ? textIndexOf(input.delivery.blockKey) : 0,
    draftId: input.delivery?.draftId ?? 1,
    deliveryId: input.delivery?.id ?? null,
    externalMessageId: input.delivery?.externalMessageId ?? null,
    pending: input.delivery?.lastText ?? '',
    lastSent: input.delivery?.lastText ?? '',
    lastSentAt: 0,
    inFlight: false,
    retryUntil: 0,
  };
}

function textIndexOf(blockKey: string): number {
  const match = /^text:(\d+)$/.exec(blockKey);
  return match ? Number(match[1]) : 0;
}
