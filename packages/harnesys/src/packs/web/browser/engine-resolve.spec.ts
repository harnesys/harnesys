import { describe, expect, test } from 'bun:test';
import { type HostEngineEntry, resolveBrowserEngine } from './engine-resolve.ts';

const host: HostEngineEntry[] = [
  { engineId: 'obscura', installed: true, enabled: true },
  { engineId: 'lightpanda', installed: true, enabled: true },
];

describe('resolveBrowserEngine', () => {
  test('override wins and errors when missing, without fallback', () => {
    expect(
      resolveBrowserEngine({ override: 'lightpanda', orgDefault: 'obscura', hostEngines: host }),
    ).toEqual({
      status: 'ok',
      engineId: 'lightpanda',
    });
    expect(
      resolveBrowserEngine({
        override: 'lightpanda',
        orgDefault: 'obscura',
        hostEngines: [{ engineId: 'obscura', installed: true, enabled: true }],
      }),
    ).toEqual({ status: 'missing', engineId: 'lightpanda' });
  });

  test('org default applies when no override, falls back to auto when absent on host', () => {
    expect(resolveBrowserEngine({ orgDefault: 'obscura', hostEngines: host })).toEqual({
      status: 'ok',
      engineId: 'obscura',
    });
    expect(
      resolveBrowserEngine({
        orgDefault: 'obscura',
        hostEngines: [{ engineId: 'lightpanda', installed: true, enabled: true }],
      }),
    ).toEqual({ status: 'ok', engineId: 'lightpanda' });
  });

  test('auto picks first enabled installed engine in allowlist order', () => {
    expect(resolveBrowserEngine({ hostEngines: host })).toEqual({
      status: 'ok',
      engineId: 'obscura',
    });
    const disabledFirst: HostEngineEntry[] = [
      { engineId: 'obscura', installed: true, enabled: false },
      { engineId: 'lightpanda', installed: true, enabled: true },
    ];
    expect(resolveBrowserEngine({ hostEngines: disabledFirst })).toEqual({
      status: 'ok',
      engineId: 'lightpanda',
    });
  });

  test('nothing usable resolves to none; unknown ids and broken installs are skipped', () => {
    expect(resolveBrowserEngine({ hostEngines: [] })).toEqual({ status: 'none' });
    expect(
      resolveBrowserEngine({
        hostEngines: [
          { engineId: 'obscura', installed: false, enabled: true },
          { engineId: 'safari', installed: true, enabled: true },
        ],
      }),
    ).toEqual({ status: 'none' });
    expect(resolveBrowserEngine({ override: 'nope', hostEngines: host })).toEqual({
      status: 'missing',
      engineId: 'nope',
    });
  });
});
