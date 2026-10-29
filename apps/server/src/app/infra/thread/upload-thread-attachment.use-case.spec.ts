import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { UploadThreadAttachmentUseCase } from '../../application/threads/upload-thread-attachment.use-case.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MAX_ATTACHMENT_BYTES } from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { ThreadActiveRun, ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';
import { AttachmentRepositoryAdapter } from './attachment-repository.adapter.ts';
import { AttachmentStorageAdapter } from './attachment-storage.adapter.ts';
import { ThreadRepositoryAdapter } from './thread-repository.adapter.ts';

const ORG_ID = 'org-1';

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
    ensureSkillsDir: () => '',
    ensurePluginsDir: () => '',
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

function threadStub(threadId: string, agentId: string): ThreadRepositoryPort {
  class Stub extends ThreadRepositoryPort {
    constructor(private readonly record: ThreadRecord) {
      super();
    }
    listByOrg(): ThreadRecord[] {
      return [this.record];
    }
    listActiveRuns(): ThreadActiveRun[] {
      return [];
    }
    findActiveRun(): ThreadActiveRun | undefined {
      return undefined;
    }
    findById(): ThreadRecord | undefined {
      return this.record;
    }
    insert(): ThreadRecord {
      return this.record;
    }
    patch(): ThreadRecord {
      return this.record;
    }
    markRead(): ThreadRecord {
      return this.record;
    }
    updateTitle(): ThreadRecord {
      return this.record;
    }
    touch(): void {}
    delete(): void {}
    deleteByAgent(): void {}
    listByIssue(): ThreadRecord[] {
      return [];
    }
    findByIssueAndAgent(): ThreadRecord | undefined {
      return undefined;
    }
    threadIdsWithRuns(): Set<string> {
      return new Set();
    }
  }
  return new Stub({
    id: threadId,
    orgId: ORG_ID,
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
}

describe('UploadThreadAttachmentUseCase', () => {
  let home: string;
  let layout: HostFsLayoutPort;
  let attachments: AttachmentRepositoryPort;
  let storage: AttachmentStoragePort;
  const threadId = crypto.randomUUID();
  const agentId = crypto.randomUUID();

  function seedThreadRow(): void {
    const sqlite = new Database(join(home, 'orgs', ORG_ID, 'org.db'), { create: true });
    try {
      sqlite.exec('PRAGMA foreign_keys = ON');
      const now = new Date().toISOString();
      drizzle(sqlite)
        .insert(agentsTable)
        .values({
          id: agentId,
          orgId: ORG_ID,
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
      orgId: ORG_ID,
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
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-upload-'));
    layout = createLayout(home);
    layout.ensureOrgDir(ORG_ID);
    seedThreadRow();
    attachments = new AttachmentRepositoryAdapter(layout);
    storage = new AttachmentStorageAdapter();
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function useCase(): UploadThreadAttachmentUseCase {
    return new UploadThreadAttachmentUseCase(
      threadStub(threadId, agentId),
      attachments,
      storage,
      layout,
    );
  }

  test('stores bytes on disk and a row in org.db, returns meta', async () => {
    const meta = await useCase().execute({
      orgId: ORG_ID,
      threadId,
      name: '../evil note (1).txt',
      mediaType: 'text/plain',
      bytes: new TextEncoder().encode('hello attachments'),
    });
    expect(meta.kind).toBe('file');
    expect(meta.name).toBe('evil note (1).txt');
    expect(meta.sizeBytes).toBe(17);
    expect(meta.path).toStartWith('attachments/');
    const bytes = await storage.read(layout.threadDir(ORG_ID, threadId), meta.path ?? '');
    expect(new TextDecoder().decode(bytes)).toBe('hello attachments');
    const row = attachments.findById(ORG_ID, meta.id);
    expect(row?.threadId).toBe(threadId);
  });

  test('maps media type prefix to kind', async () => {
    const meta = await useCase().execute({
      orgId: ORG_ID,
      threadId,
      name: 'pic.png',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(meta.kind).toBe('image');
  });

  test('rejects empty payloads', async () => {
    await expect(
      useCase().execute({
        orgId: ORG_ID,
        threadId,
        name: 'empty.txt',
        mediaType: 'text/plain',
        bytes: new Uint8Array(),
      }),
    ).rejects.toThrow(ThreadValidationException);
  });

  test('rejects payloads over the size limit', async () => {
    await expect(
      useCase().execute({
        orgId: ORG_ID,
        threadId,
        name: 'big.bin',
        mediaType: 'application/octet-stream',
        bytes: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
      }),
    ).rejects.toThrow(ThreadValidationException);
  });
});
