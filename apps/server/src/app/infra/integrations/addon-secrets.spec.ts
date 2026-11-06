import { expect, test } from 'bun:test';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { addonSecretPrefix, createAddonSecrets } from './addon-secrets.ts';

class FakeSecretStore extends SecretStorePort {
  readonly rows = new Map<string, string>();

  override async get(orgId: string, key: string): Promise<string | null> {
    return this.rows.get(`${orgId}\n${key}`) ?? null;
  }

  override async set(orgId: string, key: string, value: string): Promise<void> {
    this.rows.set(`${orgId}\n${key}`, value);
  }

  override async delete(orgId: string, key: string): Promise<void> {
    this.rows.delete(`${orgId}\n${key}`);
  }

  override async listKeys(orgId: string): Promise<string[]> {
    return [...this.rows.keys()]
      .filter((rowKey) => rowKey.startsWith(`${orgId}\n`))
      .map((rowKey) => rowKey.slice(orgId.length + 1));
  }
}

test('addon secrets roundtrip stores keys under the integration prefix', async () => {
  const store = new FakeSecretStore();
  const secrets = createAddonSecrets(store, 'org-1', 'telegram');
  await secrets.set('bot_token', 'secret-value');
  expect(store.rows.get('org-1\nintegration:telegram:bot_token')).toBe('secret-value');
  expect(await secrets.get('bot_token')).toBe('secret-value');
  expect(addonSecretPrefix('telegram')).toBe('integration:telegram:');
});

test('addon secrets lists keys without the prefix and isolates other namespaces', async () => {
  const store = new FakeSecretStore();
  const telegram = createAddonSecrets(store, 'org-1', 'telegram');
  const google = createAddonSecrets(store, 'org-1', 'google');
  await telegram.set('bot_token', 'a');
  await telegram.set('session', 'b');
  await google.set('oauth', 'c');
  await store.set('org-1', 'plain_key', 'd');
  expect((await telegram.keys()).sort()).toEqual(['bot_token', 'session']);
  expect(await google.keys()).toEqual(['oauth']);
  await telegram.delete('bot_token');
  expect(await telegram.get('bot_token')).toBeNull();
  expect(await store.get('org-1', 'integration:telegram:session')).toBe('b');
});
