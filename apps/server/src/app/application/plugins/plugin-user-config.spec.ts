import { describe, expect, test } from 'bun:test';
import type { PluginComponent, PluginIr } from 'harnesys';
import { MASKED_OPTION } from './plugin-options.ts';
import { pluginSecretKey, pluginUserConfig, withStoredSecrets } from './plugin-user-config.ts';

function option(key: string, extra: Record<string, unknown> = {}): PluginComponent {
  return {
    kind: 'config-option',
    spec: {
      key,
      type: 'string',
      title: key,
      description: `${key} option`,
      ...extra,
    },
    source: { file: 'plugin.json', pointer: `/options/${key}` },
    status: 'native',
  };
}

function irOf(components: PluginComponent[]): PluginIr {
  return {
    identity: { name: 'demo' },
    sourceFormat: 'claude-compat',
    components,
    grants: { needsProcess: false, needsNetwork: false },
    diagnostics: [],
  };
}

describe('pluginUserConfig', () => {
  test('defaults fill values; sensitive keys are excluded and reported', () => {
    const ir = irOf([
      option('region', { default: 'eu' }),
      option('token', { sensitive: true, default: 's3cret' }),
    ]);
    const config = pluginUserConfig(ir, {});
    expect(config.values).toEqual({ region: 'eu' });
    expect([...config.sensitiveKeys]).toEqual(['token']);
  });

  test('stored value wins; MASKED_OPTION falls back to default', () => {
    const ir = irOf([option('region', { default: 'eu' })]);
    const config = pluginUserConfig(ir, { region: MASKED_OPTION });
    expect(config.values).toEqual({ region: 'eu' });
    expect(pluginUserConfig(ir, { region: 'us' }).values).toEqual({ region: 'us' });
  });
});

describe('withStoredSecrets', () => {
  test('reads back stored secrets for sensitive keys', async () => {
    const ir = irOf([option('token', { sensitive: true })]);
    const base = pluginUserConfig(ir, {});
    const config = await withStoredSecrets(
      {
        get: (_orgId, key) =>
          Promise.resolve(key === pluginSecretKey('demo', 'token') ? 'real' : null),
      },
      'org-1',
      ir,
      base,
    );
    expect(config.values.token).toBe('real');
  });
});
