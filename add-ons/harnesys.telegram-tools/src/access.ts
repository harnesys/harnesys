import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { call } from './bot-api.ts';
import { type ChatTarget, chatKey, chatTargetOf, optionalStr } from './params.ts';
import { accessOf, type TelegramAccess, toolSettings } from './settings.ts';

export interface BotAccount {
  accountId: string;
  label: string;
  externalAccountId: string;
  status: string;
}

interface ChatIdentity {
  id: number | null;
  username: string | null;
}

const IDENTITIES = new Map<string, ChatIdentity>();

export async function botAccounts(ctx: AddonContext): Promise<BotAccount[]> {
  const rows = await ctx.accounts.list('telegram-bot');
  return rows.map((row) => ({
    accountId: row.accountId,
    label: row.label,
    externalAccountId: row.externalAccountId,
    status: row.status,
  }));
}

export function describeBots(accounts: readonly BotAccount[]): string {
  return accounts.map((account) => `${account.label} (${account.accountId})`).join(', ');
}

export function selectBot(
  accounts: readonly BotAccount[],
  requested: string | undefined,
): BotAccount {
  if (accounts.length === 0) {
    throw new AddonError('account_failed', {
      accountCode: 'not_found',
      detail:
        'no Telegram bot account is bound to this add-on; connect a bot on the Telegram tools settings page',
    });
  }
  if (requested !== undefined) {
    const key = requested.trim().toLowerCase();
    const found = accounts.find(
      (account) =>
        account.accountId.toLowerCase() === key ||
        account.label.toLowerCase() === key ||
        account.externalAccountId === requested.trim(),
    );
    if (found === undefined) {
      throw new AddonError('invalid_params', {
        detail: `bot ${requested} is not bound; bound bots: ${describeBots(accounts)}`,
      });
    }
    return found;
  }
  const only = accounts[0];
  if (accounts.length === 1 && only !== undefined) {
    return only;
  }
  throw new AddonError('invalid_params', {
    detail: `several bots are bound; pass bot with one of: ${describeBots(accounts)}`,
  });
}

export async function toolAccess(
  ctx: AddonContext,
  input: Record<string, unknown>,
): Promise<TelegramAccess> {
  const settings = await toolSettings(ctx);
  return accessOf(selectBot(await botAccounts(ctx), optionalStr(input, 'bot')), settings);
}

export function requireWritable(access: TelegramAccess, tool: string): void {
  if (access.readOnly) {
    throw new AddonError('permission_denied', {
      detail: `bot ${access.label} is read-only, so ${tool} is disabled; turn Read-only off for this bot in the Telegram tools settings`,
    });
  }
}

async function identityOf(
  ctx: AddonContext,
  access: TelegramAccess,
  chat: string,
): Promise<ChatIdentity | null> {
  const key = `${access.accountId}:${chatKey(chat)}`;
  const cached = IDENTITIES.get(key);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const info = await call<Record<string, unknown>>(
      ctx,
      'getChat',
      { chat_id: chat },
      { accountId: access.accountId },
    );
    const identity: ChatIdentity = {
      id: typeof info.id === 'number' ? info.id : null,
      username: typeof info.username === 'string' ? info.username : null,
    };
    IDENTITIES.set(key, identity);
    return identity;
  } catch {
    return null;
  }
}

function matchesIdentity(entries: readonly string[], identity: ChatIdentity): boolean {
  const keys = new Set(entries.map((entry) => chatKey(entry)));
  if (identity.id !== null && keys.has(String(identity.id))) {
    return true;
  }
  return identity.username !== null && keys.has(chatKey(identity.username));
}

export async function requireAllowed(
  ctx: AddonContext,
  access: TelegramAccess,
  chat: string,
): Promise<void> {
  if (access.allowedChats.length === 0) {
    return;
  }
  const key = chatKey(chat);
  if (access.allowedChats.some((entry) => chatKey(entry) === key)) {
    return;
  }
  const identity = await identityOf(ctx, access, chat);
  if (identity !== null && matchesIdentity(access.allowedChats, identity)) {
    return;
  }
  throw new AddonError('permission_denied', {
    detail: `bot ${access.label} may not use chat ${chat}; allowed chats: ${access.allowedChats.join(', ')}. An id and its @username are the same grant, so either spelling works when one of them is listed`,
  });
}

export async function resolveTarget(
  ctx: AddonContext,
  access: TelegramAccess,
  input: Record<string, unknown>,
): Promise<ChatTarget> {
  const raw = optionalStr(input, 'chat') ?? access.defaultChat;
  if (raw === undefined) {
    throw new AddonError('invalid_params', {
      detail:
        'chat is required: pass a chat id or @username, or set Default chat in the Telegram tools add-on settings',
    });
  }
  const target = chatTargetOf(raw);
  await requireAllowed(ctx, access, target.chat);
  const topicId = optionalStr(input, 'topicId') ?? target.topicId;
  return topicId === undefined ? { chat: target.chat } : { chat: target.chat, topicId };
}
