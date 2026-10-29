import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig, HarnesysPathsConfig } from '../../../config.schema.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SecretLockedException } from '../../domain/secret/secret.error.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { loadOrCreateMasterKey } from './master-key.ts';
import { SecretStoreAdapter } from './secret-store.adapter.ts';

let testOrgSeq = 0;

function testAppConfig(overrides: Partial<HarnesysPathsConfig> = {}): AppConfig {
  return {
    environment: 'test',
    app: { name: 'test', version: '0' },
    harnesys: { home: '', masterKey: '', publicUrl: '', ...overrides },
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

function createLayout(home: string): HostFsLayoutPort {
  return {
    home: () => home,
    configPath: () => join(home, 'config.json'),
    machinePath: () => join(home, 'machine.json'),
    machineDbPath: () => join(home, 'machine.db'),
    identityDbPath: () => join(home, 'identity.db'),
    marketplacesDir: () => join(home, 'marketplaces'),
    marketplaceInstallPath: (registryId) => join(home, 'marketplaces', registryId),
    orgDir: (orgId) => join(home, 'orgs', orgId),
    orgDbPath: (orgId) => join(home, 'orgs', orgId, 'org.db'),
    orgDataDir: (orgId) => join(home, 'data', 'orgs', orgId),
    orgWorkspacePath: (orgId) => join(home, 'data', 'orgs', orgId, 'workspace'),
    orgSourceDir: (orgId, sourceId) => join(home, 'data', 'orgs', orgId, 'sources', sourceId),
    sourceWorktreesDir: (orgId, sourceId) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    ensureSourceWorktreesDir: (orgId, sourceId) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    skillsDir: (orgId) => join(home, 'orgs', orgId, 'skills'),
    systemSkillsDir: () => join(home, 'skills'),
    hostAgentSkillsDir: () => join(home, '.agents', 'skills'),
    orgSettingsPath: (orgId) => join(home, 'orgs', orgId, 'settings.json'),
    skillsStagingDir: (orgId) => join(home, 'data', 'orgs', orgId, 'skills-staging'),
    mcpConfigPath: (orgId) => join(home, 'orgs', orgId, 'mcp.json'),
    pluginsDir: (orgId) => join(home, 'orgs', orgId, 'plugins'),
    pluginsDataDir: (orgId) => join(home, 'orgs', orgId, 'plugins-data'),
    lspConfigPath: (orgId) => join(home, 'orgs', orgId, 'lsp.json'),
    threadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    nodesDir: () => join(home, 'nodes'),
    nodeIdentityPath: (orgId) => join(home, 'nodes', `${orgId}.json`),
    ensureHome: () => undefined,
    ensureMarketplacesDir: () => join(home, 'marketplaces'),
    ensureOrgDir: (orgId) => {
      const dir = join(home, 'orgs', orgId);
      mkdirSync(dir, { recursive: true });
      const sqlite = new Database(join(dir, 'org.db'), { create: true });
      ensureOrgSchema(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as { name: string }[],
      );
      sqlite.close();
    },
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: () => '',
    ensureOrgSourceDir: () => '',
    ensureSkillsDir: (orgId) => join(home, 'orgs', orgId, 'skills'),
    ensurePluginsDir: (orgId) => join(home, 'orgs', orgId, 'plugins'),
    ensureThreadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}

describe('SecretStoreAdapter', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-secret-'));
  let orgId = '';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    loadOrCreateMasterKey(home);
    testOrgSeq += 1;
    orgId = `11111111-1111-4111-8111-${String(testOrgSeq).padStart(12, '0')}`;
    createLayout(home).ensureOrgDir(orgId);
  });

  test('roundtrip set then get', async () => {
    const store = new SecretStoreAdapter(createLayout(home), testAppConfig());
    await store.set(orgId, 'cloud:google:tokens', '{"refresh":"abc"}');
    expect(await store.get(orgId, 'cloud:google:tokens')).toBe('{"refresh":"abc"}');
  });

  test('missing key returns null', async () => {
    const store = new SecretStoreAdapter(createLayout(home), testAppConfig());
    expect(await store.get(orgId, 'missing')).toBeNull();
  });

  test('wrong master key fails closed', async () => {
    const store = new SecretStoreAdapter(createLayout(home), testAppConfig());
    await store.set(orgId, 'k', 'v');
    const otherHome = mkdtempSync(join(tmpdir(), 'harnesys-secret-other-'));
    try {
      loadOrCreateMasterKey(otherHome);
      const other = new SecretStoreAdapter(
        {
          ...createLayout(home),
          home: () => otherHome,
          ensureHome: () => undefined,
        } as HostFsLayoutPort,
        testAppConfig(),
      );
      await expect(other.get(orgId, 'k')).rejects.toBeInstanceOf(SecretLockedException);
    } finally {
      rmSync(otherHome, { recursive: true, force: true });
    }
  });

  test('listKeys and delete', async () => {
    const store = new SecretStoreAdapter(createLayout(home), testAppConfig());
    await store.set(orgId, 'a', '1');
    await store.set(orgId, 'b', '2');
    const keys = await store.listKeys(orgId);
    expect(keys.sort()).toEqual(['a', 'b']);
    await store.delete(orgId, 'a');
    expect(await store.get(orgId, 'a')).toBeNull();
    expect(await store.listKeys(orgId)).toEqual(['b']);
  });
});
