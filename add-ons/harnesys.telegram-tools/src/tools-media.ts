import type { ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { requireWritable, resolveTarget, toolAccess } from './access.ts';
import { type FileSource, fileIdOf, type MediaKind, sendAlbum, sendMedia } from './media.ts';
import { enumField, intField, optionalBool, optionalStr, requireText } from './params.ts';

const MAX_CAPTION = 1024;
const PARSE_MODES = ['HTML', 'MarkdownV2'] as const;
const MEDIA_KINDS = ['photo', 'video', 'document'] as const;

function kindOf(input: Record<string, unknown>): MediaKind | undefined {
  return enumField(input, 'kind', MEDIA_KINDS);
}

function sourceOf(input: Record<string, unknown>): FileSource {
  const url = optionalStr(input, 'url');
  const path = optionalStr(input, 'path');
  const dataBase64 = optionalStr(input, 'dataBase64');
  const provided = [url, path, dataBase64].filter((entry) => entry !== undefined);
  if (provided.length !== 1) {
    throw new AddonError('invalid_params', {
      detail: 'pass exactly one of url, path or dataBase64',
    });
  }
  const kind = kindOf(input);
  const name = optionalStr(input, 'name');
  const mimeType = optionalStr(input, 'mimeType');
  return {
    ...(url === undefined ? {} : { url }),
    ...(path === undefined ? {} : { path }),
    ...(dataBase64 === undefined ? {} : { dataBase64 }),
    ...(kind === undefined ? {} : { kind }),
    ...(name === undefined ? {} : { name }),
    ...(mimeType === undefined ? {} : { mimeType }),
  };
}

export const sendMediaTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'send_media');
  const target = await resolveTarget(ctx, access, input);
  const caption = optionalStr(input, 'caption');
  const parseMode = enumField(input, 'parseMode', PARSE_MODES);
  const replyTo = intField(input, 'replyToMessageId', 'optional');
  const sent = await sendMedia(
    ctx,
    {
      ...target,
      ...(caption === undefined ? {} : { caption: requireText(caption, 'caption', MAX_CAPTION) }),
      ...(parseMode === undefined ? {} : { parseMode }),
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(optionalBool(input, 'disableNotification') === true ? { disableNotification: true } : {}),
    },
    sourceOf(input),
    { accountId: access.accountId },
  );
  const fileId = fileIdOf(sent);
  return {
    messageId: String(sent.message_id),
    bot: access.label,
    chat: target.chat,
    ...(fileId === undefined ? {} : { fileId }),
  };
};

function entriesOf(value: unknown, key: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const valid =
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
  if (!valid) {
    throw new AddonError('invalid_params', { detail: `${key} must be an array of strings` });
  }
  return value as string[];
}

function albumSources(input: Record<string, unknown>): FileSource[] {
  const urls = entriesOf(input.urls, 'urls');
  const paths = entriesOf(input.paths, 'paths');
  if (urls !== undefined && paths !== undefined) {
    throw new AddonError('invalid_params', { detail: 'pass urls or paths, not both' });
  }
  const kind = kindOf(input);
  const withKind = (source: FileSource): FileSource =>
    kind === undefined ? source : { ...source, kind };
  const sources = [
    ...(urls ?? []).map((url) => withKind({ url })),
    ...(paths ?? []).map((path) => withKind({ path })),
  ];
  if (sources.length === 0) {
    throw new AddonError('invalid_params', { detail: 'urls or paths is required' });
  }
  if (sources.length < 2 || sources.length > 10) {
    throw new AddonError('invalid_params', { detail: 'an album needs 2 to 10 items' });
  }
  return sources;
}

export const sendAlbumTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'send_album');
  const target = await resolveTarget(ctx, access, input);
  const caption = optionalStr(input, 'caption');
  const parseMode = enumField(input, 'parseMode', PARSE_MODES);
  const messages = await sendAlbum(
    ctx,
    {
      ...target,
      ...(caption === undefined ? {} : { caption: requireText(caption, 'caption', MAX_CAPTION) }),
      ...(parseMode === undefined ? {} : { parseMode }),
      ...(optionalBool(input, 'disableNotification') === true ? { disableNotification: true } : {}),
    },
    albumSources(input),
    { accountId: access.accountId },
  );
  const fileIds = messages
    .map((message) => fileIdOf(message))
    .filter((entry): entry is string => entry !== undefined);
  return {
    messageIds: messages.map((message) => String(message.message_id)),
    bot: access.label,
    chat: target.chat,
    ...(fileIds.length === 0 ? {} : { fileIds }),
  };
};
