import { describe, expect, test } from 'bun:test';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import {
  GOOGLE_APP_CONFIG_KEY,
  googleRedirectUri,
  loadGoogleAppConfig,
  requireGoogleAppConfig,
  saveGoogleAppConfig,
} from './google-app-config.ts';

function memorySecretStore(): SecretStorePort & { dump(): Record<string, string> } {
  const store = new Map<string, string>();
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
    dump: () => Object.fromEntries(store),
  } as SecretStorePort & { dump(): Record<string, string> };
}

describe('google app config', () => {
  test('roundtrips through the secret store under a stable key', async () => {
    const secrets = memorySecretStore();
    await saveGoogleAppConfig(secrets, 'org-1', {
      clientId: ' id ',
      clientSecret: 'sec',
      apiKey: 'key',
      appId: 'app',
    });
    const keys = Object.keys(secrets.dump());
    expect(keys).toEqual([`org-1:${GOOGLE_APP_CONFIG_KEY}`]);
    const loaded = await loadGoogleAppConfig(secrets, 'org-1');
    expect(loaded?.clientId).toBe('id');
    expect(loaded?.apiKey).toBe('key');
  });

  test('saving twice overwrites the same row instead of adding one', async () => {
    const secrets = memorySecretStore();
    await saveGoogleAppConfig(secrets, 'org-1', {
      clientId: 'a',
      clientSecret: 's',
      apiKey: '',
      appId: '',
    });
    await saveGoogleAppConfig(secrets, 'org-1', {
      clientId: 'b',
      clientSecret: 's',
      apiKey: '',
      appId: '',
    });
    expect(Object.keys(secrets.dump())).toHaveLength(1);
    expect((await loadGoogleAppConfig(secrets, 'org-1'))?.clientId).toBe('b');
  });

  test('requireGoogleAppConfig throws a configurable error when absent', async () => {
    const secrets = memorySecretStore();
    await expect(requireGoogleAppConfig(secrets, 'org-1')).rejects.toThrow(
      'Connect your Google Cloud app',
    );
  });
});

describe('google redirect uri', () => {
  test('uses publicUrl when set', () => {
    expect(
      googleRedirectUri({
        harnesys: { publicUrl: 'https://vps.example.com/' },
        server: { port: 47474 },
      }),
    ).toBe('https://vps.example.com/api/integrations/google/callback');
  });

  test('falls back to loopback with the server port', () => {
    expect(googleRedirectUri({ harnesys: { publicUrl: '' }, server: { port: 47474 } })).toBe(
      'http://127.0.0.1:47474/api/integrations/google/callback',
    );
    expect(googleRedirectUri({})).toBe('http://127.0.0.1:47474/api/integrations/google/callback');
  });
});
