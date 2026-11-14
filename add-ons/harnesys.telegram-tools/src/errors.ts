import type { AddonErrorReason } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';

export interface TelegramErrorParameters {
  retry_after?: number;
  migrate_to_chat_id?: number;
}

export interface TelegramFailure {
  reason: AddonErrorReason;
  retryable: boolean;
  detail: string;
  accountCode?: string;
}

interface DescriptionRule {
  reason: AddonErrorReason;
  match: readonly string[];
  hint: string;
  accountCode?: string;
}

const DESCRIPTION_RULES: readonly DescriptionRule[] = [
  {
    reason: 'not_found',
    match: ['chat not found'],
    hint: 'the bot has never seen this chat; pass a numeric chat id or @username of a chat the bot is a member of',
  },
  {
    reason: 'permission_denied',
    match: ['not enough rights', 'have no rights', 'chat_write_forbidden'],
    hint: 'the bot lacks permission to post in this chat',
  },
  {
    reason: 'permission_denied',
    match: [
      'bot was blocked by the user',
      'bot is not a member',
      'bot was kicked',
      "bot can't initiate conversation",
    ],
    hint: 'the user must unblock the bot or add it to the chat',
    accountCode: 'denied',
  },
  {
    reason: 'conflict',
    match: ['message is not modified'],
    hint: 'the new text matches the current message',
  },
  {
    reason: 'not_found',
    match: [
      'message to edit not found',
      'message to delete not found',
      'message to reply not found',
    ],
    hint: 'messageId is unknown in this chat',
  },
  {
    reason: 'conflict',
    match: ["message can't be edited"],
    hint: 'the message is too old or was sent by another account',
  },
  {
    reason: 'invalid_params',
    match: ['message thread not found'],
    hint: 'topicId must be an existing forum topic id in this chat',
  },
  {
    reason: 'invalid_params',
    match: ["can't parse entities", 'unsupported start tag', "can't find end tag"],
    hint: 'parseMode is set but the text has unescaped markup; escape the text or drop parseMode to send plain text',
  },
  {
    reason: 'invalid_params',
    match: ['wrong file identifier', 'invalid file_id'],
    hint: 'fileId must come from an earlier tool result',
  },
  {
    reason: 'invalid_params',
    match: ['file is too big'],
    hint: 'Telegram serves files up to 20 MB',
  },
];

interface StatusRule {
  reason: AddonErrorReason;
  retryable: boolean;
}

function statusRule(status: number): StatusRule {
  if (status === 401) {
    return { reason: 'account_failed', retryable: false };
  }
  if (status === 403) {
    return { reason: 'permission_denied', retryable: false };
  }
  if (status === 409) {
    return { reason: 'conflict', retryable: false };
  }
  if (status === 404) {
    return { reason: 'not_found', retryable: false };
  }
  if (status === 429) {
    return { reason: 'rate_limited', retryable: true };
  }
  if (status >= 500) {
    return { reason: 'unavailable', retryable: true };
  }
  return { reason: 'invalid_params', retryable: false };
}

export function classifyTelegramError(
  status: number,
  description: string,
  parameters?: TelegramErrorParameters,
): TelegramFailure {
  const text = description.trim().length > 0 ? description.trim() : `HTTP ${status}`;
  const lowered = text.toLowerCase();
  const rule = DESCRIPTION_RULES.find((entry) =>
    entry.match.some((needle) => lowered.includes(needle)),
  );
  const base = statusRule(status);
  const migrated = parameters?.migrate_to_chat_id;
  const reason: AddonErrorReason =
    migrated === undefined ? (rule?.reason ?? base.reason) : 'not_found';
  const hints: string[] = [];
  if (rule !== undefined) {
    hints.push(rule.hint);
  }
  if (migrated !== undefined) {
    hints.push(`the chat migrated to supergroup ${migrated}; use that id`);
  }
  if (status === 429 && parameters?.retry_after !== undefined) {
    hints.push(`retry after ${parameters.retry_after}s`);
  }
  const accountCode = rule?.accountCode ?? (status === 401 ? 'invalid_credentials' : undefined);
  return {
    reason,
    retryable: base.retryable,
    detail: `telegram ${status} ${reason}: ${text}${hints.length === 0 ? '' : ` (${hints.join('; ')})`}`,
    ...(accountCode === undefined ? {} : { accountCode }),
  };
}

export function telegramError(
  status: number,
  description: string,
  parameters?: TelegramErrorParameters,
): AddonError {
  const failure = classifyTelegramError(status, description, parameters);
  return new AddonError(failure.reason, {
    retryable: failure.retryable,
    detail: failure.detail,
    ...(failure.accountCode === undefined ? {} : { accountCode: failure.accountCode }),
  });
}
