import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';

export interface BotRule {
  allowedChats?: readonly string[];
  readOnly?: boolean;
  defaultChat?: string;
}

export interface TelegramToolSettings {
  defaultChat: string | undefined;
  allowedChats: readonly string[];
  readOnly: boolean;
  bots: Readonly<Record<string, BotRule>>;
}

export interface TelegramAccess {
  accountId: string;
  label: string;
  defaultChat: string | undefined;
  allowedChats: readonly string[];
  readOnly: boolean;
}

const CONFIG_KEYS = ['default_chat', 'allowed_chats', 'read_only', 'bots'];

function invalid(detail: string): AddonError {
  return new AddonError('invalid_params', { detail });
}

function chatListOf(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw invalid(`${field} must be an array of chat ids or @usernames`);
  }
  return value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw invalid(`${field} must hold non-empty strings`);
    }
    return entry.trim();
  });
}

function ruleOf(key: string, value: unknown): BotRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`bots.${key} must be an object`);
  }
  const row = value as Record<string, unknown>;
  const rule: BotRule = {};
  if (row.allowed_chats !== undefined) {
    rule.allowedChats = chatListOf(row.allowed_chats, `bots.${key}.allowed_chats`);
  }
  if (row.read_only !== undefined) {
    if (typeof row.read_only !== 'boolean') {
      throw invalid(`bots.${key}.read_only must be a boolean`);
    }
    rule.readOnly = row.read_only;
  }
  if (row.default_chat !== undefined) {
    if (typeof row.default_chat !== 'string' || row.default_chat.trim().length === 0) {
      throw invalid(`bots.${key}.default_chat must be a non-empty string`);
    }
    rule.defaultChat = row.default_chat.trim();
  }
  return rule;
}

export function botsOf(value: unknown): Record<string, BotRule> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return {};
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw invalid('bots must be a JSON object like {"@my_bot": {"read_only": true}}');
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid('bots must be a JSON object keyed by account id or bot label');
  }
  const rules: Record<string, BotRule> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      throw invalid('bots keys must be account ids or bot labels');
    }
    rules[trimmed.toLowerCase()] = ruleOf(trimmed, entry);
  }
  return rules;
}

export function settingsOf(raw: Record<string, unknown>): TelegramToolSettings {
  const defaultChat = typeof raw.default_chat === 'string' ? raw.default_chat.trim() : '';
  const allowed = typeof raw.allowed_chats === 'string' ? raw.allowed_chats : '';
  const allowedChats = allowed
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return {
    defaultChat: defaultChat.length === 0 ? undefined : defaultChat,
    allowedChats,
    readOnly: raw.read_only === true,
    bots: botsOf(raw.bots),
  };
}

export async function toolSettings(ctx: AddonContext): Promise<TelegramToolSettings> {
  return settingsOf(await ctx.config.get([...CONFIG_KEYS]));
}

export function accessOf(
  account: { accountId: string; label: string },
  settings: TelegramToolSettings,
): TelegramAccess {
  const rule =
    settings.bots[account.accountId.toLowerCase()] ?? settings.bots[account.label.toLowerCase()];
  return {
    accountId: account.accountId,
    label: account.label,
    defaultChat: rule?.defaultChat ?? settings.defaultChat,
    allowedChats: rule?.allowedChats ?? settings.allowedChats,
    readOnly: rule?.readOnly ?? settings.readOnly,
  };
}
