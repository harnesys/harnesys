import { helpText, isPairedCommand, type PairedCommandName } from './bot-commands.ts';
import type { ConnectorStatus } from './connector.ts';
import { pairCodeMatches } from './pair-code.ts';
import type { CanonicalUpdate } from './telegram-update.ts';

export type ActiveRunStatus = 'running' | 'queued' | 'waiting' | 'needs_input';

export type InboundDecision =
  | { type: 'reply'; text: string; inbox: 'rejected' }
  | { type: 'pair'; userId: string; chatId: string }
  | { type: 'enqueue'; text: string; fileId?: string; fileKind?: 'photo' | 'document' }
  | { type: 'respond'; text: string }
  | { type: 'callback'; deliveryId: string }
  | { type: 'command'; name: PairedCommandName }
  | { type: 'stop' }
  | { type: 'ignore' };

export interface DecideInboundInput {
  update: CanonicalUpdate;
  connectorStatus: ConnectorStatus;
  pairHash: string | null;
  pairExpiresAt: number | null;
  now: number;
  bindingUserId: string | null;
  activeRunStatus: ActiveRunStatus | null;
}

const NOT_LINKED = 'This bot is not linked yet.';
const PRIVATE_ONLY = 'This bot only accepts a private chat.';
const OTHER_ACCOUNT = 'This bot is already linked to another Telegram account.';
const UNSUPPORTED = 'I can take text, photos, and files.';
const FILE_WHILE_ASK = 'Reply with text or a button, then send the file.';

export function decideInbound(input: DecideInboundInput): InboundDecision {
  void input.connectorStatus;
  const { update, bindingUserId } = input;

  if (update.kind === 'edit') {
    return { type: 'ignore' };
  }
  if (update.kind === 'generation_stopped') {
    return { type: 'stop' };
  }
  if (update.kind === 'callback') {
    return decideCallback(update.userId, bindingUserId, update.deliveryId);
  }
  if (update.kind === 'unsupported') {
    return decideUnsupported(update.chatType, bindingUserId);
  }
  if (update.kind === 'command') {
    return decideCommand(input, update);
  }
  return decideMessage(input, update);
}

function decideCallback(
  userId: string,
  bindingUserId: string | null,
  deliveryId: string,
): InboundDecision {
  if (bindingUserId === null) {
    return reply(NOT_LINKED);
  }
  if (bindingUserId !== userId) {
    return reply(OTHER_ACCOUNT);
  }
  return { type: 'callback', deliveryId };
}

function decideUnsupported(chatType: string, bindingUserId: string | null): InboundDecision {
  if (chatType !== 'private') {
    return reply(PRIVATE_ONLY);
  }
  if (bindingUserId === null) {
    return reply(NOT_LINKED);
  }
  return reply(UNSUPPORTED);
}

function decideCommand(
  input: DecideInboundInput,
  update: Extract<CanonicalUpdate, { kind: 'command' }>,
): InboundDecision {
  if (update.chatType !== 'private') {
    return reply(PRIVATE_ONLY);
  }
  if (update.command === 'start') {
    return decideStart(input, update);
  }
  if (input.bindingUserId === null) {
    return reply(NOT_LINKED);
  }
  if (input.bindingUserId !== update.userId) {
    return reply(OTHER_ACCOUNT);
  }
  if (isPairedCommand(update.command)) {
    return { type: 'command', name: update.command };
  }
  return reply(helpText());
}

function decideStart(
  input: DecideInboundInput,
  update: Extract<CanonicalUpdate, { kind: 'command' }>,
): InboundDecision {
  if (input.bindingUserId !== null && input.bindingUserId !== update.userId) {
    return reply(OTHER_ACCOUNT);
  }
  if (input.bindingUserId !== null && input.bindingUserId === update.userId) {
    return reply(NOT_LINKED);
  }
  const hash = input.pairHash;
  const expiresAt = input.pairExpiresAt;
  if (
    hash === null ||
    expiresAt === null ||
    !pairCodeMatches(update.args.trim(), hash, expiresAt, input.now)
  ) {
    return reply(NOT_LINKED);
  }
  return { type: 'pair', userId: update.userId, chatId: update.chatId };
}

function decideMessage(
  input: DecideInboundInput,
  update: Extract<CanonicalUpdate, { kind: 'message' }>,
): InboundDecision {
  if (update.chatType !== 'private') {
    return reply(PRIVATE_ONLY);
  }
  if (input.bindingUserId === null) {
    return reply(NOT_LINKED);
  }
  if (input.bindingUserId !== update.userId) {
    return reply(OTHER_ACCOUNT);
  }
  const hasFile = update.fileId !== undefined;
  if (input.activeRunStatus === 'needs_input') {
    if (hasFile) {
      return reply(FILE_WHILE_ASK);
    }
    return { type: 'respond', text: update.text };
  }
  if (hasFile) {
    return {
      type: 'enqueue',
      text: update.text,
      fileId: update.fileId,
      fileKind: update.fileKind,
    };
  }
  return { type: 'enqueue', text: update.text };
}

function reply(text: string): InboundDecision {
  return { type: 'reply', text, inbox: 'rejected' };
}
