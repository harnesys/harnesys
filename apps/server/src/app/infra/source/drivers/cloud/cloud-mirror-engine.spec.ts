import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CloudRemoteBackendPort,
  type CloudRemoteEntry,
  type CloudRemoteUploadInput,
  type CloudRemoteUploadResult,
} from '../../../../domain/source/cloud-remote-backend.port.ts';
import {
  conflictLocalName,
  ensureMirrorRoot,
  hydratePath,
  readMirrorMeta,
  writeMirrorMeta,
} from './cloud-mirror-engine.ts';
import { syncBackFile } from './cloud-mirror-sync.ts';

class FakeBackend extends CloudRemoteBackendPort {
  readonly vendor = 'google' as const;
  private seq = 0;
  readonly files = new Map<
    string,
    { name: string; parentId: string; content: Uint8Array; modifiedAt: string; mimeType?: string }
  >();
  readonly folders = new Map<string, { name: string; parentId: string }>();

  constructor() {
    super();
    this.folders.set('root', { name: 'root', parentId: '' });
  }

  async listChildren(folderId: string): Promise<CloudRemoteEntry[]> {
    const out: CloudRemoteEntry[] = [];
    for (const [id, folder] of this.folders) {
      if (folder.parentId === folderId && id !== 'root') {
        out.push({ id, name: folder.name, kind: 'folder' });
      }
    }
    for (const [id, file] of this.files) {
      if (file.parentId === folderId) {
        out.push({
          id,
          name: file.name,
          kind: 'file',
          size: file.content.byteLength,
          modifiedAt: file.modifiedAt,
          mimeType: file.mimeType,
        });
      }
    }
    return out;
  }

  async download(fileId: string): Promise<Uint8Array> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`missing ${fileId}`);
    }
    return file.content;
  }

  async upload(input: CloudRemoteUploadInput): Promise<CloudRemoteUploadResult> {
    const modifiedAt = new Date().toISOString();
    if (input.fileId && this.files.has(input.fileId)) {
      const prev = this.files.get(input.fileId);
      if (!prev) {
        throw new Error('missing');
      }
      this.files.set(input.fileId, {
        ...prev,
        content: input.content,
        modifiedAt,
        mimeType: input.mimeType ?? prev.mimeType,
      });
      return { id: input.fileId, name: input.name, modifiedAt };
    }
    this.seq += 1;
    const id = `f${this.seq}`;
    this.files.set(id, {
      name: input.name,
      parentId: input.parentId,
      content: input.content,
      modifiedAt,
      mimeType: input.mimeType,
    });
    return { id, name: input.name, modifiedAt };
  }

  async createFolder(input: {
    parentId: string;
    name: string;
  }): Promise<{ id: string; name: string }> {
    this.seq += 1;
    const id = `d${this.seq}`;
    this.folders.set(id, { name: input.name, parentId: input.parentId });
    return { id, name: input.name };
  }

  async delete(fileId: string): Promise<void> {
    this.files.delete(fileId);
    this.folders.delete(fileId);
  }

  async getMetadata(fileId: string): Promise<CloudRemoteEntry> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`missing ${fileId}`);
    }
    return {
      id: fileId,
      name: file.name,
      kind: 'file',
      size: file.content.byteLength,
      modifiedAt: file.modifiedAt,
      mimeType: file.mimeType,
    };
  }

  seedFile(parentId: string, name: string, content: string, modifiedAt: string): string {
    this.seq += 1;
    const id = `f${this.seq}`;
    this.files.set(id, {
      name,
      parentId,
      content: new TextEncoder().encode(content),
      modifiedAt,
      mimeType: 'text/plain',
    });
    return id;
  }
}

