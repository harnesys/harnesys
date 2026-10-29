import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentPresetBody, TeamPresetBody } from '@harnesys/contracts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PresetConflictException } from '../../domain/presets/preset.error.ts';
import { PresetRepositoryAdapter } from './preset-repository.adapter.ts';

const agentBody: AgentPresetBody = {
  name: 'Coder',
  role: 'Engineer',
  instructions: 'write code',
  skills: ['lint'],
};

const teamBody: TeamPresetBody = {
  roles: [
    {
      roleKey: 'coder',
      name: 'Coder',
      agentRef: 'harnesys/coder',
      budgetUsdDaily: 10,
      requiresModel: true,
    },
  ],
  board: {
    statuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0, isEntry: true },
      { key: 'done', label: 'Done', category: 'finished', order: 1, isEntry: false },
    ],
    rules: [],
  },
  digest: { cronDefault: '0 9 * * *', roleKey: 'coder', detail: 'daily' },
};

describe('PresetRepositoryAdapter', () => {
  afterEach(() => {
    if (home && existsSync(home)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('save then findById roundtrips body and tags', () => {
    const repo = createRepo();
    const saved = repo.save({
      id: 'local/coder',
      kind: 'agent',
      origin: 'user',
      version: '1.0.0',
      name: 'Coder',
      description: 'my coder',
      tags: ['dev', 'code'],
      body: agentBody,
    });
    expect(saved.id).toBe('local/coder');
    expect(saved.tags).toEqual(['dev', 'code']);

    const found = repo.findById('agent', 'local/coder');
    expect(found?.body).toEqual(agentBody);
    expect(found?.description).toBe('my coder');
    expect(repo.get('agent', 'local/coder')?.kind).toBe('agent');
  });

  test('findAnyById finds a row regardless of kind', () => {
    const repo = createRepo();
    repo.save({
      id: 'local/team',
      kind: 'team',
      origin: 'user',
      version: '1.0.0',
      name: 'Team',
      body: teamBody,
    });
    expect(repo.findAnyById('local/team')?.kind).toBe('team');
    expect(repo.findById('agent', 'local/team')).toBeNull();
    expect(repo.findAnyById('local/missing')).toBeNull();
  });

  test('saving the same id with another kind conflicts', () => {
    const repo = createRepo();
    repo.save({
      id: 'local/thing',
      kind: 'agent',
      origin: 'user',
      version: '1.0.0',
      name: 'Thing',
      body: agentBody,
    });
    expect(() =>
      repo.save({
        id: 'local/thing',
        kind: 'team',
        origin: 'user',
        version: '1.0.0',
        name: 'Thing',
        body: teamBody,
      }),
    ).toThrow(PresetConflictException);
  });

  test('list filters by kind and origin', () => {
    const repo = createRepo();
    repo.save({
      id: 'harnesys/coder',
      kind: 'agent',
      origin: 'system',
      version: '1.0.0',
      name: 'Coder',
      body: agentBody,
    });
    repo.save({
      id: 'local/team',
      kind: 'team',
      origin: 'user',
      version: '1.0.0',
      name: 'Team',
      body: teamBody,
    });
    expect(repo.list()).toHaveLength(2);
    expect(repo.list({ kind: 'agent' }).map((item) => item.id)).toEqual(['harnesys/coder']);
    expect(repo.list({ origin: 'user' }).map((item) => item.id)).toEqual(['local/team']);
    expect(repo.list({ kind: 'team' })[0]?.kind).toBe('team');
  });

  test('delete removes the row', () => {
    const repo = createRepo();
    repo.save({
      id: 'local/coder',
      kind: 'agent',
      origin: 'user',
      version: '1.0.0',
      name: 'Coder',
      body: agentBody,
    });
    repo.delete('agent', 'local/coder');
    expect(repo.findById('agent', 'local/coder')).toBeNull();
  });

  test('deleteSystemRowsExcept keeps listed system rows only', () => {
    const repo = createRepo();
    repo.save({
      id: 'harnesys/keep',
      kind: 'agent',
      origin: 'system',
      version: '1.0.0',
      name: 'Keep',
      body: agentBody,
    });
    repo.save({
      id: 'harnesys/drop',
      kind: 'agent',
      origin: 'system',
      version: '1.0.0',
      name: 'Drop',
      body: agentBody,
    });
    repo.save({
      id: 'local/mine',
      kind: 'agent',
      origin: 'user',
      version: '1.0.0',
      name: 'Mine',
      body: agentBody,
    });
    repo.deleteSystemRowsExcept(['harnesys/keep']);
    expect(repo.listByOrigin('system').map((row) => row.id)).toEqual(['harnesys/keep']);
    expect(repo.findAnyById('harnesys/drop')).toBeNull();
    expect(repo.findAnyById('local/mine')).not.toBeNull();
  });
});

let home = '';

function createRepo(): PresetRepositoryAdapter {
  home = mkdtempSync(join(tmpdir(), 'harnesys-presets-'));
  return new PresetRepositoryAdapter(createLayout(home));
}

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
    skillsDir: (orgId: string) => join(home, 'orgs', orgId, 'skills'),
    systemSkillsDir: () => join(home, 'skills'),
    hostAgentSkillsDir: () => join(home, '.agents', 'skills'),
    orgSettingsPath: (orgId: string) => join(home, 'orgs', orgId, 'settings.json'),
    skillsStagingDir: (orgId: string) => join(home, 'data', 'orgs', orgId, 'skills-staging'),
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
    ensureMarketplacesDir: () => join(home, 'marketplaces'),
    ensureOrgDir: () => undefined,
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: () => '',
    ensureOrgSourceDir: () => '',
    ensureSkillsDir: (orgId: string) => join(home, 'orgs', orgId, 'skills'),
    ensurePluginsDir: (orgId: string) => join(home, 'orgs', orgId, 'plugins'),
    ensureThreadDir: (orgId: string, threadId: string) =>
      join(home, 'orgs', orgId, 'threads', threadId),
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}
