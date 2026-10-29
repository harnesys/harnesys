import { describe, expect, test } from 'bun:test';
import { normalizeLegacyWebPack } from './pack-aliases.ts';

describe('normalizeLegacyWebPack', () => {
  test('merges legacy fetch and web_search specs into web', () => {
    const next = normalizeLegacyWebPack({
      core: true,
      fetch: { spec: { timeout_ms: 100 } },
      web_search: { spec: { provider: 'searxng', maxResults: 3 } },
      shell: true,
    });
    expect('fetch' in next).toBe(false);
    expect('web_search' in next).toBe(false);
    expect(next.shell).toBe(true);
    expect(next.web).toEqual({
      spec: { timeout_ms: 100, provider: 'searxng', maxResults: 3 },
    });
  });

  test('explicit web spec wins over legacy aliases and keeps unrelated packs', () => {
    const next = normalizeLegacyWebPack({
      web_search: { spec: { provider: 'duckduckgo' } },
      web: { spec: { provider: 'searxng', engine: 'obscura' } },
      files: { spec: { root: '/tmp' } },
    });
    expect(next.web).toEqual({
      spec: { provider: 'searxng', engine: 'obscura' },
    });
    expect(next.files).toEqual({ spec: { root: '/tmp' } });
  });

  test('legacy boolean assignment becomes web true; untouched config is returned as is', () => {
    expect(normalizeLegacyWebPack({ fetch: true })).toEqual({ web: true });
    const plain = { core: true, shell: { spec: { timeout: 5 } } };
    expect(normalizeLegacyWebPack(plain)).toBe(plain);
  });
});
