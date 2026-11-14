import { type AddonContext, AddonError, isAddonError } from '@harnesys/sdk';
import { type TelegramErrorParameters, telegramError } from './errors.ts';

const API_ROOT = 'https://api.telegram.org';
const CONNECTION = 'telegram-bot';
const TOKEN_KEY = 'botToken';
const TOKEN_PLACEHOLDER = '{token}';

interface TelegramResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  parameters?: TelegramErrorParameters;
}

interface HttpResponse {
  status: number;
  body: string | null;
  bodyBase64?: string;
}

interface FetchAuth {
  connection: string;
  scheme: 'path';
  credentialKey: string;
  placeholder: string;
  accountId?: string;
}

interface FetchRequest {
  url: string;
  method?: 'POST';
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  responseEncoding?: 'text' | 'base64';
  auth?: FetchAuth;
}

export interface MultipartFile {
  field: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface MultipartBody {
  bodyBase64: string;
  contentType: string;
}

export interface MultipartInput {
  fields: Record<string, string>;
  files: MultipartFile[];
}

export interface CallOptions {
  accountId?: string;
}

export interface BotIdentity {
  id: number;
  username?: string;
  first_name?: string;
}

function auth(options?: CallOptions): FetchAuth {
  return {
    connection: CONNECTION,
    scheme: 'path',
    credentialKey: TOKEN_KEY,
    placeholder: TOKEN_PLACEHOLDER,
    ...(options?.accountId === undefined ? {} : { accountId: options.accountId }),
  };
}

function accountHint(error: unknown): Error {
  if (isAddonError(error)) {
    if (error.reason === 'account_failed' && error.detail === 'no bound account') {
      return new AddonError('account_failed', {
        accountCode: 'not_found',
        detail:
          'no Telegram bot account is bound to this add-on; connect a bot on the Telegram tools settings page',
      });
    }
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AddonError('unavailable', {
    retryable: true,
    detail: `telegram request failed: ${message}`,
  });
}

async function fetchTelegram(ctx: AddonContext, params: FetchRequest): Promise<HttpResponse> {
  try {
    return await ctx.http.fetch(params);
  } catch (error) {
    throw accountHint(error);
  }
}

function parseResponse(status: number, body: string | null): TelegramResponse {
  if (body === null || body.length === 0) {
    throw telegramError(status, 'Telegram returned an empty response');
  }
  try {
    return JSON.parse(body) as TelegramResponse;
  } catch {
    throw new AddonError('invalid_response', {
      detail: `telegram returned non-JSON (${status})`,
    });
  }
}

export async function call<T>(
  ctx: AddonContext,
  method: string,
  payload: Record<string, unknown>,
  options?: CallOptions,
): Promise<T> {
  const response = await fetchTelegram(ctx, {
    url: `${API_ROOT}/bot${TOKEN_PLACEHOLDER}/${method}`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    auth: auth(options),
  });
  const parsed = parseResponse(response.status, response.body);
  if (!parsed.ok) {
    throw telegramError(
      parsed.error_code ?? response.status,
      parsed.description ?? method,
      parsed.parameters,
    );
  }
  return parsed.result as T;
}

export function getMe(ctx: AddonContext): Promise<BotIdentity> {
  return call<BotIdentity>(ctx, 'getMe', {});
}

export function buildMultipart(
  fields: Record<string, string>,
  files: MultipartFile[],
): MultipartBody {
  const boundary = `----harnesys${crypto.randomUUID().replaceAll('-', '')}`;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    chunks.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
      ),
    );
    chunks.push(file.bytes);
    chunks.push(encoder.encode('\r\n'));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return {
    bodyBase64: Buffer.from(merged).toString('base64'),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function callMultipart<T>(
  ctx: AddonContext,
  method: string,
  input: MultipartInput,
  options?: CallOptions,
): Promise<T> {
  const body = buildMultipart(input.fields, input.files);
  const response = await fetchTelegram(ctx, {
    url: `${API_ROOT}/bot${TOKEN_PLACEHOLDER}/${method}`,
    method: 'POST',
    headers: { 'content-type': body.contentType },
    bodyBase64: body.bodyBase64,
    auth: auth(options),
  });
  const parsed = parseResponse(response.status, response.body);
  if (!parsed.ok) {
    throw telegramError(
      parsed.error_code ?? response.status,
      parsed.description ?? method,
      parsed.parameters,
    );
  }
  return parsed.result as T;
}

export async function downloadFile(
  ctx: AddonContext,
  filePath: string,
  options?: CallOptions,
): Promise<string> {
  const response = await fetchTelegram(ctx, {
    url: `${API_ROOT}/file/bot${TOKEN_PLACEHOLDER}/${filePath}`,
    responseEncoding: 'base64',
    auth: auth(options),
  });
  if (response.status !== 200 || response.bodyBase64 === undefined) {
    throw telegramError(response.status, `cannot download Telegram file ${filePath}`);
  }
  return response.bodyBase64;
}
