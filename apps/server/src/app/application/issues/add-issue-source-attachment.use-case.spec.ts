import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { IssueAttachmentRecord, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { AddIssueSourceAttachmentUseCase } from './add-issue-source-attachment.use-case.ts';

const NOW = new Date(0).toISOString();
const HOST_ID = 'host-1';

interface StorageWrite {
  issueDir: string;
  id: string;
  fileName: string;
  bytes: Uint8Array;
}

describe('AddIssueSourceAttachmentUseCase', () => {
  let root: string;
  let threadRoot: string;
  let dataRoot: string;
  let writes: StorageWrite[];
  let useCase: AddIssueSourceAttachmentUseCase;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'issue-src-att-'));
    threadRoot = mkdtempSync(join(tmpdir(), 'issue-thread-att-'));
    dataRoot = mkdtempSync(join(tmpdir(), 'issue-data-att-'));
    writes = [];
    useCase = new AddIssueSourceAttachmentUseCase(
      createIssues(),
      createBoards(),
      createAttachments(),
      createStorage(writes),
      createSources(),
      createLocation(root),
      createMachineConfig(),
      createLayout(threadRoot, dataRoot),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(threadRoot, { recursive: true, force: true });
    rmSync(dataRoot, { recursive: true, force: true });
  });

  test('fills size and media type from the source file', async () => {
    writeFileSync(join(root, 'estimate.xlsx'), Buffer.alloc(11));
    const result = await useCase.execute({
      orgId: 'org-1',
      issueId: 'issue-1',
      body: { sourceId: 'src-1', sourcePath: 'estimate.xlsx' },
    });
    expect(result.kind).toBe('source');
    expect(result.sourceId).toBe('src-1');
    expect(result.sourcePath).toBe('estimate.xlsx');
    expect(result.sizeBytes).toBe(11);
    expect(result.mediaType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.kindMedia).toBe('file');
  });

  test('rejects a missing source file', async () => {
    await expect(
      useCase.execute({
        orgId: 'org-1',
        issueId: 'issue-1',
        body: { sourceId: 'src-1', sourcePath: 'absent.md' },
      }),
    ).rejects.toThrow('source file not found');
  });

  test('copies a run-root file into issue attachment storage as a file record', async () => {
    mkdirSync(join(threadRoot, 'thread-9'), { recursive: true });
    writeFileSync(join(threadRoot, 'thread-9', 'notes.md'), Buffer.from('run output'));
    const result = await useCase.execute({
      orgId: 'org-1',
      issueId: 'issue-1',
      threadId: 'thread-9',
      body: { sourceId: 'src-1', sourcePath: 'notes.md' },
    });
    expect(result.kind).toBe('file');
    expect(result.name).toBe('notes.md');
    expect(result.mediaType).toBe('text/markdown');
    expect(result.sizeBytes).toBe(10);
    expect(result.sourceId).toBeNull();
    expect(result.sourcePath).toBeNull();
    expect(result.path).toBe(join('attachments', result.id, 'notes.md'));
    expect(writes).toHaveLength(1);
    expect(writes[0]?.issueDir).toBe(join(dataRoot, 'org-1', 'issues', 'issue-1'));
    expect(writes[0]?.id).toBe(result.id);
    expect(writes[0]?.fileName).toBe('notes.md');
    expect(new TextDecoder().decode(writes[0]?.bytes)).toBe('run output');
  });

  test('prefers the source root when both roots contain the file', async () => {
    writeFileSync(join(root, 'dup.md'), Buffer.alloc(3));
    mkdirSync(join(threadRoot, 'thread-9'), { recursive: true });
    writeFileSync(join(threadRoot, 'thread-9', 'dup.md'), Buffer.alloc(99));
    const result = await useCase.execute({
      orgId: 'org-1',
      issueId: 'issue-1',
      threadId: 'thread-9',
      body: { sourceId: 'src-1', sourcePath: 'dup.md' },
    });
    expect(result.sizeBytes).toBe(3);
    expect(result.kind).toBe('source');
    expect(result.sourceId).toBe('src-1');
    expect(result.sourcePath).toBe('dup.md');
    expect(writes).toHaveLength(0);
  });

  test('rejects a path that escapes the thread run root', async () => {
    await expect(
      useCase.execute({
        orgId: 'org-1',
        issueId: 'issue-1',
        threadId: 'thread-9',
        body: { sourceId: 'src-1', sourcePath: '../secret.txt' },
      }),
    ).rejects.toThrow('source path escapes the source root');
  });

  test('error names both roots when the file is in neither', async () => {
    await expect(
      useCase.execute({
        orgId: 'org-1',
        issueId: 'issue-1',
        threadId: 'thread-9',
        body: { sourceId: 'src-1', sourcePath: 'nowhere.md' },
      }),
    ).rejects.toThrow(
      `source file not found: nowhere.md (not inside the source root ${root} and not inside the run root ${join(threadRoot, 'thread-9')}`,
    );
  });
});

