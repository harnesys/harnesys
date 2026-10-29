import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardStatus } from '@harnesys/contracts';
import type { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';

export function createTestLayout(home: string): HostFsLayoutPort {
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
    pluginsDir: (_orgId) => join(home, 'plugins'),
    pluginsDataDir: (orgId) => join(home, 'data', 'orgs', orgId, 'plugins-data'),
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
      ensureOrgSchema((sql) => {
        sqlite.exec(sql);
      });
      sqlite.close();
    },
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: () => '',
    ensureOrgSourceDir: () => '',
    ensureSkillsDir: (orgId) => join(home, 'orgs', orgId, 'skills'),
    ensurePluginsDir: (_orgId) => join(home, 'plugins'),
    ensureThreadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}

export function insertTestBoard(
  boards: IssueBoardRepositoryPort,
  orgId: string,
  statuses: BoardStatus[],
): string {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  boards.insert({
    id,
    orgId,
    name: 'Board',
    description: '',
    color: '#000000',
    icon: 'box',
    status: 'active',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    statuses,
  });
  return id;
}
