import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ConnectorConflictException } from '../../domain/connector/connector.error.ts';
import type { ConnectorInsert } from '../../domain/connector/connector.ts';
import { DEFAULT_MIRROR_POLICY } from '../../domain/connector/constants.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';
import {
  connectorBindingsTable,
  connectorDeliveriesTable,
  connectorInboxTable,
  connectorRoutesTable,
} from '../org-sqlite/schema/index.ts';
import { ConnectorRepositoryAdapter } from './connector-repository.adapter.ts';

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

function seedAgent(home: string, orgId: string, agentId: string): void {
  const sqlite = new Database(join(home, 'orgs', orgId, 'org.db'), { create: true });
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    const now = new Date().toISOString();
    drizzle(sqlite)
      .insert(agentsTable)
      .values({
        id: agentId,
        orgId,
        name: `agent-${agentId.slice(0, 8)}`,
        role: 'spec',
        instructions: '',
        model: 'spec-model',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } finally {
    sqlite.close();
  }
}

function connector(
  orgId: string,
  agentId: string,
  overrides: Partial<ConnectorInsert> = {},
): ConnectorInsert {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    orgId,
    agentId,
    provider: 'telegram',
    secretRef: 'connector_telegram_x',
    status: 'awaiting_pair',
    botUserId: '',
    botUsername: '',
    pairCodeHash: null,
    pairCodeExpiresAt: null,
    leaseOwner: null,
    leaseUntil: null,
    streamMode: null,
    policy: DEFAULT_MIRROR_POLICY,
    modeOverride: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ConnectorRepositoryAdapter', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-connectors-'));
  const layout = createLayout(home);
  let orgId = '';
  let agentA = '';
  let agentB = '';
  let repo: ConnectorRepositoryAdapter;

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    orgId = crypto.randomUUID();
    agentA = crypto.randomUUID();
    agentB = crypto.randomUUID();
    layout.ensureOrgDir(orgId);
    seedAgent(home, orgId, agentA);
    seedAgent(home, orgId, agentB);
    repo = new ConnectorRepositoryAdapter(layout);
  });

  test('insertInbox duplicate updateId returns duplicate', () => {
    const rec = repo.insert(connector(orgId, agentA, { botUserId: '1001', botUsername: 'bot_a' }));
    const inbox = {
      id: crypto.randomUUID(),
      connectorId: rec.id,
      bindingId: null,
      updateId: 42,
      kind: 'message' as const,
      payload: { text: 'hi' },
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    expect(repo.insertInbox(orgId, inbox)).toBe('inserted');
    expect(
      repo.insertInbox(orgId, {
        ...inbox,
        id: crypto.randomUUID(),
        payload: { text: 'again' },
      }),
    ).toBe('duplicate');
  });

  test('botUserId conflict throws; delete cascades children', () => {
    const first = repo.insert(
      connector(orgId, agentA, { botUserId: '9001', botUsername: 'shared_bot' }),
    );
    expect(() =>
      repo.insert(connector(orgId, agentB, { botUserId: '9001', botUsername: 'shared_bot' })),
    ).toThrow(ConnectorConflictException);

    const now = new Date().toISOString();
    const binding = repo.insertBinding({
      id: crypto.randomUUID(),
      connectorId: first.id,
      orgId,
      externalChatId: 'chat-1',
      externalTopicId: null,
      chatType: 'private',
      threadId: crypto.randomUUID(),
      participantPolicy: { userId: 'u1' },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    repo.insertRoute(orgId, {
      id: crypto.randomUUID(),
      connectorId: first.id,
      bindingId: binding.id,
      scope: 'thread',
      threadId: binding.threadId,
      createdAt: now,
    });
    repo.insertInbox(orgId, {
      id: crypto.randomUUID(),
      connectorId: first.id,
      bindingId: binding.id,
      updateId: 7,
      kind: 'message',
      payload: {},
      status: 'pending',
      createdAt: now,
    });
    repo.upsertDelivery(orgId, {
      id: crypto.randomUUID(),
      connectorId: first.id,
      bindingId: binding.id,
      threadId: binding.threadId,
      runId: crypto.randomUUID(),
      blockKey: 'text:0',
      interruptId: null,
      draftId: 1,
      lastText: 'hi',
      externalMessageId: null,
      status: 'streaming',
      updatedAt: now,
    });

    repo.delete(orgId, first.id);

    const sqlite = new Database(join(home, 'orgs', orgId, 'org.db'));
    try {
      const db = drizzle(sqlite);
      expect(db.select().from(connectorBindingsTable).all()).toHaveLength(0);
      expect(db.select().from(connectorRoutesTable).all()).toHaveLength(0);
      expect(db.select().from(connectorInboxTable).all()).toHaveLength(0);
      expect(db.select().from(connectorDeliveriesTable).all()).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
