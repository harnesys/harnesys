import { describe, expect, test } from 'bun:test';
import { type FetchLike, InstallationTokenStore } from './installation-token.ts';

const FIXED_NOW = 1_700_000_000_000;

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function fetchSequence(responses: Array<{ status: number; body: Record<string, unknown> }>): {
  fetchImpl: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(response?.body ?? {}), { status: response?.status ?? 500 });
  };
  return { fetchImpl, calls };
}

describe('InstallationTokenStore', () => {
  test('returns cached token while valid and refreshes after expiry minus skew', async () => {
    const first = fetchSequence([
      {
        status: 201,
        body: {
          token: 'token-1',
          expires_at: new Date(FIXED_NOW + 10 * 60_000).toISOString(),
          permissions: { contents: 'read' },
        },
      },
      {
        status: 201,
        body: {
          token: 'token-2',
          expires_at: new Date(FIXED_NOW + 10 * 60_000).toISOString(),
          permissions: { contents: 'write' },
        },
      },
    ]);
    const store = new InstallationTokenStore({
      fetchImpl: first.fetchImpl,
      clock: () => FIXED_NOW,
    });
    const request = { integrationId: 'int-1', installationId: 42, jwt: 'jwt-1' };

    const cached = await store.get(request);
    expect(cached.token).toBe('token-1');
    const again = await store.get(request);
    expect(again.token).toBe('token-1');
    expect(first.calls).toHaveLength(1);
    const firstCall = first.calls[0];
    expect(firstCall?.url).toBe('https://api.github.com/app/installations/42/access_tokens');
    const firstHeaders = (firstCall?.init?.headers ?? {}) as Record<string, string>;
    expect(firstHeaders.Authorization).toBe('Bearer jwt-1');

    const nearExpiry = new InstallationTokenStore({
      fetchImpl: first.fetchImpl,
      clock: () => FIXED_NOW + 10 * 60_000 - 30_000,
    });
    const refreshed = await nearExpiry.get(request);
    expect(refreshed.token).toBe('token-2');
    expect(first.calls).toHaveLength(2);
  });

  test('caps cached lifetime at five minutes', async () => {
    const calls = fetchSequence([
      {
        status: 201,
        body: {
          token: 'token-long',
          expires_at: new Date(FIXED_NOW + 60 * 60_000).toISOString(),
          permissions: { contents: 'read' },
        },
      },
      {
        status: 201,
        body: {
          token: 'token-fresh',
          expires_at: new Date(FIXED_NOW + 60 * 60_000).toISOString(),
          permissions: { contents: 'write' },
        },
      },
    ]);
    const store = new InstallationTokenStore({
      fetchImpl: calls.fetchImpl,
      clock: () => FIXED_NOW,
    });
    const request = { integrationId: 'int-1', installationId: 42, jwt: 'jwt-1' };
    await store.get(request);
    const later = new InstallationTokenStore({
      fetchImpl: calls.fetchImpl,
      clock: () => FIXED_NOW + 5 * 60_000 + 1,
    });
    const refreshed = await later.get(request);
    expect(refreshed.token).toBe('token-fresh');
    expect(calls.calls).toHaveLength(2);
  });

  test('caches per integration id and invalidates on demand', async () => {
    const calls = fetchSequence([
      {
        status: 201,
        body: {
          token: 'token-a',
          expires_at: new Date(FIXED_NOW + 10 * 60_000).toISOString(),
          permissions: {},
        },
      },
      {
        status: 201,
        body: {
          token: 'token-b',
          expires_at: new Date(FIXED_NOW + 10 * 60_000).toISOString(),
          permissions: {},
        },
      },
    ]);
    const store = new InstallationTokenStore({
      fetchImpl: calls.fetchImpl,
      clock: () => FIXED_NOW,
    });
    const one = await store.get({ integrationId: 'int-a', installationId: 1, jwt: 'jwt' });
    const two = await store.get({ integrationId: 'int-b', installationId: 2, jwt: 'jwt' });
    expect(one.token).toBe('token-a');
    expect(two.token).toBe('token-b');
    expect(calls.calls).toHaveLength(2);

    store.invalidate('int-a');
    const reFetched = await store.get({ integrationId: 'int-a', installationId: 1, jwt: 'jwt' });
    expect(reFetched.token).toBe('token-b');
    expect(calls.calls).toHaveLength(3);
  });
});
