import type { ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { chatLabelOf, chatRefOf } from './chat-target.ts';
import { defaultExtension, type OutgoingMediaKind } from './media-kind.ts';
import { MAX_TEXT } from './message-format.ts';
import { scheduleSecondsOf } from './schedule.ts';
import { assertSendAllowed, recordSend } from './send-log.ts';
import { peerOf, requireWritable } from './tool-access.ts';
import { MAX_CAPTION } from './tool-album.ts';
import { withSharedClient } from './tool-client.ts';
import { withFloodRetry } from './tool-errors.ts';
import {
  booleanOf,
  messageIdsOf,
  optionalPositiveInt,
  optionalString,
  parseModeParam,
  requiredChat,
  requiredMessageId,
  requiredMessageIds,
  requiredString,
} from './tool-params.ts';
import { maxDownloadBytes, maxUploadBytes, toolSettings } from './tool-settings.ts';

const MAX_FORWARD_IDS = 100;

const COPY_KINDS: Record<string, OutgoingMediaKind> = {
  photo: 'photo',
  video: 'video',
  animation: 'gif',
  voice: 'voice',
  audio: 'audio',
};

function copyKindOf(mediaKind: string | null): OutgoingMediaKind {
  if (mediaKind === null) {
    return 'document';
  }
  return COPY_KINDS[mediaKind] ?? 'document';
}

function messageIdOrNull(input: Record<string, unknown>): number | null {
  return optionalPositiveInt(input, 'messageId') ?? null;
}

function forwardIdsOf(input: Record<string, unknown>, legacy: number | null): number[] {
  const ids = messageIdsOf(input, 'messageIds', MAX_FORWARD_IDS);
  if (ids.length > 0) {
    return ids;
  }
  return legacy === null ? [] : [legacy];
}

function emojiParam(input: Record<string, unknown>): string {
  const raw = input.emoji;
  if (raw === undefined || raw === null) {
    throw new AddonError('invalid_params', {
      detail: 'emoji is required; pass an empty string to clear the reaction',
    });
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: 'emoji must be a string' });
  }
  if (raw.length > 32) {
    throw new AddonError('invalid_params', { detail: 'emoji is longer than 32 characters' });
  }
  return raw;
}

const sendMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'send_message');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const text = requiredString(input, 'text', MAX_TEXT);
  const replyTo = optionalPositiveInt(input, 'replyTo');
  const parseMode = parseModeParam(input);
  const silent = booleanOf(input, 'silent', false);
  const scheduleAt = scheduleSecondsOf(input.scheduleAt, new Date());
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const sent = await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const messageId = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.sendText(peer, text, { replyTo, parseMode, silent, scheduleAt }),
    );
    return { messageId, title: peer.title, kind: peer.kind };
  });
  await recordSend(ctx, chat, new Date());
  return {
    messageId: String(sent.messageId),
    chat,
    title: sent.title,
    kind: sent.kind,
    scheduled: scheduleAt !== undefined,
  };
};

const forwardMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'forward_message');
  const toRef = chatRefOf(requiredChat(input, 'toChat'));
  const fromRef = chatRefOf(requiredChat(input, 'fromChat'));
  const legacy = messageIdOrNull(input);
  const messageIds = forwardIdsOf(input, legacy);
  if (messageIds.length === 0) {
    throw new AddonError('invalid_params', {
      detail: 'messageIds (or messageId) is required; up to 100 ids per call',
    });
  }
  const dropAuthor = booleanOf(input, 'dropAuthor', false);
  const silent = booleanOf(input, 'silent', false);
  const chat = chatLabelOf(toRef);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const forwarded = await withSharedClient(ctx, async (client) => {
    const to = await peerOf(client, settings, toRef);
    const from = await peerOf(client, settings, fromRef);
    const messageIdsSent = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.forward(from, messageIds, to, { dropAuthor, silent }),
    );
    return messageIdsSent;
  });
  await recordSend(ctx, chat, new Date());
  return {
    chat,
    from: chatLabelOf(fromRef),
    messageIds: forwarded.map((id) => String(id)),
    sourceMessageIds: messageIds.map((id) => String(id)),
    count: forwarded.length,
  };
};

const copyMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'copy_message');
  const toRef = chatRefOf(requiredChat(input, 'to'));
  const fromRef = chatRefOf(requiredChat(input, 'from'));
  const messageId = requiredMessageId(input);
  const caption = optionalString(input, 'caption', MAX_CAPTION);
  const silent = booleanOf(input, 'silent', false);
  const parseMode = parseModeParam(input);
  const chat = chatLabelOf(toRef);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const copied = await withSharedClient(ctx, async (client) => {
    const from = await peerOf(client, settings, fromRef);
    const to = await peerOf(client, settings, toRef);
    if (caption === undefined) {
      const forwarded = await withFloodRetry(settings.limits.floodWaitRetries, () =>
        client.forward(from, [messageId], to, { dropAuthor: true, silent }),
      );
      return { messageIds: forwarded, mode: 'forward' as const };
    }
    const media = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.download(
        from,
        messageId,
        Math.min(maxDownloadBytes(settings), maxUploadBytes(settings)),
      ),
    );
    const kind = copyKindOf(media.mediaKind);
    const sentId = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.sendMedia(
        to,
        {
          data: media.data,
          name: media.fileName.length > 0 ? media.fileName : `file.${defaultExtension(kind)}`,
          mimeType: media.mimeType,
          kind,
          caption,
        },
        { parseMode, silent, forceDocument: kind === 'document' },
      ),
    );
    return { messageIds: [sentId], mode: 'reupload' as const };
  });
  await recordSend(ctx, chat, new Date());
  return {
    chat,
    from: chatLabelOf(fromRef),
    sourceMessageId: String(messageId),
    messageIds: copied.messageIds.map((id) => String(id)),
    mode: copied.mode,
  };
};

const editMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'edit_message');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = requiredMessageId(input);
  const text = requiredString(input, 'text', MAX_TEXT);
  const parseMode = parseModeParam(input);
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const edited = await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.editText(peer, messageId, text, parseMode),
    );
    return { title: peer.title, kind: peer.kind };
  });
  await recordSend(ctx, chat, new Date());
  return { chat, messageId: String(messageId), title: edited.title, kind: edited.kind };
};

const deleteMessagesTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'delete_messages');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageIds = requiredMessageIds(input, 'messageIds', MAX_FORWARD_IDS);
  const revoke = booleanOf(input, 'revoke', true);
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.deleteMessages(peer, messageIds, revoke),
    );
  });
  await recordSend(ctx, chat, new Date());
  return { chat, messageIds: messageIds.map((id) => String(id)), count: messageIds.length, revoke };
};

const pinMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'pin_message');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = requiredMessageId(input);
  const notify = booleanOf(input, 'notify', false);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.pinMessage(peer, messageId, notify),
    );
    return { chat: chatLabelOf(ref), messageId: String(messageId), notify, pinned: true };
  });
};

const unpinMessageTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'unpin_message');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = messageIdOrNull(input);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.unpinMessage(peer, messageId ?? undefined),
    );
    return {
      chat: chatLabelOf(ref),
      messageId: messageId === null ? null : String(messageId),
      unpinned: messageId === null ? 'all' : 'one',
    };
  });
};

const reactTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'react');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = requiredMessageId(input);
  const emoji = emojiParam(input);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.react(peer, messageId, emoji),
    );
    return {
      chat: chatLabelOf(ref),
      messageId: String(messageId),
      emoji,
      cleared: emoji.length === 0,
    };
  });
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

export const sendTools: Record<string, ToolHandler> = {
  send_message: sendMessageTool,
  forward_message: forwardMessageTool,
  copy_message: copyMessageTool,
  edit_message: editMessageTool,
  delete_messages: deleteMessagesTool,
  pin_message: pinMessageTool,
  unpin_message: unpinMessageTool,
  react: reactTool,
  mark_read: markReadTool,
};
