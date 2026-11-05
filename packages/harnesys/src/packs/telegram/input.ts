import path from 'node:path';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type {
  TelegramChatTarget,
  TelegramMediaKind,
  TelegramMediaSource,
  TelegramParseMode,
} from '../../ports/telegram-chats.ts';
import type { ToolCallGate, ToolContext, ToolGateContext } from '../../ports/tools.ts';

export const TARGET_PROPERTIES = {
  chat: {
    type: 'string',
    description: 'Chat id, @username, or chat title that the bot already knows',
  },
  bot: {
    type: 'string',
    description: 'Bot @username when more than one Telegram bot is connected',
  },
  topicId: {
    type: 'string',
    description: 'Forum topic id when posting into a topic of a group',
  },
} as const;

export const PARSE_MODE_PROPERTY = {
  type: 'string',
  enum: ['HTML', 'MarkdownV2'],
  description: 'Telegram formatting mode for text or captions',
};

export const MEDIA_INPUT_PROPERTIES = {
  filePath: {
    type: 'string',
    description:
      'Local file path on the server or a thread locator such as thread:attachments/report.pdf',
  },
  fileId: {
    type: 'string',
    description: 'Telegram file_id of media the bot has already sent or received',
  },
  bytes: {
    type: 'string',
    description: 'Base64-encoded file content; alternative to filePath',
  },
  filename: { type: 'string', description: 'File name shown in Telegram; inferred when omitted' },
  caption: { type: 'string', description: 'Optional caption, up to 1024 characters' },
  parseMode: PARSE_MODE_PROPERTY,
  disableNotification: { type: 'boolean', description: 'Post silently' },
  replyToMessageId: { type: 'string', description: 'Message id to reply to' },
} as const;

export interface MediaInput {
  filePath?: string;
  fileId?: string;
  bytes?: string;
  filename?: string;
  caption?: string;
  parseMode?: TelegramParseMode;
  disableNotification?: boolean;
  replyToMessageId?: string;
}

export function targetOf(raw: unknown, fallbackBot: string | undefined): TelegramChatTarget {
  const input = raw as Record<string, unknown>;
  const bot =
    typeof input.bot === 'string' && input.bot.trim() !== '' ? input.bot.trim() : undefined;
  const topicId =
    typeof input.topicId === 'string' && input.topicId.trim() !== '' ? input.topicId.trim() : null;
  const resolvedBot = bot ?? fallbackBot;
  return {
    chat: typeof input.chat === 'string' ? input.chat : String(input.chat ?? ''),
    ...(resolvedBot ? { bot: resolvedBot } : {}),
    ...(topicId !== null ? { topicId } : {}),
  };
}

export async function mediaSourceOf(
  input: MediaInput,
  ctx: ToolContext,
  kind: TelegramMediaKind,
): Promise<TelegramMediaSource> {
  if (input.fileId !== undefined && input.fileId.trim() !== '') {
    return { fileId: input.fileId.trim() };
  }
  if (input.filePath !== undefined && input.filePath.trim() !== '') {
    const absolute = resolveFileTarget(ctx, input.filePath, 'read', {});
    const bytes = new Uint8Array(await Bun.file(absolute).arrayBuffer());
    return { bytes, filename: input.filename ?? path.basename(absolute) ?? `${kind}` };
  }
  if (input.bytes !== undefined && input.bytes.trim() !== '') {
    return {
      bytes: Uint8Array.from(Buffer.from(input.bytes, 'base64')),
      filename: input.filename ?? kind,
    };
  }
  throw new Error('Telegram media requires filePath, fileId, or bytes');
}

export function mediaGate(input: unknown, ctx: ToolGateContext): ToolCallGate | undefined {
  return fileAccessGate('read', (raw) => (raw as { filePath?: string }).filePath)(input, ctx);
}

export function albumGate(input: unknown, ctx: ToolGateContext): ToolCallGate | undefined {
  const items = (input as { items?: Array<{ filePath?: string }> }).items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  for (const item of items) {
    const gate = mediaGate(item, ctx);
    if (gate !== undefined && gate.decision !== 'allow') {
      return gate;
    }
  }
  return undefined;
}
