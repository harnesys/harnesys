import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { isMarketplaceJsonUrl, slugFromSource } from './plugin-git.ts';
import { PluginMarketplacesAdapter } from './plugin-marketplaces.adapter.ts';

describe('PluginMarketplacesAdapter roundtrip', () => {
  let home = '';

  afterEach(() => {
    if (home && existsSync(home)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('upsert registry, replace catalog, filter, delete', () => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-marketplaces-'));
    const layout = createLayout(home);
    const store = new PluginMarketplacesAdapter(layout);
    const now = new Date().toISOString();

    const registry = store.upsert({
      id: 'acme-marketplace',
      name: 'acme-marketplace',
      kind: 'claude-marketplace',
      source: 'acme/marketplace',
      path: layout.marketplaceInstallPath('acme-marketplace'),
      createdAt: now,
      updatedAt: now,
    });
    expect(registry.id).toBe('acme-marketplace');
    expect(store.list()).toHaveLength(1);
    expect(store.findById('acme-marketplace')?.source).toBe('acme/marketplace');
    expect(store.findByName('acme-marketplace')?.id).toBe('acme-marketplace');

    const entries: CatalogEntry[] = [
      {
        registryId: 'acme-marketplace',
        pluginName: 'hello-world',
        displayName: 'Hello',
        description: 'Greets the user',
        installable: true,
        installSource: { type: 'relative', path: './plugins/hello' },
      },
      {
        registryId: 'acme-marketplace',
        pluginName: 'other-tool',
        installable: false,
        unsupportedReason: 'npm only',
      },
    ];
    store.replaceCatalog('acme-marketplace', entries);

    expect(store.listCatalog()).toHaveLength(2);
    expect(store.listCatalog({ q: 'hello' }).map((e) => e.pluginName)).toEqual(['hello-world']);
    expect(store.listCatalog({ registryId: 'acme-marketplace' })).toHaveLength(2);
    expect(store.findCatalogEntry('acme-marketplace', 'hello-world')?.displayName).toBe('Hello');

    store.delete('acme-marketplace');
    expect(store.list()).toHaveLength(0);
    expect(store.listCatalog()).toHaveLength(0);
    expect(existsSync(layout.machineDbPath())).toBe(true);
  });
});

describe('plugin-git helpers', () => {
  test('slugFromSource and isMarketplaceJsonUrl', () => {
    expect(slugFromSource('anthropics/claude-plugins-official')).toBe(
      'anthropics-claude-plugins-official',
    );
    expect(slugFromSource('https://example.com/org/marketplace.json')).toBe('org-marketplace');
    expect(isMarketplaceJsonUrl('https://cdn.example/marketplace.json')).toBe(true);
    expect(isMarketplaceJsonUrl('anthropics/claude-plugins-official')).toBe(false);
  });
});

function createLayout(home: string): HostFsLayoutPort {
  return {
    home: () => home,
    configPath: () => join(home, 'config.json'),
    machinePath: () => join(home, 'machine.json'),
    machineDbPath: () => join(home, 'machine.db'),
    identityDbPath: () => join(home, 'identity.db'),
    marketplacesDir: () => join(home, 'marketplaces'),
    marketplaceInstallPath: (registryId: string) => join(home, 'marketplaces', registryId),
    orgDir: (orgId: string) => join(home, 'orgs', orgId),
    orgDbPath: (orgId: string) => join(home, 'orgs', orgId, 'org.db'),
    orgDataDir: (orgId: string) => join(home, 'data', 'orgs', orgId),
    orgWorkspacePath: (orgId: string) => join(home, 'data', 'orgs', orgId, 'workspace'),
    orgSourceDir: (orgId: string, sourceId: string) =>
      join(home, 'data', 'orgs', orgId, 'sources', sourceId),
    sourceWorktreesDir: (orgId: string, sourceId: string) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    ensureSourceWorktreesDir: (orgId: string, sourceId: string) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    skillsDir: (orgId) => join(home, 'orgs', orgId, 'skills'),
    systemSkillsDir: () => join(home, 'skills'),
    hostAgentSkillsDir: () => join(home, '.agents', 'skills'),
    orgSettingsPath: (orgId) => join(home, 'orgs', orgId, 'settings.json'),
    skillsStagingDir: (orgId) => join(home, 'data', 'orgs', orgId, 'skills-staging'),
    mcpConfigPath: (orgId: string) => join(home, 'orgs', orgId, 'mcp.json'),
    pluginsDir: (orgId: string) => join(home, 'orgs', orgId, 'plugins'),
    pluginsDataDir: (orgId: string) => join(home, 'orgs', orgId, 'plugins-data'),
    lspConfigPath: (orgId: string) => join(home, 'orgs', orgId, 'lsp.json'),
    threadDir: (orgId: string, threadId: string) => join(home, 'orgs', orgId, 'threads', threadId),
    nodesDir: () => join(home, 'nodes'),
    nodeIdentityPath: (orgId: string) => join(home, 'nodes', `${orgId}.json`),
    ensureHome: () => {
      mkdirSync(home, { recursive: true });
    },
    ensureMarketplacesDir: () => {
      const dir = join(home, 'marketplaces');
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    ensureOrgDir: () => undefined,
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: (orgId: string) => join(home, 'data', 'orgs', orgId, 'workspace'),
    ensureOrgSourceDir: (orgId: string, sourceId: string) =>
      join(home, 'data', 'orgs', orgId, 'sources', sourceId),
    ensureSkillsDir: (orgId: string) => join(home, 'orgs', orgId, 'skills'),
    ensurePluginsDir: (orgId: string) => join(home, 'orgs', orgId, 'plugins'),
    ensureThreadDir: (orgId: string, threadId: string) =>
      join(home, 'orgs', orgId, 'threads', threadId),
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}
