import { helpText, isPairedCommand, type PairedCommandName } from './bot-commands.ts';
import { pairCodeMatches } from './pair-code.ts';
import type { CanonicalUpdate } from './telegram-update.ts';

export type ActiveRunStatus = 'running' | 'queued' | 'waiting' | 'needs_input';

export interface InboundBinding {
  chatType: string;
  pairedUserId: string | null;
  threadId: string | null;
  threadKind: string | null;
}

export type InboundDecision =
  | { type: 'reply'; text: string; inbox: 'rejected' }
  | { type: 'pair'; userId: string; chatId: string; chatType: string; title: string }
  | { type: 'claim' }
  | { type: 'enqueue'; text: string; fileId?: string; fileKind?: 'photo' | 'document' }
  | { type: 'respond'; text: string }
  | { type: 'callback'; deliveryId: string }
  | { type: 'command'; name: PairedCommandName }
  | { type: 'stop' }
  | { type: 'ignore' };

export interface DecideInboundInput {
  update: CanonicalUpdate;
  pairHash: string | null;
  pairExpiresAt: number | null;
  now: number;
  binding: InboundBinding | null;
  activeRunStatus: ActiveRunStatus | null;
  canReadUnmentioned: boolean;
}

const NOT_LINKED = 'This bot is not linked yet.';
const NOT_CONNECTED_THREAD = 'This chat is not connected to a thread yet.';
const OTHER_ACCOUNT = 'This bot is already linked to another Telegram account.';
const UNSUPPORTED = 'I can take text, photos, and files.';
const FILE_WHILE_ASK = 'Reply with text or a button, then send the file.';
const NOT_CONNECTED = 'This chat is not connected to a workspace yet.';
const CLAIMED =
  'This chat is not connected to a workspace yet. An admin can connect it in Harnesys.';

export function decideInbound(input: DecideInboundInput): InboundDecision {
  const { update, binding } = input;

  if (update.kind === 'edit') {
    return { type: 'ignore' };
  }
  if (update.kind === 'generation_stopped') {
    return binding?.threadId ? { type: 'stop' } : { type: 'ignore' };
  }
  if (update.kind === 'callback') {
    return decideCallback(update, binding);
  }
  if (
    update.kind === 'chat_member' ||
    update.kind === 'topic_created' ||
    update.kind === 'ignored'
  ) {
    return { type: 'ignore' };
  }
  if (update.kind === 'unsupported') {
    return decideUnsupported(update, binding);
  }
  if (update.kind === 'command') {
    return decideCommand(input, update);
  }
  return decideMessage(input, update);
}

function isPrivate(chatType: string): boolean {
  return chatType === 'private';
}

function decideCallback(
  update: Extract<CanonicalUpdate, { kind: 'callback' }>,
  binding: InboundBinding | null,
): InboundDecision {
  if (!binding || binding.threadId === null) {
    return privateOnly(update.chatId, binding) ? reply(NOT_LINKED) : { type: 'ignore' };
  }
  if (binding.pairedUserId !== null && binding.pairedUserId !== update.userId) {
    return reply(OTHER_ACCOUNT);
  }
  return { type: 'callback', deliveryId: update.deliveryId };
}

function decideUnsupported(
  update: Extract<CanonicalUpdate, { kind: 'unsupported' }>,
  binding: InboundBinding | null,
): InboundDecision {
  if (!isPrivate(update.chatType)) {
    return { type: 'ignore' };
  }
  if (!binding || binding.threadId === null) {
    return reply(NOT_CONNECTED_THREAD);
  }
  return reply(UNSUPPORTED);
}

function decideCommand(
  input: DecideInboundInput,
  update: Extract<CanonicalUpdate, { kind: 'command' }>,
): InboundDecision {
  if (!isPrivate(update.chatType)) {
    return { type: 'ignore' };
  }
  if (update.command === 'start') {
    return decideStart(input, update);
  }
  const binding = input.binding;
  if (!binding) {
    return reply(NOT_LINKED);
  }
  if (binding.threadId === null) {
    return reply(NOT_CONNECTED_THREAD);
  }
  if (binding.pairedUserId !== null && binding.pairedUserId !== update.author.userId) {
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
  const binding = input.binding;
  if (binding?.pairedUserId !== null && binding?.pairedUserId === update.author.userId) {
    return reply(helpText());
  }
  if (binding?.pairedUserId != null && binding.pairedUserId !== update.author.userId) {
    return reply(OTHER_ACCOUNT);
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
  return {
    type: 'pair',
    userId: update.author.userId,
    chatId: update.chatId,
    chatType: update.chatType,
    title: update.chatTitle || update.author.displayName,
  };
}

function decideMessage(
  input: DecideInboundInput,
  update: Extract<CanonicalUpdate, { kind: 'message' }>,
): InboundDecision {
  const binding = input.binding;
  if (!binding) {
    if (isPrivate(update.chatType)) {
      return reply(NOT_LINKED);
    }
    return input.canReadUnmentioned ? { type: 'claim' } : { type: 'ignore' };
  }
  if (binding.threadId === null) {
    return isPrivate(update.chatType) ? reply(NOT_CONNECTED_THREAD) : { type: 'ignore' };
  }
  if (binding.pairedUserId !== null && binding.pairedUserId !== update.author.userId) {
    return reply(OTHER_ACCOUNT);
  }
  const hasFile = update.fileId !== undefined;
  const waitingForAnswer = input.activeRunStatus === 'needs_input';
  if (waitingForAnswer && binding.threadKind === 'chat') {
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

function privateOnly(chatId: string, binding: InboundBinding | null): boolean {
  void chatId;
  return binding === null || binding.chatType === 'private';
}

function reply(text: string): InboundDecision {
  return { type: 'reply', text, inbox: 'rejected' };
}

export function pairedNotice(): string {
  return 'Paired. An admin can connect this chat to a thread in Harnesys.';
}

export function pendingClaimNotice(): string {
  return CLAIMED;
}

export function pendingConnectionNotice(): string {
  return NOT_CONNECTED;
}