describe('cloud-mirror-engine', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-mirror-'));

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('conflictLocalName embeds timestamp', () => {
    const at = new Date('2026-10-01T12:00:00.000Z');
    expect(conflictLocalName('notes.md', at)).toBe('notes (conflict, 2026-10-01T12-00-00-000Z).md');
    expect(conflictLocalName('README', at)).toBe('README (conflict, 2026-10-01T12-00-00-000Z)');
  });

  test('hydratePath downloads file into mirror', async () => {
    const backend = new FakeBackend();
    const remoteId = backend.seedFile('root', 'a.txt', 'hello', '2026-01-01T00:00:00.000Z');
    const mirror = ensureMirrorRoot(join(home, 'src-hydrate'));
    await hydratePath({ backend, mirror, relativePath: 'a.txt', remoteId, kind: 'file' });
    expect(readFileSync(join(mirror, 'a.txt'), 'utf8')).toBe('hello');
    expect(readMirrorMeta(mirror, 'a.txt')?.remoteId).toBe(remoteId);
  });

  test('syncBack uploads when remote unchanged', async () => {
    const backend = new FakeBackend();
    const remoteId = backend.seedFile('root', 'a.txt', 'old', '2026-01-01T00:00:00.000Z');
    const mirror = ensureMirrorRoot(join(home, 'src-upload'));
    writeMirrorMeta(mirror, 'a.txt', {
      remoteId,
      kind: 'file',
      remoteModifiedAt: '2026-01-01T00:00:00.000Z',
      mimeType: 'text/plain',
    });
    const result = await syncBackFile({
      backend,
      mirror,
      relativePath: 'a.txt',
      parentRemoteId: 'root',
      localBytes: new TextEncoder().encode('new'),
    });
    expect(result.status).toBe('uploaded');
    expect(readFileSync(join(mirror, 'a.txt'), 'utf8')).toBe('new');
    expect(new TextDecoder().decode(await backend.download(remoteId))).toBe('new');
  });

  test('syncBack keep-both when remote diverged', async () => {
    const backend = new FakeBackend();
    const remoteId = backend.seedFile('root', 'a.txt', 'remote-newer', '2026-02-01T00:00:00.000Z');
    const mirror = ensureMirrorRoot(join(home, 'src-conflict'));
    writeMirrorMeta(mirror, 'a.txt', {
      remoteId,
      kind: 'file',
      remoteModifiedAt: '2026-01-01T00:00:00.000Z',
      mimeType: 'text/plain',
    });
    const result = await syncBackFile({
      backend,
      mirror,
      relativePath: 'a.txt',
      parentRemoteId: 'root',
      localBytes: new TextEncoder().encode('local-edit'),
    });
    expect(result.status).toBe('keep-both');
    expect(result.conflictPath).toBeTruthy();
    expect(readFileSync(join(mirror, 'a.txt'), 'utf8')).toBe('remote-newer');
    expect(readFileSync(join(mirror, result.conflictPath ?? ''), 'utf8')).toBe('local-edit');
    expect(new TextDecoder().decode(await backend.download(remoteId))).toBe('remote-newer');
    expect(
      [...backend.files.values()].some(
        (file) =>
          file.name.includes('(conflict') &&
          new TextDecoder().decode(file.content) === 'local-edit',
      ),
    ).toBe(true);
  });

  test('syncBack revision-unknown when metadata missing', async () => {
    const backend = new FakeBackend();
    const remoteId = backend.seedFile('root', 'a.txt', 'remote', '2026-02-01T00:00:00.000Z');
    const mirror = ensureMirrorRoot(join(home, 'src-unknown'));
    writeMirrorMeta(mirror, 'a.txt', {
      remoteId,
      kind: 'file',
      mimeType: 'text/plain',
    });
    const result = await syncBackFile({
      backend,
      mirror,
      relativePath: 'a.txt',
      parentRemoteId: 'root',
      localBytes: new TextEncoder().encode('local-edit'),
    });
    expect(result.status).toBe('revision-unknown');
    expect(result.errorCode).toBe('CLOUD_REVISION_UNKNOWN');
    expect(readFileSync(join(mirror, 'a.txt'), 'utf8')).toBe('local-edit');
    expect(new TextDecoder().decode(await backend.download(remoteId))).toBe('remote');
  });
});
