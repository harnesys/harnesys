import { IntegrationProviderErrorException } from '../../../domain/integration/integration.error.ts';

const EXCERPT_LIMIT = 300;

export interface GoogleApiCall {
  token: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: URLSearchParams;
  body?: unknown;
}

export async function googleApiJson<T>(call: GoogleApiCall): Promise<T> {
  const url = new URL(`https://www.googleapis.com${call.path}`);
  if (call.query) {
    for (const [key, value] of call.query) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, {
    method: call.method,
    headers: {
      Authorization: `Bearer ${call.token}`,
      ...(call.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
  });
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'google',
      `${call.method} ${call.path} failed: ${res.status} ${excerptOf(await res.text())}`,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function excerptOf(text: string): string {
  return text.slice(0, EXCERPT_LIMIT);
}

export function asGoogleRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}
