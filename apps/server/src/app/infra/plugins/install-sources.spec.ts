import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesizePluginManifest } from './install-sources.ts';

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lsp-install-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('synthesizePluginManifest', () => {
  test('writes .claude-plugin/plugin.json with inline components', async () => {
    const dir = await tempDir();
    await synthesizePluginManifest(dir, {
      name: 'typescript-lsp',
      version: '1.0.0',
      description: 'TS language server',
      lspServers: { typescript: { command: 'typescript-language-server', args: ['--stdio'] } },
    });
    const manifest = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe('typescript-lsp');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.lspServers).toBeDefined();
    expect('homepage' in manifest).toBe(false);
  });

  test('re-running overwrites the previous manifest', async () => {
    const dir = await tempDir();
    await synthesizePluginManifest(dir, { name: 'a' });
    await synthesizePluginManifest(dir, { name: 'b' });
    const manifest = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe('b');
  });
});
