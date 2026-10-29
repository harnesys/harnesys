import { describe, expect, test } from 'bun:test';
import type { GithubAppConfig } from '../../../../config.schema.ts';
import { resolveGithubAppSettings } from './github-app-config.ts';

const registered = {
  appId: '111',
  privateKey: 'registered-key',
  webhookSecret: 'whsec',
  appSlug: 'harnesys',
  clientId: 'Iv1.reg',
  clientSecret: 'reg-secret',
  registeredAt: '2026-10-26T00:00:00Z',
};

function envConfig(overrides: Partial<GithubAppConfig> = {}): GithubAppConfig {
  return {
    appId: '',
    privateKey: '',
    clientId: '',
    clientSecret: '',
    webhookSecret: '',
    appSlug: '',
    ...overrides,
  };
}

describe('resolveGithubAppSettings', () => {
  test('registered app is used when env config is empty', () => {
    const resolved = resolveGithubAppSettings(envConfig(), registered);
    expect(resolved?.appId).toBe('111');
    expect(resolved?.appSlug).toBe('harnesys');
  });

  test('env config wins over registered app', () => {
    const resolved = resolveGithubAppSettings(
      envConfig({ appId: '222', privateKey: 'env-key', appSlug: 'custom' }),
      registered,
    );
    expect(resolved?.appId).toBe('222');
    expect(resolved?.appSlug).toBe('custom');
  });

  test('partial env config falls back to registered app', () => {
    const resolved = resolveGithubAppSettings(envConfig({ appId: '222' }), registered);
    expect(resolved?.appId).toBe('111');
  });

  test('returns null when nothing is configured', () => {
    expect(resolveGithubAppSettings(envConfig(), null)).toBeNull();
  });
});
