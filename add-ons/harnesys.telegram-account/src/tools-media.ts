import type { ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { chatLabelOf, chatRefOf } from './chat-target.ts';
import { loadMediaFile, writeMediaFile } from './media-bytes.ts';
import { workspacePathOf } from './media-source.ts';
import { assertSendAllowed, recordSend } from './send-log.ts';
import type { MediaFile } from './telegram-types.ts';
import { peerOf, requireWritable } from './tool-access.ts';
import { albumItemsOf, mediaItemOf } from './tool-album.ts';
import { withSharedClient } from './tool-client.ts';
import { withFloodRetry } from './tool-errors.ts';
import {
  booleanOf,
  optionalPositiveInt,
  parseModeParam,
  requiredChat,
  requiredMessageId,
  requiredString,
} from './tool-params.ts';
import { maxDownloadBytes, maxUploadBytes, toolSettings } from './tool-settings.ts';

const MAX_PATH = 512;

const sendMediaTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'send_media');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const item = mediaItemOf(input);
  const parseMode = parseModeParam(input);
  const replyTo = optionalPositiveInt(input, 'replyTo');
  const silent = booleanOf(input, 'silent', false);
  const forceDocument = booleanOf(input, 'forceDocument', false);
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const media = await loadMediaFile(ctx, item, maxUploadBytes(settings));
  const sent = await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const messageId = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.sendMedia(peer, media, { parseMode, replyTo, silent, forceDocument }),
    );
    return { messageId, title: peer.title, kind: peer.kind };
  });
  await recordSend(ctx, chat, new Date());
  return {
    messageId: String(sent.messageId),
    chat,
    title: sent.title,
    kind: sent.kind,
    mediaKind: media.kind,
    size: media.data.length,
    fileName: media.name,
  };
};

const sendAlbumTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'send_album');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const items = albumItemsOf(input, 'items');
  const parseMode = parseModeParam(input);
  const replyTo = optionalPositiveInt(input, 'replyTo');
  const silent = booleanOf(input, 'silent', false);
  const chat = chatLabelOf(ref);
  await assertSendAllowed(ctx, settings.limits, chat, new Date());
  const files: MediaFile[] = [];
  for (const item of items) {
    files.push(await loadMediaFile(ctx, item, maxUploadBytes(settings)));
  }
  const sent = await withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const messageIds = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.sendAlbum(peer, files, { parseMode, replyTo, silent }),
    );
    return { messageIds, title: peer.title };
  });
  await recordSend(ctx, chat, new Date());
  return {
    chat,
    title: sent.title,
    messageIds: sent.messageIds.map((id) => String(id)),
    count: sent.messageIds.length,
    size: files.reduce((sum, file) => sum + file.data.length, 0),
  };
};

const downloadMediaTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'download_media');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const messageId = requiredMessageId(input);
  const path = workspacePathOf(requiredString(input, 'path', MAX_PATH));
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const media = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.download(peer, messageId, maxDownloadBytes(settings)),
    );
    if (media.data.length === 0) {
      throw new AddonError('invalid_params', {
        detail: `message ${messageId} has no downloadable bytes`,
      });
    }
    const written = await writeMediaFile(ctx, path, media.data);
    return {
      chat: chatLabelOf(ref),
      messageId: String(messageId),
      path: written.path,
      size: written.size,
      mimeType: media.mimeType,
      mediaKind: media.mediaKind,
    };
  });
};

export const mediaTools: Record<string, ToolHandler> = {
  send_media: sendMediaTool,
  send_album: sendAlbumTool,
  download_media: downloadMediaTool,
};
