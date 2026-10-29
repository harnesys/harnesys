import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CloudDocumentExporter } from '../../domain/source/cloud-remote-backend.port.ts';
import {
  CloudRemoteBackendPort,
  type CloudRemoteEntry,
  type CloudRemoteFolderInput,
  type CloudRemoteFolderResult,
  type CloudRemoteUploadInput,
  type CloudRemoteUploadResult,
  supportsDocumentExport,
} from '../../domain/source/cloud-remote-backend.port.ts';
import {
  type MaterializationProjectionRecord,
  type MaterializationRecord,
  SourceMaterializationPort,
  type UpsertMaterializationInput,
} from '../../domain/source/source-materialization.port.ts';
import { StubLayout } from '../../infra/runtime/prepare-org-target.fixtures.ts';
import { materializeCloudSourceOnHost } from './materialize-cloud-source.ts';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class FakeDriveBackend extends CloudRemoteBackendPort implements CloudDocumentExporter {
  readonly vendor = 'google' as const;
  readonly exported: Array<{ fileId: string; mimeType: string }> = [];
  readonly downloaded: string[] = [];

  constructor(private readonly entries: CloudRemoteEntry[]) {
    super();
  }

  async listChildren(): Promise<CloudRemoteEntry[]> {
    return this.entries;
  }

  async download(fileId: string): Promise<Uint8Array> {
    this.downloaded.push(fileId);
    return new TextEncoder().encode(`binary:${fileId}`);
  }

  async exportDocument(fileId: string, mimeType: string): Promise<Uint8Array> {
    this.exported.push({ fileId, mimeType });
    return new TextEncoder().encode(`exported:${fileId}:${mimeType}`);
  }

  async upload(_: CloudRemoteUploadInput): Promise<CloudRemoteUploadResult> {
    return { id: '', name: '' };
  }

  async createFolder(_: CloudRemoteFolderInput): Promise<CloudRemoteFolderResult> {
    return { id: '', name: '' };
  }

  async delete(): Promise<void> {}

  async getMetadata(fileId: string): Promise<CloudRemoteEntry> {
    return (
      this.entries.find((entry) => entry.id === fileId) ?? {
        id: fileId,
        name: fileId,
        kind: 'file',
      }
    );
  }
}

class FakeLayout extends StubLayout {
  constructor(private readonly sourceRoot: string) {
    super(sourceRoot);
  }

  override ensureOrgSourceDir(): string {
    return this.sourceRoot;
  }
}

class FakeMaterializations extends SourceMaterializationPort {
  readonly records: UpsertMaterializationInput[] = [];

  find(): null {
    return null;
  }

  upsert(record: UpsertMaterializationInput): void {
    this.records.push(record);
  }

  listForSource(): MaterializationRecord[] {
    throw new Error('not used');
  }

  removeForSource(): void {
    throw new Error('not used');
  }

  findProjection(): null {
    return null;
  }

  listProjectionsForSource(): MaterializationProjectionRecord[] {
    throw new Error('not used');
  }

  upsertProjection(): 'applied' {
    throw new Error('not used');
  }
}

describe('materializeCloudSourceOnHost google docs export', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'harnesys-materialize-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeInput(entries: CloudRemoteEntry[]) {
    const backend = new FakeDriveBackend(entries);
    return {
      backend,
      input: {
        orgId: 'org1',
        sourceId: 'src1',
        hostId: 'host1',
        remoteFolderId: 'folder1',
        getAccessToken: async () => 'token',
        layout: new FakeLayout(root),
        materializations: new FakeMaterializations(),
        createBackend: () => backend,
      },
    };
  }

  test('exports google docs to office formats instead of skipping', async () => {
    const { backend, input } = makeInput([
      {
        id: 'doc1',
        name: 'Proposal',
        kind: 'file',
        mimeType: 'application/vnd.google-apps.document',
        modifiedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sheet1',
        name: 'Budget',
        kind: 'file',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        modifiedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'form1',
        name: 'Survey',
        kind: 'file',
        mimeType: 'application/vnd.google-apps.form',
        modifiedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'file1',
        name: 'notes.txt',
        kind: 'file',
        mimeType: 'text/plain',
        modifiedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(supportsDocumentExport(backend)).toBe(true);
    const result = await materializeCloudSourceOnHost(input);
    expect(result.state).toBe('ready');
    expect(result.skippedGoogleApps).toBe(1);
    expect(backend.exported).toEqual([
      { fileId: 'doc1', mimeType: DOCX_MIME },
      {
        fileId: 'sheet1',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);
    expect(backend.downloaded).toEqual(['file1']);
    const mirror = result.localPath ?? '';
    expect(existsSync(path.join(mirror, 'Proposal.docx'))).toBe(true);
    expect(existsSync(path.join(mirror, 'Budget.xlsx'))).toBe(true);
    expect(existsSync(path.join(mirror, 'notes.txt'))).toBe(true);
    expect(readFileSync(path.join(mirror, 'Proposal.docx'), 'utf8')).toContain('exported:doc1');
  });
});
