import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../../config.schema.ts';
import { HostFsLayoutAdapter } from './host-fs-layout.adapter.ts';

function testConfig(home: string): AppConfig {
  return {
    environment: 'test',
    app: { name: 'test', version: '0.0.0' },
    harnesys: { home, masterKey: '', publicUrl: '' },
    githubApp: {
      appId: '',
      privateKey: '',
      clientId: '',
      clientSecret: '',
      webhookSecret: '',
      appSlug: '',
    },
  };
}

describe('HostFsLayoutAdapter stage-3 paths', () => {
  let home = '';

  afterEach(() => {
    if (home && existsSync(home)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('skills/mcp/plugins/lsp/thread paths sit under orgDir not orgDataDir', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));
    const orgId = 'org-a';
    const orgDir = layout.orgDir(orgId);
    const dataDir = layout.orgDataDir(orgId);

    expect(layout.skillsDir(orgId)).toBe(join(orgDir, 'skills'));
    expect(layout.mcpConfigPath(orgId)).toBe(join(orgDir, 'mcp.json'));
    expect(layout.pluginsDir(orgId)).toBe(join(orgDir, 'plugins'));
    expect(layout.pluginsDataDir(orgId)).toBe(join(orgDir, 'plugins-data'));
    expect(layout.lspConfigPath(orgId)).toBe(join(orgDir, 'lsp.json'));
    expect(layout.threadDir(orgId, 'thread-1')).toBe(join(orgDir, 'threads', 'thread-1'));

    expect(layout.skillsDir(orgId).startsWith(dataDir)).toBe(false);
    expect(layout.mcpConfigPath(orgId).startsWith(dataDir)).toBe(false);
    expect(layout.threadDir(orgId, 'thread-1').startsWith(dataDir)).toBe(false);
  });

  test('ensure helpers create directories under orgDir', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));
    const orgId = 'org-b';

    const skills = layout.ensureSkillsDir(orgId);
    const plugins = layout.ensurePluginsDir(orgId);
    const thread = layout.ensureThreadDir(orgId, 't1');

    expect(existsSync(skills)).toBe(true);
    expect(existsSync(plugins)).toBe(true);
    expect(existsSync(thread)).toBe(true);
    expect(skills).toBe(layout.skillsDir(orgId));
    expect(plugins).toBe(layout.pluginsDir(orgId));
    expect(thread).toBe(layout.threadDir(orgId, 't1'));
  });

  test('rejects unsafe orgId and threadId', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));

    expect(() => layout.skillsDir('../x')).toThrow();
    expect(() => layout.threadDir('org-ok', '../t')).toThrow();
    expect(() => layout.threadDir('org-ok', 'a/b')).toThrow();
  });

  test('skills tier roots, org settings path and staging dir', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));

    expect(layout.systemSkillsDir()).toBe(join(home, 'skills'));
    expect(layout.hostAgentSkillsDir()).toBe(join(homedir(), '.agents', 'skills'));
    expect(layout.orgSettingsPath('org-c')).toBe(join(layout.orgDir('org-c'), 'settings.json'));
    expect(layout.skillsStagingDir('org-c')).toBe(
      join(layout.orgDataDir('org-c'), 'skills-staging'),
    );
    expect(() => layout.orgSettingsPath('../x')).toThrow();
    expect(() => layout.skillsStagingDir('../x')).toThrow();
  });

  test('marketplaces and machine.db sit under home', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));

    expect(layout.machineDbPath()).toBe(join(home, 'machine.db'));
    expect(layout.identityDbPath()).toBe(join(home, 'identity.db'));
    expect(layout.marketplacesDir()).toBe(join(home, 'marketplaces'));
    expect(layout.marketplaceInstallPath('acme')).toBe(join(home, 'marketplaces', 'acme'));
    expect(layout.ensureMarketplacesDir()).toBe(join(home, 'marketplaces'));
    expect(existsSync(layout.marketplacesDir())).toBe(true);
    expect(() => layout.marketplaceInstallPath('../x')).toThrow();
  });

  test('source worktrees dir is sibling of bare source dir', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-layout-'));
    const layout = new HostFsLayoutAdapter(testConfig(home));
    const orgId = 'org-git';
    const sourceId = 'src-1';
    const bare = layout.orgSourceDir(orgId, sourceId);
    const worktrees = layout.sourceWorktreesDir(orgId, sourceId);
    expect(bare).toBe(join(layout.orgDataDir(orgId), 'sources', sourceId));
    expect(worktrees).toBe(join(layout.orgDataDir(orgId), 'sources', `${sourceId}.worktrees`));
    expect(layout.ensureSourceWorktreesDir(orgId, sourceId)).toBe(worktrees);
    expect(existsSync(worktrees)).toBe(true);
    expect(() => layout.sourceWorktreesDir(orgId, '../x')).toThrow();
  });
});
