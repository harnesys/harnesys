import { describe, expect, test } from 'bun:test';
import {
  detectOsArch,
  ENGINE_CATALOG,
  type EngineSpec,
  engineArchiveUrl,
  engineSpecOf,
  engineTargets,
  expectedSha256,
  OS_ARCHES,
} from './engine-catalog.ts';

function catalogEngine(id: string): EngineSpec {
  const spec = engineSpecOf(id);
  if (spec === undefined) {
    throw new Error(`engine ${id} missing from catalog`);
  }
  return spec;
}

describe('engine catalog', () => {
  test('every engine pins sha256 for all supported os/arch targets', () => {
    for (const engine of ENGINE_CATALOG) {
      if (engine.install === undefined) {
        continue;
      }
      for (const target of engineTargets(engine)) {
        expect(engine.install.sha256[target]).toMatch(/^[0-9a-f]{64}$/);
      }
      if (engine.stealthBuild === true) {
        expect(engine.install.stealthSha256).toBeDefined();
        for (const target of engineTargets(engine)) {
          expect(engine.install.stealthSha256?.[target]).toMatch(/^[0-9a-f]{64}$/);
        }
      }
    }
  });

  test('url templates substitute os and arch', () => {
    const obscura = catalogEngine('obscura');
    expect(engineArchiveUrl(obscura, 'macos-aarch64')).toBe(
      'https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.4/obscura-aarch64-macos.tar.gz',
    );
    const lightpanda = catalogEngine('lightpanda');
    expect(engineArchiveUrl(lightpanda, 'linux-x86_64')).toBe(
      'https://github.com/lightpanda-io/browser/releases/download/1.0.1/lightpanda-x86_64-linux',
    );
  });

  test('stealth hash is selected only for stealth builds; detection maps to supported target', () => {
    const obscura = catalogEngine('obscura');
    const stealthHash = obscura.install?.stealthSha256?.['macos-x86_64'] ?? '';
    expect(expectedSha256(obscura, 'macos-x86_64', true)).toBe(stealthHash);
    expect(expectedSha256(obscura, 'macos-x86_64', false)).toBe(
      obscura.install?.sha256['macos-x86_64'] ?? '',
    );
    expect(OS_ARCHES).toContain(detectOsArch());
  });
});
