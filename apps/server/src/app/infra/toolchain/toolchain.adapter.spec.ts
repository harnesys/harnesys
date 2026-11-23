import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ToolchainAdapter } from './toolchain.adapter.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-adapter-'));
  dirs.push(home);
  return home;
}

function stubBinary(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, '#!/bin/sh\n', { mode: 0o755 });
  return path;
}

function stubShell(dir: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'login-shell');
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

class MemoryOrgSettings extends OrgSettingsPort {
  private readonly store = new Map<string, OrgSettings>();

  override get(orgId: string): OrgSettings {
    return this.store.get(orgId) ?? OrgSettingsSchema.parse({});
  }

  override set(orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    const next = OrgSettingsSchema.parse({ ...this.get(orgId), ...patch });
    this.store.set(orgId, next);
    return next;
  }
}

describe('ToolchainAdapter', () => {
  test('command override beats PATH: a binary only known via override resolves', async () => {
    const home = fakeHome();
    const override = stubBinary(join(home, 'overrides'), 'my-ls');
    const settings = new MemoryOrgSettings();
    settings.set('org-1', {
      toolchain: {
        mode: 'custom',
        shell: 'auto',
        node: 'auto',
        extraPathDirs: [],
        commandOverrides: { 'my-ls': override },
      },
    });
    const adapter = new ToolchainAdapter(settings);

    expect(adapter.overrides('org-1')['my-ls']).toBe(override);
    expect(adapter.hasBinary('org-1', 'my-ls')).toBe(true);
    expect(adapter.hasBinary('org-1', 'ghost-ls')).toBe(false);
    const discovery = await adapter.discover('org-1', ['my-ls']);
    expect(discovery.commands[0]).toMatchObject({
      command: 'my-ls',
      resolvedPath: override,
      source: 'override',
    });
  });

  test('settings patch changes resolve() only after invalidate', () => {
    const home = fakeHome();
    stubBinary(join(home, 'extra-bin'), 'stub-ls');
    const extraDir = join(home, 'extra-bin');
    const settings = new MemoryOrgSettings();
    const adapter = new ToolchainAdapter(settings);
    const orgId = 'org-1';

    const before = adapter.resolve(orgId).dirs;
    settings.set(orgId, {
      toolchain: {
        mode: 'custom',
        shell: 'auto',
        node: 'auto',
        extraPathDirs: [extraDir],
        commandOverrides: {},
      },
    });
    expect(adapter.resolve(orgId).dirs).toEqual(before);
    expect(adapter.hasBinary(orgId, 'stub-ls')).toBe(false);

    adapter.invalidate(orgId);
    expect(adapter.resolve(orgId).dirs).toContain(extraDir);
    expect(adapter.hasBinary(orgId, 'stub-ls')).toBe(true);
  });

  test('resolve never probes the login shell synchronously and picks up the probed PATH', async () => {
    const home = fakeHome();
    const shell = stubShell(join(home, 'shell'), 'printf %s /probed/bin:/usr/bin');
    const settings = new MemoryOrgSettings();
    const orgId = 'org-1';
    settings.set(orgId, {
      toolchain: {
        mode: 'auto',
        shell,
        node: 'auto',
        extraPathDirs: [],
        commandOverrides: {},
      },
    });
    const adapter = new ToolchainAdapter(settings);
    const original = Bun.spawnSync;
    let spawnSyncCalls = 0;
    Bun.spawnSync = ((...args: Parameters<typeof original>) => {
      spawnSyncCalls += 1;
      return original(...args);
    }) as typeof original;
    try {
      const started = Date.now();
      const immediate = adapter.resolve(orgId);
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(500);
      expect(spawnSyncCalls).toBe(0);
      expect(immediate.dirs).not.toContain('/probed/bin');
      await waitFor(() => adapter.resolve(orgId).dirs.includes('/probed/bin'));
      expect(adapter.resolve(orgId).shell).toBe(shell);
      expect(spawnSyncCalls).toBe(0);
    } finally {
      Bun.spawnSync = original;
    }
  });
});
