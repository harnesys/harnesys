import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { FileAccessRuleAdapter } from './file-access-rule.adapter.ts';

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

describe('FileAccessRuleAdapter', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-file-rules-'));
  const layout = createLayout(home);
  const adapter = new FileAccessRuleAdapter(layout);
  let orgId = '';
  const agentId = '33333333-3333-4333-8333-00000000000a';
  const otherAgentId = '33333333-3333-4333-8333-00000000000b';
  const hostId = '22222222-2222-4222-8222-00000000000a';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    testOrgSeq += 1;
    orgId = `11111111-1111-4111-8111-${String(testOrgSeq).padStart(12, '0')}`;
    layout.ensureOrgDir(orgId);
  });

  test('insert, list, listForAgent and remove roundtrip', () => {
    const agentRule = adapter.insert({
      orgId,
      agentId,
      hostId,
      pathPattern: '/Users/mike/project/**',
      action: 'edit',
      effect: 'allow',
    });
    const orgRule = adapter.insert({
      orgId,
      agentId: null,
      hostId: null,
      pathPattern: '/Users/mike/media/**',
      action: 'read',
      effect: 'deny',
    });
    const otherAgentRule = adapter.insert({
      orgId,
      agentId: otherAgentId,
      hostId: null,
      pathPattern: '/Users/mike/other/**',
      action: 'read',
      effect: 'allow',
    });

    expect(adapter.list(orgId).map((rule) => rule.id)).toEqual(
      expect.arrayContaining([agentRule.id, orgRule.id]),
    );

    for (const rule of [agentRule, orgRule]) {
      expect(rule.orgId).toBe(orgId);
      expect(rule.createdAt).toBe(rule.updatedAt);
    }
    expect(agentRule.agentId).toBe(agentId);
    expect(orgRule.agentId).toBeNull();

    const forAgent = adapter.listForAgent(orgId, agentId);
    expect(forAgent.map((rule) => rule.id).sort()).toEqual([agentRule.id, orgRule.id].sort());

    adapter.remove(orgId, agentRule.id);
    expect(
      adapter
        .list(orgId)
        .map((rule) => rule.id)
        .sort(),
    ).toEqual([orgRule.id, otherAgentRule.id].sort());
    expect(() => adapter.remove(orgId, agentRule.id)).toThrow();
  });
});
