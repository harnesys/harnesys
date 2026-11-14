import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  ProviderHttp,
  WebhookCtx,
} from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';
import { defineProvider } from '../_kit/define.ts';
import { directConnect } from '../_kit/direct-connect.ts';
import { requireHttp } from '../_kit/http-classify.ts';
import { secureCompare } from '../_kit/signature.ts';
import { telegramAppKind, telegramUserKind } from './mtproto-kind.ts';

const PROVIDER_ID = 'telegram';
const API = 'https://api.telegram.org';

const accountKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-bot`,
    provider: PROVIDER_ID,
    label: 'Telegram Bot',
    description:
      'Bot token plus the secret token Telegram sends with every webhook. Identity is the bot from getMe.',
    requiresApp: [],
    inputs: [
      {
        key: 'botToken',
        label: 'Bot token',
        type: 'secret',
        required: true,
        help: 'Issued by @BotFather.',
        placeholder: '123456:ABC-DEF…',
      },
      {
        key: 'secretToken',
        label: 'Webhook secret token',
        type: 'secret',
        required: true,
        generated: true,
        help: 'Generated here and sent to Telegram when the webhook is registered.',
      },
    ],
    scopes: { options: [], defaults: [] },
    access: { source: 'stored', keys: ['botToken', 'secretToken'] },
    endpoints: ['webhookUrl'],
  },
  secrets: ['botToken', 'secretToken'],
  egress: { hosts: ['api.telegram.org'] },
  connect: directConnect(async (ctx): Promise<AccountConnectResult> => {
    const botToken = String(ctx.inputs.botToken ?? '');
    const secretToken = String(ctx.inputs.secretToken ?? '');
    if (!botToken || !secretToken) {
      throw new ProviderError('invalid_input');
    }
    const bot = await getMe(ctx.http, botToken);
    return {
      externalAccountId: bot.id,
      label: bot.username ? `@${bot.username}` : bot.name,
      scopes: [],
      secrets: { botToken, secretToken },
      expiresAt: null,
      metadata: { username: bot.username },
    };
  }),
  async verify(ctx) {
    const bot = await getMe(ctx.http, ctx.credentials.botToken ?? '');
    return {
      identity: { externalAccountId: bot.id, label: bot.username ? `@${bot.username}` : bot.name },
      metadata: { username: bot.username },
    };
  },
  webhook: {
    async handle(ctx: WebhookCtx) {
      const secretToken = await ctx.secrets.require('secretToken');
      const supplied = header(ctx.request.headers, 'x-telegram-bot-api-secret-token') ?? '';
      if (!secureCompare(secretToken, supplied)) {
        throw new ProviderError('invalid_signature');
      }
      const parsed = parseBody(ctx.request.body);
      const updateId = parsed && typeof parsed.update_id === 'number' ? parsed.update_id : null;
      return {
        response: { status: 200 },
        events:
          updateId === null
            ? []
            : [
                {
                  type: 'telegram.update',
                  deliveryId: String(updateId),
                  occurredAt: ctx.now(),
                  payload: parsed as JsonObject,
                },
              ],
      };
    },
  },
  validateMetadata: (raw) => pick(raw, ['username']),
};

interface TelegramBot {
  id: string;
  username: string;
  name: string;
}

async function getMe(http: ProviderHttp, botToken: string): Promise<TelegramBot> {
  const outcome = requireHttp(
    await http.send({
      method: 'GET',
      url: `${API}/bot${botToken}/getMe`,
    }),
  );
  if (outcome.status === 401 || outcome.status === 404) {
    throw new ProviderError('invalid_credentials');
  }
  if (outcome.status < 200 || outcome.status >= 300 || !outcome.json) {
    throw new ProviderError('invalid_response');
  }
  const record = outcome.json as { ok?: unknown; result?: Record<string, unknown> };
  if (record.ok !== true || !record.result || typeof record.result.id !== 'number') {
    throw new ProviderError('invalid_response');
  }
  return {
    id: String(record.result.id),
    username: typeof record.result.username === 'string' ? record.result.username : '',
    name: typeof record.result.first_name === 'string' ? record.result.first_name : 'Telegram bot',
  };
}

function header(headers: Record<string, string>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return null;
}

function parseBody(body: Uint8Array): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pick(raw: JsonObject, keys: string[]): JsonObject {
  const output: JsonObject = {};
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}

export const telegramProvider = defineProvider({
  descriptor: {
    id: PROVIDER_ID,
    label: 'Telegram',
    description: 'Telegram bots with webhooks and user accounts connected by phone login.',
    iconSvg: null,
    docsUrl: 'https://core.telegram.org/bots/api',
  },
  appKinds: [telegramAppKind],
  accountKinds: [accountKind, telegramUserKind],
});
