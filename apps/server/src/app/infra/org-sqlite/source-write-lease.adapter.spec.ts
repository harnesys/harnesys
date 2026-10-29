import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import { SourceWriteLeaseAdapter } from './source-write-lease.adapter.ts';

let testOrgSeq = 0;

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

describe('SourceWriteLeaseAdapter', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-write-lease-'));
  const layout = createLayout(home);
  let orgId = '';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    testOrgSeq += 1;
    orgId = `11111111-1111-4111-8111-${String(testOrgSeq).padStart(12, '0')}`;
    layout.ensureOrgDir(orgId);
  });

  test('acquire then second writer is denied until release', () => {
    const adapter = new SourceWriteLeaseAdapter(layout);
    const expiresAt = new Date(Date.now() + 900_000).toISOString();
    const first = adapter.acquire({
      orgId,
      sourceId: 'source-1',
      runId: 'run-a',
      nodeId: 'node-1',
      expiresAt,
    });
    expect(first.ok).toBe(true);
    const second = adapter.acquire({
      orgId,
      sourceId: 'source-1',
      runId: 'run-b',
      nodeId: 'node-2',
      expiresAt,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.holder.runId).toBe('run-a');
    }
    expect(adapter.release(orgId, 'source-1', 'run-a')).toBe(true);
    const third = adapter.acquire({
      orgId,
      sourceId: 'source-1',
      runId: 'run-b',
      nodeId: 'node-2',
      expiresAt,
    });
    expect(third.ok).toBe(true);
  });
});
