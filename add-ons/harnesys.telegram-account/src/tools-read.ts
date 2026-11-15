import type { ToolHandler } from '@harnesys/sdk';
import { chatLabelOf, chatRefOf, matchesIdentity } from './chat-target.ts';
import { MAX_MESSAGE_TEXT } from './message-format.ts';
import type { FeedClient, MessageDetail } from './telegram-types.ts';
import { peerOf } from './tool-access.ts';
import { withSharedClient } from './tool-client.ts';
import {
  booleanOf,
  cappedLimitOf,
  limitOf,
  optionalPositiveInt,
  optionalString,
  requiredChat,
  requiredMessageId,
  requiredString,
} from './tool-params.ts';
import { toolSettings } from './tool-settings.ts';

const DEFAULT_DIALOG_LIMIT = 50;
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_PARTICIPANT_LIMIT = 50;
const PARTICIPANT_LIMIT_CAP = 200;
const DEFAULT_TOPIC_LIMIT = 20;
const TOPIC_LIMIT_CAP = 100;

function textOf(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_MESSAGE_TEXT
    ? { text: `${text.slice(0, MAX_MESSAGE_TEXT)}...`, truncated: true }
    : { text, truncated: false };
}

function messageViewOf(entry: {
  id: number;
  date: string;
  sender: string | null;
  text: string;
  mediaKind: string | null;
}): Record<string, unknown> {
  const body = textOf(entry.text);
  return {
    id: entry.id,
    date: entry.date,
    sender: entry.sender,
    text: body.text,
    mediaKind: entry.mediaKind,
    truncated: body.truncated,
  };
}

function detailViewOf(detail: MessageDetail): Record<string, unknown> {
  const body = textOf(detail.text);
  return {
    id: detail.id,
    date: detail.date,
    sender: detail.sender,
    text: body.text,
    truncated: body.truncated,
    mediaKind: detail.mediaKind,
    mediaSize: detail.mediaSize,
    replyToMessageId: detail.replyToMessageId,
    forwardFrom: detail.forwardFrom,
    views: detail.views,
    editedAt: detail.editedAt,
  };
}

async function usernameOfPeer(client: FeedClient, peerId: string): Promise<string | null> {
  try {
    return (await client.resolve(peerId)).username;
  } catch {
    return null;
  }
}

async function visibleFound(
  client: FeedClient,
  allowed: readonly string[],
  found: readonly MessageDetail[],
): Promise<MessageDetail[]> {
  const usernames = new Map<string, string | null>();
  const visible: MessageDetail[] = [];
  for (const detail of found) {
    const peerId = detail.peerId ?? '';
    if (matchesIdentity(allowed, { peerId, username: null })) {
      visible.push(detail);
      continue;
    }
    let username = usernames.get(peerId);
    if (username === undefined) {
      username = await usernameOfPeer(client, peerId);
      usernames.set(peerId, username);
    }
    if (matchesIdentity(allowed, { peerId, username })) {
      visible.push(detail);
    }
  }
  return visible;
}

const getAccountTool: ToolHandler = async (_input, ctx) => {
  return withSharedClient(ctx, async (client) => {
    const account = await client.account();
    return {
      id: account.id,
      username: account.username,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone,
    };
  });
};

const listDialogsTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const limit = limitOf(input, 'limit', DEFAULT_DIALOG_LIMIT, settings.maxDialogs);
  return withSharedClient(ctx, async (client) => {
    const dialogs = await client.dialogs(limit);
    return {
      dialogs: dialogs.map((dialog) => ({
        kind: dialog.kind,
        peerId: dialog.peerId,
        username: dialog.username,
        title: dialog.title,
        unread: dialog.unread,
      })),
      count: dialogs.length,
      limit,
    };
  });
};

const listMessagesTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const limit = limitOf(input, 'limit', DEFAULT_HISTORY_LIMIT, settings.maxHistoryLimit);
  const beforeId = optionalPositiveInt(input, 'beforeId');
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const entries = await client.history(peer, limit, beforeId);
    return {
      chat: chatLabelOf(ref),
      title: peer.title,
      kind: peer.kind,
      messages: entries.map((entry) => messageViewOf(entry)),
      count: entries.length,
      limit,
    };
  });
};

const getMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = requiredMessageId(input);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const detail = await client.message(peer, messageId);
    return {
      chat: chatLabelOf(ref),
      title: peer.title,
      kind: peer.kind,
      message: detailViewOf(detail),
    };
  });
};

const searchMessagesTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const query = requiredString(input, 'query', 256);
  const limit = limitOf(input, 'limit', DEFAULT_HISTORY_LIMIT, settings.maxHistoryLimit);
  const rawChat = optionalString(input, 'chat', 256);
  const ref = rawChat === undefined ? null : chatRefOf(rawChat);
  return withSharedClient(ctx, async (client) => {
    const peer = ref === null ? undefined : await peerOf(client, settings, ref);
    const found = await client.search(query, peer, limit);
    const visible = await visibleFound(client, settings.allowedChats, found);
    return {
      chat: ref === null ? null : chatLabelOf(ref),
      query,
      messages: visible.map((detail) => ({
        ...detailViewOf(detail),
        peerId: detail.peerId,
      })),
      count: visible.length,
      filteredOut: found.length - visible.length,
      limit,
    };
  });
};

const getChatTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const ref = chatRefOf(requiredChat(input, 'chat'));
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const info = await client.chatInfo(peer);
    return { chat: chatLabelOf(ref), ...info };
  });
};

const listParticipantsTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const limit = cappedLimitOf(input, 'limit', DEFAULT_PARTICIPANT_LIMIT, PARTICIPANT_LIMIT_CAP);
  const search = optionalString(input, 'search', 128);
  const adminsOnly = booleanOf(input, 'adminsOnly', false);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const participants = await client.participants(peer, { limit, search, adminsOnly });
    return {
      chat: chatLabelOf(ref),
      title: peer.title,
      participants,
      count: participants.length,
      limit,
    };
  });
};

const listTopicsTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const limit = cappedLimitOf(input, 'limit', DEFAULT_TOPIC_LIMIT, TOPIC_LIMIT_CAP);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const topics = await client.topics(peer, limit);
    return { chat: chatLabelOf(ref), title: peer.title, topics, count: topics.length, limit };
  });
};

export const readTools: Record<string, ToolHandler> = {
  get_account: getAccountTool,
  list_dialogs: listDialogsTool,
  list_messages: listMessagesTool,
  get_message: getMessageTool,
  search_messages: searchMessagesTool,
  get_chat: getChatTool,
  list_participants: listParticipantsTool,
  list_topics: listTopicsTool,
};
