import { type AddonContext, AddonError } from '@harnesys/sdk';

const API_ROOT = 'https://api.telegram.org';
const CONNECTION = 'telegram-bot';
const TOKEN_KEY = 'botToken';
const TOKEN_PLACEHOLDER = '{token}';

interface TelegramResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
}

interface MultipartFile {
  field: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface MultipartBody {
  bodyBase64: string;
  contentType: string;
}

export interface BotIdentity {
  id: number;
  username?: string;
  first_name?: string;
}

function auth(): {
  connection: string;
  scheme: 'path';
  credentialKey: string;
  placeholder: string;
} {
  return {
    connection: CONNECTION,
    scheme: 'path',
    credentialKey: TOKEN_KEY,
    placeholder: TOKEN_PLACEHOLDER,
  };
}

function failure(status: number, description: string): AddonError {
  if (status === 429) {
    return new AddonError('rate_limited', { retryable: true, detail: description });
  }
  if (status === 401 || status === 403) {
    return new AddonError('account_failed', { detail: description });
  }
  if (status === 409) {
    return new AddonError('conflict', { detail: description });
  }
  if (status === 400) {
    return new AddonError('invalid_params', { detail: description });
  }
  if (status === 404) {
    return new AddonError('not_found', { detail: description });
  }
  return new AddonError('unavailable', { retryable: status >= 500, detail: description });
}

function parseResponse(status: number, body: string | null): TelegramResponse {
  if (body === null || body.length === 0) {
    throw failure(status, `Telegram returned an empty response (${status})`);
  }
  try {
    return JSON.parse(body) as TelegramResponse;
  } catch {
    throw new AddonError('invalid_response', { detail: `Telegram returned non-JSON (${status})` });
  }
}

export async function call<T>(
  ctx: AddonContext,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await ctx.http.fetch({
    url: `${API_ROOT}/bot${TOKEN_PLACEHOLDER}/${method}`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    auth: auth(),
  });
  const parsed = parseResponse(response.status, response.body);
  if (!parsed.ok) {
    throw failure(parsed.error_code ?? response.status, parsed.description ?? method);
  }
  return parsed.result as T;
}

export function getMe(ctx: AddonContext): Promise<BotIdentity> {
  return call<BotIdentity>(ctx, 'getMe', {});
}

export async function deleteWebhook(ctx: AddonContext, dropPendingUpdates: boolean): Promise<void> {
  await call<boolean>(ctx, 'deleteWebhook', { drop_pending_updates: dropPendingUpdates });
}

export async function setMyCommands(
  ctx: AddonContext,
  commands: Array<{ command: string; description: string }>,
): Promise<void> {
  await call<boolean>(ctx, 'setMyCommands', { commands });
}

export function buildMultipart(fields: Record<string, string>, file: MultipartFile): MultipartBody {
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
  chunks.push(
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
  );
  chunks.push(file.bytes);
  chunks.push(encoder.encode(`\r\n--${boundary}--\r\n`));
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
  fields: Record<string, string>,
  file: MultipartFile,
): Promise<T> {
  const body = buildMultipart(fields, file);
  const response = await ctx.http.fetch({
    url: `${API_ROOT}/bot${TOKEN_PLACEHOLDER}/${method}`,
    method: 'POST',
    headers: { 'content-type': body.contentType },
    bodyBase64: body.bodyBase64,
    auth: auth(),
  });
  const parsed = parseResponse(response.status, response.body);
  if (!parsed.ok) {
    throw failure(parsed.error_code ?? response.status, parsed.description ?? method);
  }
  return parsed.result as T;
}

export async function downloadFile(ctx: AddonContext, filePath: string): Promise<string> {
  const response = await ctx.http.fetch({
    url: `${API_ROOT}/file/bot${TOKEN_PLACEHOLDER}/${filePath}`,
    responseEncoding: 'base64',
    auth: auth(),
  });
  if (response.status !== 200 || response.bodyBase64 === undefined) {
    throw failure(response.status, `cannot download Telegram file ${filePath}`);
  }
  return response.bodyBase64;
}
