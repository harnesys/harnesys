import { describe, expect, test } from 'bun:test';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { type GoogleOAuthClientConfig, type GoogleTokenSet } from './google-oauth-device.ts';
import {
  getValidGoogleAccessToken,
  loadGoogleTokens,
  saveGoogleTokens,
} from './google-token-access.ts';

const ORG = 'org-1';
const CRED = 'cred-1';

function memorySecretStore(initial: Record<string, string> = {}): SecretStorePort {
  const store = new Map(Object.entries(initial));
  return {
    get: async (orgId: string, key: string) => store.get(`${orgId}:${key}`) ?? null,
    set: async (orgId: string, key: string, value: string) => {
      store.set(`${orgId}:${key}`, value);
    },
    delete: async (orgId: string, key: string) => {
      store.delete(`${orgId}:${key}`);
    },
    listKeys: async (orgId: string) =>
      [...store.keys()]
        .filter((k) => k.startsWith(`${orgId}:`))
        .map((k) => k.slice(orgId.length + 1)),
  } as SecretStorePort;
}

const tokens: GoogleTokenSet = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  expiresAt: Date.now() + 3_600_000,
  scope: 'https://www.googleapis.com/auth/calendar',
  tokenType: 'Bearer',
};

describe('google-token-access', () => {
  test('token set roundtrips through the secret store', async () => {
    const secrets = memorySecretStore();
    await saveGoogleTokens(secrets, ORG, CRED, tokens);
    const loaded = await loadGoogleTokens(secrets, ORG, CRED);
    expect(loaded?.accessToken).toBe('at-1');
    expect(loaded?.refreshToken).toBe('rt-1');
    expect(loaded?.scope).toContain('calendar');
  });

  test('legacy rows with clientKind still load', async () => {
    const secrets = memorySecretStore({
      [`${ORG}:cloud:google:${CRED}`]: JSON.stringify({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: 1,
        tokenType: 'Bearer',
        clientKind: 'desktop',
      }),
    });
    const loaded = await loadGoogleTokens(secrets, ORG, CRED);
    expect(loaded?.accessToken).toBe('at');
  });

  test('refreshed tokens keep the existing refresh token when Google returns none', async () => {
    const secrets = memorySecretStore();
    await saveGoogleTokens(secrets, ORG, CRED, { ...tokens, expiresAt: Date.now() - 1 });
    const calls: string[] = [];
    const fakeRefresh = async (
      _config: GoogleOAuthClientConfig,
      refreshToken: string,
    ): Promise<GoogleTokenSet> => {
      calls.push(refreshToken);
      return {
        accessToken: 'at-2',
        refreshToken: '',
        expiresAt: Date.now() + 3_600_000,
        tokenType: 'Bearer',
      };
    };
    const accessToken = await getValidGoogleAccessToken(
      secrets,
      ORG,
      CRED,
      { clientId: 'id', clientSecret: 'secret' },
      fakeRefresh,
    );
    expect(accessToken).toBe('at-2');
    expect(calls).toEqual(['rt-1']);
    const stored = JSON.parse((await secrets.get(ORG, `cloud:google:${CRED}`)) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(stored.refreshToken).toBe('rt-1');
  });
});
