import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalNotFoundException } from '../../domain/approval/approval.error.ts';
import type { ApprovalRequestInput } from '../../domain/approval/approval.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { ApprovalStoreAdapter } from './approval-store.adapter.ts';

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

function input(overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    runId: crypto.randomUUID(),
    agentId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    interruptId: 'perm/1/0',
    kind: 'tool',
    question: 'allow fs.write?',
    options: ['approve', 'approve_once', 'deny'],
    context: { source: 'permission', ops: ['fs.write'] },
    ...overrides,
  };
}

describe('ApprovalStoreAdapter decisionSeq fencing', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-approvals-'));
  const layout = createLayout(home);
  let orgId = '';
  let store: ApprovalStoreAdapter;

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    orgId = crypto.randomUUID();
    store = new ApprovalStoreAdapter(layout);
  });

  test('double decide converges once', () => {
    const req = input();
    const { id } = store.request(orgId, req);
    const first = store.decide(orgId, { approvalId: id, decision: 'approve', surface: 'web' });
    const second = store.decide(orgId, { approvalId: id, decision: 'deny', surface: 'telegram' });
    expect(first).toEqual({ winner: true, status: 'approved' });
    expect(second).toEqual({ winner: false, status: 'approved' });
    const row = store.get(orgId, id);
    expect(row?.status).toBe('approved');
    expect(row?.decisionSeq).toBe(1);
  });

  test('the table carries no ttl column — nothing promises expiration', () => {
    const { id } = store.request(orgId, input());
    const row = store.get(orgId, id);
    expect(row).not.toBeNull();
    expect(Object.keys(row ?? {}).some((key) => key.toLowerCase().includes('ttl'))).toBe(false);
  });

  test('decide on an unknown approval reports not found instead of a fake expiry', () => {
    expect(() =>
      store.decide(orgId, {
        approvalId: crypto.randomUUID(),
        decision: 'approve',
        surface: 'web',
      }),
    ).toThrow(ApprovalNotFoundException);
  });

  test('repeated request for same park returns same id', () => {
    const req = input();
    const first = store.request(orgId, req);
    const second = store.request(orgId, req);
    expect(second.id).toBe(first.id);
    expect(store.list(orgId)).toHaveLength(1);
  });

  test('request with new interruptId supersedes pending approval of same run', () => {
    const runId = crypto.randomUUID();
    const first = store.request(orgId, input({ runId, interruptId: 'perm/1/0' }));
    const second = store.request(orgId, input({ runId, interruptId: 'perm/2/0' }));
    expect(second.id).not.toBe(first.id);
    expect(store.get(orgId, first.id)?.status).toBe('superseded');
    expect(store.get(orgId, second.id)?.status).toBe('pending');
    expect(store.get(orgId, first.id)?.decisionSeq).toBe(0);
  });

  test('winner decision stores note and override; seq counts only winners', () => {
    const runId = crypto.randomUUID();
    const { id } = store.request(orgId, input({ runId, interruptId: 'perm/1/0' }));
    store.decide(orgId, { approvalId: id, decision: 'deny', surface: 'web' });
    const decided = store.decide(orgId, {
      approvalId: id,
      decision: 'approve',
      surface: 'web',
      note: 'ok',
    });
    expect(decided.winner).toBe(false);
    const winner = store.request(orgId, input({ runId, interruptId: 'perm/3/0' }));
    store.decide(orgId, {
      approvalId: winner.id,
      decision: 'approve',
      surface: 'web',
      note: 'go',
    });
    const row = store.get(orgId, winner.id);
    expect(row?.decisionSeq).toBe(1);
    expect(row?.context).toMatchObject({ note: 'go', override: { ops: ['fs.write'] } });
  });

  test('getByRunInterrupt returns pending row for matching run and interruptId', () => {
    const runId = crypto.randomUUID();
    const { id } = store.request(orgId, input({ runId, interruptId: 'perm/1/0' }));
    const found = store.getByRunInterrupt(orgId, runId, 'perm/1/0');
    expect(found?.id).toBe(id);
    expect(found?.status).toBe('pending');
  });

  test('getByRunInterrupt returns null when interruptId does not match', () => {
    const runId = crypto.randomUUID();
    store.request(orgId, input({ runId, interruptId: 'perm/1/0' }));
    const found = store.getByRunInterrupt(orgId, runId, 'perm/2/0');
    expect(found).toBeNull();
  });

  test('getByRunInterrupt returns null when approval is not pending', () => {
    const runId = crypto.randomUUID();
    const { id } = store.request(orgId, input({ runId, interruptId: 'perm/1/0' }));
    store.decide(orgId, { approvalId: id, decision: 'deny', surface: 'web' });
    const found = store.getByRunInterrupt(orgId, runId, 'perm/1/0');
    expect(found).toBeNull();
  });
});
