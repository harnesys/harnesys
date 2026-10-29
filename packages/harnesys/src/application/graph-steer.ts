import type { Event } from '../domain/snapshot.ts';

export interface SteerMessage {
  itemId?: string;
  text: string;
  attachments?: unknown;
  origin?: string;
  clientEventId?: string;
}

export interface SteerApplyArgs {
  steer?: () => Promise<SteerMessage[]>;
  ack?: (itemIds: string[]) => Promise<void>;
  st: Record<string, unknown>;
  commit: (
    status: string,
    type: string,
    kind?: 'recorded' | 'intent',
    metadata?: Record<string, unknown>,
  ) => Promise<Event>;
}

export async function* applySteerMessages(args: SteerApplyArgs): AsyncGenerator<Event> {
  if (!args.steer) {
    return;
  }
  let incoming: SteerMessage[];
  try {
    incoming = await args.steer();
  } catch {
    return;
  }
  if (incoming.length === 0) {
    return;
  }
  let arr: unknown[];
  if (Array.isArray(args.st.messages)) {
    arr = args.st.messages;
  } else {
    arr = [];
    args.st.messages = arr;
  }
  for (const msg of incoming) {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : undefined;
    arr.push(userMessageOf(msg.text, attachments, msg.origin));
    yield await args.commit('running', 'user.message', 'recorded', {
      text: msg.text,
      ...(attachments ? { attachments } : {}),
      ...(msg.origin ? { origin: msg.origin } : {}),
      ...(msg.clientEventId ? { clientEventId: msg.clientEventId } : {}),
    });
  }
  const itemIds = incoming
    .map((msg) => msg.itemId)
    .filter((itemId): itemId is string => itemId !== undefined);
  if (itemIds.length > 0) {
    await args.ack?.(itemIds);
  }
}

function userMessageOf(
  text: string,
  attachments: unknown[] | undefined,
  origin: string | undefined,
): Record<string, unknown> {
  const message: Record<string, unknown> = { role: 'user', content: text };
  if (attachments && attachments.length > 0) {
    message.attachments = attachments;
  }
  if (origin) {
    message.origin = origin;
  }
  return message;
}
