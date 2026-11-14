import type { ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import {
  type ChatRef,
  chatLabelOf,
  chatRefOf,
  matchesAllowed,
  resolveArgOf,
} from './chat-target.ts';
import { assertSendAllowed, recordSend } from './send-log.ts';
import type { FeedClient, ResolvedPeer } from './telegram-types.ts';
import { withSharedClient } from './tool-client.ts';
import { withFloodRetry } from './tool-errors.ts';
import { limitOf, optionalPositiveInt, requiredChat, requiredString } from './tool-params.ts';
import { type AccountToolSettings, toolSettings } from './tool-settings.ts';

const MAX_TEXT = 4096;
const MAX_MESSAGE_TEXT = 2000;
const DEFAULT_DIALOG_LIMIT = 50;
const DEFAULT_HISTORY_LIMIT = 20;

function requireWritable(settings: AccountToolSettings, tool: string): void {
  if (settings.readOnly) {
    throw new AddonError('permission_denied', {
      detail: `${tool} is disabled because read_only is on for this add-on; turn Read-only off to send, forward or mark chats read`,
    });
  }
}

async function peerOf(
  client: FeedClient,
  settings: AccountToolSettings,
  ref: ChatRef,
): Promise<ResolvedPeer> {
  const peer = await client.resolve(resolveArgOf(ref));
  const allowed = matchesAllowed(settings.allowedChats, ref, {
    peerId: peer.peerId,
    username: peer.username,
  });
  if (!allowed) {
    throw new AddonError('permission_denied', {
      detail: `${chatLabelOf(ref)} is not in allowed_chats (${settings.allowedChats.join(', ')}); an id and its @username are the same grant, so either spelling works when one of them is listed`,
    });
  }
  return peer;
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
      messages: entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        sender: entry.sender,
        text:
          entry.text.length > MAX_MESSAGE_TEXT
            ? `${entry.text.slice(0, MAX_MESSAGE_TEXT)}...`
            : entry.text,
        mediaKind: entry.mediaKind,
        truncated: entry.text.length > MAX_MESSAGE_TEXT,
      })),
      count: entries.length,
      limit,
    };
  });
};

const sendMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'send_message');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const text = requiredString(input, 'text', MAX_TEXT);
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const sent = await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const messageId = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.sendText(peer, text),
    );
    return { messageId, title: peer.title, kind: peer.kind };
  });
  await recordSend(ctx, chat, new Date());
  return { messageId: String(sent.messageId), chat, title: sent.title, kind: sent.kind };
};

const forwardMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'forward_message');
  const toRef = chatRefOf(requiredChat(input, 'toChat'));
  const fromRef = chatRefOf(requiredChat(input, 'fromChat'));
  const messageId = optionalPositiveInt(input, 'messageId');
  if (messageId === undefined) {
    throw new AddonError('invalid_params', { detail: 'messageId must be a positive integer' });
  }
  const chat = chatLabelOf(toRef);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const forwardedId = await withSharedClient(ctx, async (client) => {
    const to = await peerOf(client, settings, toRef);
    const from = await peerOf(client, settings, fromRef);
    return withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.forward(from, messageId, to),
    );
  });
  await recordSend(ctx, chat, new Date());
  return {
    messageId: String(forwardedId),
    chat,
    from: chatLabelOf(fromRef),
    sourceMessageId: String(messageId),
  };
};

const markReadTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'mark_read');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await client.markRead(peer);
    return { chat: chatLabelOf(ref), title: peer.title, read: true };
  });
};

export const telegramAccountTools: Record<string, ToolHandler> = {
  get_account: getAccountTool,
  list_dialogs: listDialogsTool,
  list_messages: listMessagesTool,
  send_message: sendMessageTool,
  forward_message: forwardMessageTool,
  mark_read: markReadTool,
};
