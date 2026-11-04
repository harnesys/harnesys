import {
  TelegramBlockedError,
  type TelegramSentMessage,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';

export const API_ROOT = 'https://api.telegram.org';

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

export async function callJson(
  token: string,
  method: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return readOk(response);
}

export async function callForm(token: string, method: string, form: FormData): Promise<unknown> {
  const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
    method: 'POST',
    body: form,
  });
  return readOk(response);
}

async function readOk(response: Response): Promise<unknown> {
  const payload = (await response.json()) as TelegramApiResponse;
  if (response.status === 401 || payload.error_code === 401) {
    throw new TelegramUnauthorizedError();
  }
  const description = payload.description ?? '';
  if (
    (response.status === 403 || payload.error_code === 403) &&
    description.toLowerCase().includes('blocked')
  ) {
    throw new TelegramBlockedError();
  }
  if (!payload.ok) {
    const error = new Error(
      description || `Telegram API error ${payload.error_code ?? response.status}`,
    );
    Object.assign(error, {
      statusCode: payload.error_code ?? response.status,
      description,
    });
    throw error;
  }
  return payload.result;
}

export function isMemberLookupMiss(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 400 || statusCode === 403 || statusCode === 404;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function messageIdOf(result: unknown): TelegramSentMessage {
  const message = asRecord(result);
  const messageId = message?.message_id;
  if (typeof messageId !== 'number' && typeof messageId !== 'string') {
    throw new Error('Telegram response missing message_id');
  }
  return { messageId: String(messageId) };
}
