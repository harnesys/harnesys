import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { SqliteLlmModelAdapter } from './sqlite-llm-model.adapter.ts';
import { SqliteLlmProviderAdapter } from './sqlite-llm-provider.adapter.ts';

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

describe('SqliteLlmProviderAdapter', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-providers-'));
  const layout = createLayout(home);
  const providers = new SqliteLlmProviderAdapter(layout);
  const models = new SqliteLlmModelAdapter(layout);
  const orgId = 'org-providers-1';

  beforeEach(() => {
    layout.ensureOrgDir(orgId);
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('list roundtrip after insert', () => {
    const now = new Date().toISOString();
    const inserted = providers.insert({
      id: crypto.randomUUID(),
      orgId,
      name: 'local-ollama',
      driver: 'ollama',
      apiUrl: 'http://127.0.0.1:11434',
      apiKey: null,
      headers: {},
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    models.insert(orgId, {
      id: crypto.randomUUID(),
      providerId: inserted.id,
      name: 'nomic-embed-text',
      kind: 'embed',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    const listed = providers.list(orgId);
    expect(listed.some((p) => p.id === inserted.id)).toBe(true);
    expect(models.listByProvider(orgId, inserted.id)).toHaveLength(1);
    const found = providers.findByName(orgId, 'local-ollama');
    expect(found?.id).toBe(inserted.id);
  });
});
