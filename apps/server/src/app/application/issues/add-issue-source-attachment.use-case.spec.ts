import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { IssueAttachmentRecord, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { AddIssueSourceAttachmentUseCase } from './add-issue-source-attachment.use-case.ts';

const NOW = new Date(0).toISOString();
const HOST_ID = 'host-1';

describe('AddIssueSourceAttachmentUseCase', () => {
  let root: string;
  let useCase: AddIssueSourceAttachmentUseCase;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'issue-src-att-'));
    useCase = new AddIssueSourceAttachmentUseCase(
      createIssues(),
      createBoards(),
      createAttachments(),
      createSources(),
      createLocation(root),
      createMachineConfig(),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('fills size and media type from the source file', () => {
    writeFileSync(join(root, 'estimate.xlsx'), Buffer.alloc(11));
    const result = useCase.execute({
      orgId: 'org-1',
      issueId: 'issue-1',
      body: { sourceId: 'src-1', sourcePath: 'estimate.xlsx' },
    });
    expect(result.sizeBytes).toBe(11);
    expect(result.mediaType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.kindMedia).toBe('file');
  });

  test('rejects a missing source file', () => {
    expect(() =>
      useCase.execute({
        orgId: 'org-1',
        issueId: 'issue-1',
        body: { sourceId: 'src-1', sourcePath: 'absent.md' },
      }),
    ).toThrow('source file not found');
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
