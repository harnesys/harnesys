import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { addonExtractDir } from './addon-paths.ts';
import { extractZipArchive, unwrapArchiveRoot } from './archive-extract.ts';
import { ArchiveAddonSourceAdapter } from './archive-source.adapter.ts';
import { FakeLayout } from './fake-layout.ts';
import { VALID_MANIFEST } from './manifest-fixtures.ts';

const home = mkdtempSync(join(tmpdir(), 'archive-extract-'));

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function zipOf(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = new TextEncoder().encode(content);
  }
  return zipSync(entries);
}

const ALL_LIMITS = { maxEntries: 5000, maxDecompressedBytes: 128 * 1024 * 1024 };
const noop = () => {};

describe('extractZipArchive', () => {
  test('rejects zip-slip entry paths (absolute and .. traversal)', () => {
    expect(() => extractZipArchive(zipOf({ '../evil.txt': 'x' }), noop, ALL_LIMITS)).toThrow(
      /unsafe archive entry/,
    );
    expect(() => extractZipArchive(zipOf({ '/etc/passwd': 'x' }), noop, ALL_LIMITS)).toThrow(
      /unsafe archive entry/,
    );
    expect(() => extractZipArchive(zipOf({ 'a/../../evil.txt': 'x' }), noop, ALL_LIMITS)).toThrow(
      /unsafe archive entry/,
    );
  });

  test('enforces the entry-count and decompressed-size caps', () => {
    const many = zipOf({ 'a.txt': 'x', 'b.txt': 'x', 'c.txt': 'x' });
    expect(() => extractZipArchive(many, noop, { ...ALL_LIMITS, maxEntries: 2 })).toThrow(
      /too many entries/,
    );
    const big = zipOf({ 'a.txt': 'x'.repeat(64) });
    expect(() => extractZipArchive(big, noop, { ...ALL_LIMITS, maxDecompressedBytes: 8 })).toThrow(
      /size exceeds/,
    );
    const written: string[] = [];
    extractZipArchive(big, (name) => written.push(name), {
      ...ALL_LIMITS,
      maxDecompressedBytes: 64,
    });
    expect(written).toEqual(['a.txt']);
  });
});

describe('unwrapArchiveRoot', () => {
  test('unwraps exactly one top-level directory containing addon.json', () => {
    expect(unwrapArchiveRoot(['addon.json', 'dist/index.js'])).toBe(null);
    expect(unwrapArchiveRoot(['pkg/addon.json', 'pkg/dist/index.js'])).toBe('pkg');
    expect(unwrapArchiveRoot(['pkg/addon.json', 'other/addon.json'])).toBe(null);
    expect(unwrapArchiveRoot(['pkg/dist/index.js'])).toBe(null);
  });
});

describe('ArchiveAddonSourceAdapter', () => {
  test('extracts, unwraps the single top directory, stages as local; release cleans both dirs', async () => {
    const layout = new FakeLayout();
    const archive = new ArchiveAddonSourceAdapter(layout);
    const zipPath = join(home, 'wrapped.zip');
    const manifest = new TextEncoder().encode(JSON.stringify(VALID_MANIFEST));
    const entry = new TextEncoder().encode('export {};');
    const l10n = new TextEncoder().encode(JSON.stringify({ description: 'Test addon' }));
    writeFileSync(
      zipPath,
      zipSync({
        'wrapped-pkg/addon.json': manifest,
        'wrapped-pkg/dist/index.js': entry,
        'wrapped-pkg/l10n/en.json': l10n,
      }),
    );
    const plan = await archive.stage({ source: zipPath });
    expect(plan.trust).toBe('local');
    expect(plan.manifest.id).toBe('harnesys.test-addon');
    expect(existsSync(join(plan.stagingRef, 'addon.json'))).toBe(true);
    archive.release(plan.planId);
    expect(existsSync(plan.stagingRef)).toBe(false);
    expect(existsSync(addonExtractDir(layout.home(), plan.planId))).toBe(false);
    rmSync(layout.root, { recursive: true, force: true });
  });
});
