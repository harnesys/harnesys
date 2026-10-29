import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InstallPluginUseCase } from '../../application/plugins/install-plugin.use-case.ts';
import { InvalidatePluginsUseCase } from '../../application/plugins/invalidate-plugins.use-case.ts';
import { ListPluginsUseCase } from '../../application/plugins/list-plugins.use-case.ts';
import { RemovePluginUseCase } from '../../application/plugins/remove-plugin.use-case.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { PluginRegistryAdapter } from './plugin-registry.adapter.ts';

describe('plugins install/list/remove', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('list empty; install from path; remove cascades', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harnesys-plugins-'));
    dirs.push(home);
    const orgId = 'org-1';
    const layout = createLayout(home);
    layout.ensureOrgDir(orgId);

    const registry = new PluginRegistryAdapter(layout);
    const list = new ListPluginsUseCase(registry);
    const install = new InstallPluginUseCase(registry, fakeRegistries(), layout, fakeInvalidate());
    const remove = new RemovePluginUseCase(registry, fakeInvalidate());

    expect(await list.execute({ orgId })).toEqual([]);

    const fixture = join(home, 'fixture-plugin');
    mkdirSync(join(fixture, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(fixture, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'demo-plugin',
        version: '0.0.1',
        description: 'fixture',
      }),
      'utf8',
    );

    const installed = await install.execute({
      orgId,
      body: { path: fixture, pluginName: 'demo-plugin' },
    });
    expect(installed.plugin.name).toBe('demo-plugin');
    expect(installed.plugin.path.startsWith(layout.pluginsDir(orgId))).toBe(true);

    const listed = await list.execute({ orgId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.plugin.name).toBe('demo-plugin');

    await remove.execute({ orgId, name: 'demo-plugin', deleteData: true });
    expect(await list.execute({ orgId })).toEqual([]);
  });
});

function fakeRegistries(): PluginRegistriesPort {
  return Object.create(PluginRegistriesPort.prototype) as PluginRegistriesPort;
}

function fakeInvalidate(): InvalidatePluginsUseCase {
  const useCase = Object.create(InvalidatePluginsUseCase.prototype) as InvalidatePluginsUseCase;
  useCase.execute = () => Promise.resolve();
  return useCase;
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
    ensurePluginsDir: (orgId) => {
      const dir = join(home, 'orgs', orgId, 'plugins');
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    ensureThreadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}
