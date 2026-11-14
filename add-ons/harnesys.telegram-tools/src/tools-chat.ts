import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { botAccounts, resolveTarget, toolAccess } from './access.ts';
import { call, downloadFile } from './bot-api.ts';
import { chatKey, chatTargetOf, str } from './params.ts';
import { accessOf, type TelegramAccess, toolSettings } from './settings.ts';

const MAX_LISTED_CHATS = 20;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const WRITE_CHUNK_BYTES = 2 * 1024 * 1024;

interface ListedChat {
  chat: string;
  topicId?: string;
  id: number | null;
  type: string | null;
  title: string;
  username: string | null;
  default: boolean;
  error?: string;
}

function titleOf(chat: Record<string, unknown>): string {
  if (typeof chat.title === 'string') {
    return chat.title;
  }
  return typeof chat.username === 'string' ? chat.username : '';
}

async function describeChat(
  ctx: AddonContext,
  access: TelegramAccess,
  entry: string,
  isDefault: boolean,
): Promise<ListedChat> {
  const target = chatTargetOf(entry);
  const base = {
    chat: target.chat,
    ...(target.topicId === undefined ? {} : { topicId: target.topicId }),
    default: isDefault,
  };
  try {
    const chat = await call<Record<string, unknown>>(
      ctx,
      'getChat',
      { chat_id: target.chat },
      { accountId: access.accountId },
    );
    return {
      ...base,
      id: typeof chat.id === 'number' ? chat.id : null,
      type: typeof chat.type === 'string' ? chat.type : null,
      title: titleOf(chat),
      username: typeof chat.username === 'string' ? chat.username : null,
    };
  } catch (error) {
    return {
      ...base,
      id: null,
      type: null,
      title: '',
      username: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const listBotsTool: ToolHandler = async (_input, ctx) => {
  const settings = await toolSettings(ctx);
  const bots = (await botAccounts(ctx)).map((account) => {
    const access = accessOf(account, settings);
    return {
      bot: account.accountId,
      label: account.label,
      telegramId: account.externalAccountId,
      status: account.status,
      readOnly: access.readOnly,
      defaultChat: access.defaultChat ?? null,
      allowedChats: access.allowedChats,
    };
  });
  return {
    bots,
    ...(bots.length === 0
      ? {
          hint: 'no bots are bound to this add-on; connect a Telegram bot on the add-on settings page',
        }
      : {}),
  };
};

export const listChatsTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  const defaultKey = access.defaultChat === undefined ? undefined : chatKey(access.defaultChat);
  const entries: string[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...(access.defaultChat === undefined ? [] : [access.defaultChat]),
    ...access.allowedChats,
  ];
  for (const entry of candidates) {
    const key = chatKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }
  const listed = entries.slice(0, MAX_LISTED_CHATS);
  const chats: ListedChat[] = [];
  for (const entry of listed) {
    chats.push(await describeChat(ctx, access, entry, chatKey(entry) === defaultKey));
  }
  return {
    bot: { id: access.accountId, label: access.label },
    chats,
    restricted: access.allowedChats.length > 0,
    truncated: entries.length > listed.length,
    ...(chats.length === 0
      ? {
          hint: 'no chats are configured for this bot; set Default chat or Allowed chats on the Telegram tools settings page, or pass a chat id explicitly',
        }
      : {}),
  };
};

export const getChatTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  const target = await resolveTarget(ctx, access, input);
  const chat = await call<Record<string, unknown>>(
    ctx,
    'getChat',
    { chat_id: target.chat },
    { accountId: access.accountId },
  );
  return {
    bot: access.label,
    id: chat.id,
    type: chat.type,
    title: chat.title ?? chat.username ?? '',
    username: chat.username ?? null,
    pinnedMessageId: chat.pinned_message
      ? (chat.pinned_message as { message_id: number }).message_id
      : null,
  };
};

export const getFileTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  const file = await call<{ file_id: string; file_path?: string; file_size?: number }>(
    ctx,
    'getFile',
    { file_id: str(input, 'fileId') },
    { accountId: access.accountId },
  );
  return {
    fileId: file.file_id,
    path: file.file_path ?? null,
    size: file.file_size ?? null,
  };
};

export const downloadFileTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  const file = await call<{ file_path?: string; file_size?: number }>(
    ctx,
    'getFile',
    { file_id: str(input, 'fileId') },
    { accountId: access.accountId },
  );
  if (file.file_path === undefined) {
    throw new AddonError('not_found', { detail: 'Telegram did not return a file path' });
  }
  if ((file.file_size ?? 0) > MAX_DOWNLOAD_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is larger than ${MAX_DOWNLOAD_BYTES} bytes`,
    });
  }
  const path = str(input, 'path');
  const bytes = Buffer.from(
    await downloadFile(ctx, file.file_path, { accountId: access.accountId }),
    'base64',
  );
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is larger than ${MAX_DOWNLOAD_BYTES} bytes`,
    });
  }
  let written: { path: string; size: number } | null = null;
  for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
    written = await ctx.files.write({
      path,
      data: bytes.subarray(offset, offset + WRITE_CHUNK_BYTES).toString('base64'),
      append: offset > 0,
    });
  }
  return { path: written?.path ?? path, size: bytes.length };
};
