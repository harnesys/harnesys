import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { DepartmentRecord } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { agentsTable } from '../org-sqlite/schema/index.ts';
import { DepartmentRegistryAdapter } from './department-registry.adapter.ts';

const ORG_ID = 'org-1';
const NOW = new Date().toISOString();

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
    lspConfigPath: (orgId) => join(home, 'orgs', orgId, 'lsp.json'),
    pluginsDir: (orgId) => join(home, 'orgs', orgId, 'plugins'),
    pluginsDataDir: (orgId) => join(home, 'data', 'orgs', orgId, 'plugins-data'),
    threadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    nodesDir: () => join(home, 'nodes'),
    nodeIdentityPath: (orgId) => join(home, 'nodes', `${orgId}.json`),
    ensureNodesDir: () => undefined,
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
    removeOrgDir: (orgId) => rmSync(join(home, 'orgs', orgId), { recursive: true, force: true }),
    removeOrgDataDir: () =>
      rmSync(join(home, 'data', 'orgs', ORG_ID), { recursive: true, force: true }),
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: () => '',
    ensureOrgSourceDir: () => '',
    ensureSkillsDir: () => '',
    ensurePluginsDir: () => '',
    ensureThreadDir: (orgId, threadId) => {
      const dir = join(home, 'orgs', orgId, 'threads', threadId);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
  } as HostFsLayoutPort;
}

class FakeDeskEvents extends DeskEventsPort {
  subscribe(): () => void {
    return () => undefined;
  }
  emit(): void {}
}

const deskEvents = new FakeDeskEvents();

function department(id: string, name: string): DepartmentRecord {
  return {
    id,
    orgId: ORG_ID,
    name,
    parentId: null,
    leadAgentId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('DepartmentRegistryAdapter', () => {
  let home: string;
  let layout: HostFsLayoutPort;
  let departments: DepartmentRegistryPort;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-departments-'));
    layout = createLayout(home);
    layout.ensureOrgDir(ORG_ID);
    departments = new DepartmentRegistryAdapter(layout, deskEvents);
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('insert, list, find by name and update roundtrip', () => {
    const created = departments.insert(department('dep-1', 'Engineering'));
    expect(created.id).toBe('dep-1');
    expect(departments.list(ORG_ID).map((row) => row.name)).toEqual(['Engineering']);
    expect(departments.findByName(ORG_ID, 'Engineering')?.id).toBe('dep-1');
    const updated = departments.update(ORG_ID, 'dep-1', { leadAgentId: 'agent-1' });
    expect(updated.leadAgentId).toBe('agent-1');
    expect(departments.findById(ORG_ID, 'dep-1')?.leadAgentId).toBe('agent-1');
  });

  test('duplicate name in org is rejected', () => {
    departments.insert(department('dep-1', 'Engineering'));
    expect(() => departments.insert(department('dep-2', 'Engineering'))).toThrow();
  });

  test('delete removes the department', () => {
    departments.insert(department('dep-1', 'Engineering'));
    departments.delete(ORG_ID, 'dep-1');
    expect(departments.list(ORG_ID)).toEqual([]);
    expect(departments.findById(ORG_ID, 'dep-1')).toBeUndefined();
  });

  test('agents table carries nullable department_id after migration', () => {
    withOrgSqlite(layout, ORG_ID, (db) => {
      db.insert(agentsTable)
        .values({
          id: 'agent-1',
          orgId: ORG_ID,
          name: 'Coder',
          role: 'dev',
          instructions: '',
          model: 'model-1',
          config: '{}',
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run();
      db.update(agentsTable)
        .set({ departmentId: 'dep-1' })
        .where(eq(agentsTable.id, 'agent-1'))
        .run();
      const row = db.select().from(agentsTable).where(eq(agentsTable.id, 'agent-1')).get();
      expect(row?.departmentId).toBe('dep-1');
    });
  });
});
