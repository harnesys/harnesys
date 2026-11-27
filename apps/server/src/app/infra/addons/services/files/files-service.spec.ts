import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostCallContext } from '../../../../domain/addons/host-service.ts';
import type { ThreadRunEvent } from '../../../../domain/thread/thread-events.port.ts';
import { ThreadEventsPort } from '../../../../domain/thread/thread-events.port.ts';
import { FakeLayout } from '../../catalog/fake-layout.ts';
import { FilesHostService } from './files-service.ts';

class RecordingThreadEvents extends ThreadEventsPort {
  readonly emits: ThreadRunEvent[] = [];
  subscribe(): () => void {
    return () => {};
  }
  emit(_orgId: string, event: ThreadRunEvent): void {
    this.emits.push(event);
  }
}

const layout = new FakeLayout();
const events = new RecordingThreadEvents();
const service = new FilesHostService(layout, events);
const read = service.methods.find((method) => method.name === 'files.read');
const stat = service.methods.find((method) => method.name === 'files.stat');
const write = service.methods.find((method) => method.name === 'files.write');
const locate = service.methods.find((method) => method.name === 'files.locate');

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

function seedThreadFile(relative: string, content: string): string {
  const absolute = join(layout.threadDir('org1', threadId), relative);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

describe('files service anchors', () => {
  test('locate thread returns the absolute thread dir', async () => {
    const result = (await locate?.handle(ctxWithThread(), { scope: 'thread' })) as {
      path: string;
    };
    expect(result.path).toBe(layout.threadDir('org1', threadId));
  });

  test('locate thread without a thread context is rejected', async () => {
    await expect(locate?.handle(ctxWithoutThread(), { scope: 'thread' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('locate workspace returns the absolute org workspace', async () => {
    const result = (await locate?.handle(ctxWithoutThread(), { scope: 'workspace' })) as {
      path: string;
    };
    expect(result.path).toBe(layout.ensureOrgWorkspace('org1'));
  });

  test('reads an absolute path and echoes it resolved', async () => {
    const absolute = seedThreadFile('sandbox/photo.jpg', 'jpeg-bytes');
    const result = (await read?.handle(ctxWithThread(), { path: absolute })) as {
      data: string;
      eof: boolean;
      mediaType: string;
    };
    expect(Buffer.from(result?.data ?? '', 'base64').toString('utf8')).toBe('jpeg-bytes');
    expect(result?.eof).toBe(true);
    expect(result?.mediaType).toBe('image/jpeg');
  });

  test('stats an absolute path and echoes the absolute path', async () => {
    const absolute = seedThreadFile('attachments/a-1/flag.png', 'png');
    const result = (await stat?.handle(ctxWithThread(), { path: absolute })) as {
      path: string;
      name: string;
      mediaType: string;
      size: number;
    };
    expect(result?.path).toBe(absolute);
    expect(result?.name).toBe('flag.png');
    expect(result?.mediaType).toBe('image/png');
    expect(result?.size).toBe(3);
  });

  test('rejects an absolute path on the default blocklist', async () => {
    const secret = seedThreadFile('sandbox/id_ed25519', 'key-bytes');
    await expect(read?.handle(ctxWithThread(), { path: secret })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('rejects paths with embedded NUL bytes', async () => {
    await expect(read?.handle(ctxWithThread(), { path: 'sandbox/a\0b' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('plain paths still resolve against the org workspace', async () => {
    const workspace = layout.ensureOrgWorkspace('org1');
    writeFileSync(join(workspace, 'note.txt'), 'workspace');
    const result = (await read?.handle(ctxWithoutThread(), { path: 'note.txt' })) as {
      data: string;
    };
    expect(Buffer.from(result?.data ?? '', 'base64').toString('utf8')).toBe('workspace');
  });

  test('relative writes echo a workspace-relative path, absolute writes echo absolute', async () => {
    const relResult = (await write?.handle(ctxWithoutThread(), {
      path: 'out/rel.txt',
      data: Buffer.from('rel').toString('base64'),
    })) as { path: string; size: number };
    expect(relResult.path).toBe('out/rel.txt');
    expect(relResult.size).toBe(3);

    const target = join(layout.threadDir('org1', threadId), 'tool-outputs', 'spill.json');
    const absResult = (await write?.handle(ctxWithThread(), {
      path: target,
      data: Buffer.from('{}').toString('base64'),
    })) as { path: string; size: number };
    expect(absResult.path).toBe(target);
    expect(await Bun.file(target).text()).toBe('{}');
  });

  test('a write under a thread root emits files-changed for that root', async () => {
    const before = events.emits.length;
    const target = join(layout.threadDir('org1', threadId), 'sandbox', 'live.md');
    await write?.handle(ctxWithThread(), {
      path: target,
      data: Buffer.from('live').toString('base64'),
    });
    const changed = events.emits
      .slice(before)
      .flatMap((event) => (event.type === 'files-changed' ? [event] : []));
    expect(changed).toHaveLength(1);
    expect(changed[0]?.threadId).toBe(threadId);
    expect(changed[0]?.roots).toEqual(['thread']);
  });
});
