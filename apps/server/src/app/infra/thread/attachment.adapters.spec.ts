import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';
import { AttachmentRepositoryAdapter } from './attachment-repository.adapter.ts';
import { AttachmentStorageAdapter } from './attachment-storage.adapter.ts';
import { ThreadRepositoryAdapter } from './thread-repository.adapter.ts';

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
    ensureThreadDir: (orgId, threadId) => {
      const dir = join(home, 'orgs', orgId, 'threads', threadId);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    ensureNodesDir: () => undefined,
    removeOrgDir: () => undefined,
    removeOrgDataDir: () => undefined,
  } as HostFsLayoutPort;
}

describe('attachment adapters', () => {
  let home: string;
  let layout: HostFsLayoutPort;
  const orgId = 'org-1';
  const threadId = crypto.randomUUID();
  const agentId = crypto.randomUUID();

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-attachments-'));
    layout = createLayout(home);
    layout.ensureOrgDir(orgId);
    const sqlite = new Database(join(home, 'orgs', orgId, 'org.db'), { create: true });
    try {
      sqlite.exec('PRAGMA foreign_keys = ON');
      const now = new Date().toISOString();
      drizzle(sqlite)
        .insert(agentsTable)
        .values({
          id: agentId,
          orgId,
          name: 'spec-agent',
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
    new ThreadRepositoryAdapter(layout).insert({
      id: threadId,
      orgId,
      agentId,
      originAgentId: agentId,
      title: 't',
      kind: 'chat',
      parentThreadId: null,
      forkAt: null,
      inheritedEventCount: 0,
      metadata: {},
      runProfileId: null,
      runDirectory: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('repository stores and lists attachment rows', () => {
    const repo = new AttachmentRepositoryAdapter(layout);
    const rec = {
      id: crypto.randomUUID(),
      threadId,
      name: 'notes.txt',
      mediaType: 'text/plain',
      kind: 'file' as const,
      sizeBytes: 11,
      path: `attachments/a1/notes.txt`,
      createdAt: new Date().toISOString(),
    };
    repo.insert(orgId, rec);
    const found = repo.findById(orgId, rec.id);
    expect(found?.name).toBe('notes.txt');
    expect(found?.threadId).toBe(threadId);
    expect(found?.path).toBe('attachments/a1/notes.txt');
    const list = repo.listByThread(orgId, threadId);
    expect(list).toHaveLength(1);
  });

  test('storage writes, reads and removes files under thread dir', async () => {
    const storage = new AttachmentStorageAdapter();
    const threadDir = layout.ensureThreadDir(orgId, threadId);
    const id = crypto.randomUUID();
    const relPath = await storage.write(
      threadDir,
      id,
      'hello world.txt',
      new TextEncoder().encode('hello world'),
    );
    expect(relPath).toBe(`attachments/${id}/hello world.txt`);
    const bytes = await storage.read(threadDir, relPath);
    expect(new TextDecoder().decode(bytes)).toBe('hello world');
    const onDisk = readFileSync(join(threadDir, relPath));
    expect(onDisk.byteLength).toBe(11);
    await storage.removeOne(threadDir, id);
    expect(await storage.read(threadDir, relPath)).toBeUndefined();
  });

  test('storage.removeThread wipes the whole thread dir', async () => {
    const storage = new AttachmentStorageAdapter();
    const threadDir = layout.ensureThreadDir(orgId, threadId);
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await storage.write(threadDir, a, 'a.txt', new Uint8Array([1]));
    await storage.write(threadDir, b, 'b.txt', new Uint8Array([2]));
    await storage.removeThread(threadDir);
    expect(await storage.read(threadDir, `attachments/${a}/a.txt`)).toBeUndefined();
    expect(await storage.read(threadDir, `attachments/${b}/b.txt`)).toBeUndefined();
    expect(existsSync(threadDir)).toBe(false);
  });

  test('repository.removeByThread cascades over rows', () => {
    const repo = new AttachmentRepositoryAdapter(layout);
    const rec = {
      id: crypto.randomUUID(),
      threadId,
      name: 'x.bin',
      mediaType: 'application/octet-stream',
      kind: 'file' as const,
      sizeBytes: 1,
      path: null,
      createdAt: new Date().toISOString(),
    };
    repo.insert(orgId, rec);
    repo.removeByThread(orgId, threadId);
    expect(repo.listByThread(orgId, threadId)).toHaveLength(0);
  });
});
