import { describe, expect, test } from 'bun:test';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { AddonSecretService, addonSecretKey } from './addon-secret.service.ts';

class FakeSecretStore extends SecretStorePort {
  readonly store = new Map<string, string>();

  override async get(orgId: string, key: string): Promise<string | null> {
    return this.store.get(`${orgId}|${key}`) ?? null;
  }

  override async set(orgId: string, key: string, value: string): Promise<void> {
    this.store.set(`${orgId}|${key}`, value);
  }

  override async delete(orgId: string, key: string): Promise<void> {
    this.store.delete(`${orgId}|${key}`);
  }

  override async listKeys(orgId: string): Promise<string[]> {
    return [...this.store.keys()]
      .filter((fullKey) => fullKey.startsWith(`${orgId}|`))
      .map((fullKey) => fullKey.slice(orgId.length + 1));
  }
}

describe('AddonSecretService', () => {
  test('round-trips under the addon:<orgId>:<addonId>:<key> namespace', async () => {
    const secrets = new FakeSecretStore();
    const service = new AddonSecretService(secrets);
    await service.set('org-1', 'harnesys.test-addon', 'token', 's3cret');
    expect(secrets.store.has('org-1|addon:org-1:harnesys.test-addon:token')).toBe(true);
    expect(await service.get('org-1', 'harnesys.test-addon', 'token')).toBe('s3cret');
    expect(await service.get('org-1', 'harnesys.other-addon', 'token')).toBeNull();
  });

  test('keys lists only the addon namespace and delete removes', async () => {
    const secrets = new FakeSecretStore();
    const service = new AddonSecretService(secrets);
    await service.set('org-1', 'harnesys.test-addon', 'b', '2');
    await service.set('org-1', 'harnesys.test-addon', 'a', '1');
    await service.set('org-1', 'harnesys.other-addon', 'x', '9');
    await secrets.set('org-1', 'llm.provider.key', 'unrelated');
    expect(await service.keys('org-1', 'harnesys.test-addon')).toEqual(['a', 'b']);
    await service.delete('org-1', 'harnesys.test-addon', 'a');
    expect(await service.get('org-1', 'harnesys.test-addon', 'a')).toBeNull();
    expect(addonSecretKey('org-1', 'a', 'k')).toBe('addon:org-1:a:k');
  });
});
