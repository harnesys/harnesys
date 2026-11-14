import { describe, expect, test } from 'bun:test';
import {
  FakeAudit,
  FakeEvents,
  FakeSecrets,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { SetConfigUseCase } from './set-config.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function build() {
  const { pkg } = testManifest({
    contributions: [
      {
        id: 'settings',
        family: 'config',
        descriptor: {
          fields: [
            { key: 'token', label: 'Token', type: 'secret', required: true },
            { key: 'region', label: 'Region', type: 'text', required: false },
          ],
        },
      },
    ],
  });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  orgAddons.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled: true,
    grantsJson: '[]',
    grantsDigest: 'd',
    configJson: '{}',
    health: 'stopped',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  const secrets = new FakeSecrets();
  const events = new FakeEvents();
  const setConfig = new SetConfigUseCase(
    catalog,
    orgAddons,
    secrets,
    events,
    new FakeAudit(),
    new NullLogger(),
  );
  return { setConfig, orgAddons, secrets, events };
}

describe('SetConfigUseCase', () => {
  test('splits secret values into SecretStorePort and keeps nonsensitive in config_json', async () => {
    const { setConfig, orgAddons, secrets } = build();
    await setConfig.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      values: { token: 's3cret', region: 'eu' },
      actor: ACTOR,
    });
    expect(await secrets.get('org1', 'addon:org1:acme.tool:token')).toBe('s3cret');
    const config = JSON.parse(orgAddons.find('org1', 'acme.tool')?.configJson ?? '{}');
    expect(config).toEqual({ region: 'eu' });
  });

  test('publishes config.changed without restart', async () => {
    const { setConfig, events } = build();
    await setConfig.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      values: { region: 'us' },
      actor: ACTOR,
    });
    expect(events.published.map((entry) => entry.name)).toEqual(['config.changed']);
  });
});
