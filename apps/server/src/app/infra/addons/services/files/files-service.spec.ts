import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostCallContext } from '../../../../domain/addons/host-service.ts';
import { FakeLayout } from '../../catalog/fake-layout.ts';
import { FilesHostService } from './files-service.ts';

const layout = new FakeLayout();
const service = new FilesHostService(layout);
const read = service.methods.find((method) => method.name === 'files.read');
const stat = service.methods.find((method) => method.name === 'files.stat');

const threadId = 't-1';

afterEach(() => {
  rmSync(join(layout.root, 'orgs', 'org1', 'threads', threadId), { recursive: true, force: true });
});

function ctxWithThread(): HostCallContext {
  return {
    orgId: 'org1',
    addonId: 'addon1',
    instanceId: 'inst1',
    generation: 1,
    correlationId: 'corr-1',
    threadId,
    grants: [],
    now: () => 0,
    signal: new AbortController().signal,
  };
}

function ctxWithoutThread(): HostCallContext {
  const { threadId: _omit, ...rest } = ctxWithThread();
  void _omit;
  return rest;
}

function seedThreadFile(relative: string, content: string): void {
  const absolute = join(layout.threadDir('org1', threadId), relative);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
}

describe('files service thread scope', () => {
  test('reads a thread-scoped file with thread: prefix', async () => {
    seedThreadFile('sandbox/photo.jpg', 'jpeg-bytes');
    const result = (await read?.handle(ctxWithThread(), {
      path: 'thread:sandbox/photo.jpg',
    })) as { data: string; eof: boolean; mediaType: string };
    expect(Buffer.from(result?.data ?? '', 'base64').toString('utf8')).toBe('jpeg-bytes');
    expect(result?.eof).toBe(true);
    expect(result?.mediaType).toBe('image/jpeg');
  });

  test('stats a thread-scoped file with thread: prefix', async () => {
    seedThreadFile('attachments/a-1/flag.png', 'png');
    const result = (await stat?.handle(ctxWithThread(), {
      path: 'thread:attachments/a-1/flag.png',
    })) as { name: string; mediaType: string; size: number };
    expect(result?.name).toBe('flag.png');
    expect(result?.mediaType).toBe('image/png');
    expect(result?.size).toBe(3);
  });

  test('rejects thread: prefix without a thread context', async () => {
    await expect(
      read?.handle(ctxWithoutThread(), { path: 'thread:sandbox/photo.jpg' }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });

  test('rejects thread paths escaping the thread directory', async () => {
    seedThreadFile('sandbox/photo.jpg', 'jpeg-bytes');
    await expect(
      read?.handle(ctxWithThread(), { path: 'thread:../../secrets.txt' }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });

  test('reads any absolute host path without a jail', async () => {
    const outside = join(layout.root, 'outside-secret.txt');
    writeFileSync(outside, 'host-file');
    const result = (await read?.handle(ctxWithoutThread(), { path: outside })) as {
      data: string;
      eof: boolean;
    };
    expect(Buffer.from(result?.data ?? '', 'base64').toString('utf8')).toBe('host-file');
    expect(result?.eof).toBe(true);
  });

  test('plain paths still resolve against the org workspace', async () => {
    const workspace = layout.ensureOrgWorkspace('org1');
    writeFileSync(join(workspace, 'note.txt'), 'workspace');
    const result = (await read?.handle(ctxWithoutThread(), { path: 'note.txt' })) as {
      data: string;
    };
    expect(Buffer.from(result?.data ?? '', 'base64').toString('utf8')).toBe('workspace');
  });
});