function issueRecord(): IssueRecord {
  return {
    id: 'issue-1',
    orgId: 'org-1',
    boardId: 'board-1',
    title: 'Attach source',
    description: '',
    statusKey: 'todo',
    priority: 2,
    type: 'task',
    assigneeAgentId: null,
    labels: [],
    parentIssueId: null,
    dueDate: null,
    closedAt: null,
    fireTrail: [],
    sourceId: null,
    workspaceSubpath: null,
    branch: null,
    worktreeOnStatus: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createIssues(): IssueRepositoryPort {
  const port: Pick<IssueRepositoryPort, 'findById'> = {
    findById: (_orgId, id) => (id === 'issue-1' ? issueRecord() : undefined),
  };
  return port as IssueRepositoryPort;
}

function createBoards(): IssueBoardRepositoryPort {
  const port: Pick<IssueBoardRepositoryPort, 'findById'> = {
    findById: () => ({ id: 'board-1', orgId: 'org-1', status: 'active' }) as never,
  };
  return port as IssueBoardRepositoryPort;
}

function createAttachments(): IssueAttachmentRepositoryPort {
  const port: Pick<IssueAttachmentRepositoryPort, 'insert'> = {
    insert: (rec: IssueAttachmentRecord) => rec,
  };
  return port as IssueAttachmentRepositoryPort;
}

function createStorage(writes: StorageWrite[]): IssueAttachmentStoragePort {
  const port: Pick<IssueAttachmentStoragePort, 'write'> = {
    write: async (issueDir, id, fileName, bytes) => {
      writes.push({ issueDir, id, fileName, bytes });
      return join('attachments', id, fileName);
    },
  };
  return port as IssueAttachmentStoragePort;
}

function createSources(): SourceRegistryPort {
  const source: SourceRecord = {
    id: 'src-1',
    orgId: 'org-1',
    name: 'workspace',
    description: null,
    distribution: { kind: 'host-bound', hostId: HOST_ID },
    uiVisibility: 'org',
    managed: true,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const port: Pick<SourceRegistryPort, 'findById' | 'list' | 'findManagedWorkspace'> = {
    findById: (_orgId, id) => (id === 'src-1' ? source : null),
    list: () => [source],
    findManagedWorkspace: () => null,
  };
  return port as SourceRegistryPort;
}

function createLocation(absoluteRoot: string): SourceLocationPort {
  const port: Pick<SourceLocationPort, 'resolve'> = {
    resolve: () => ({ sourceId: 'src-1', hostId: HOST_ID, absoluteRoot }),
  };
  return port as SourceLocationPort;
}

function createMachineConfig(): MachineConfigPort {
  const port: Pick<MachineConfigPort, 'get'> = {
    get: () => ({ id: HOST_ID }) as never,
  };
  return port as MachineConfigPort;
}

function createLayout(threadBase: string, dataBase: string): HostFsLayoutPort {
  const port: Pick<HostFsLayoutPort, 'threadDir' | 'orgDataDir'> = {
    threadDir: (_orgId, threadId) => join(threadBase, threadId),
    orgDataDir: (orgId) => join(dataBase, orgId),
  };
  return port as HostFsLayoutPort;
}
