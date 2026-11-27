import { describe, expect, test } from 'bun:test';
import { defineAddon } from '../define-addon.ts';
import type { FakeHostOptions } from './fake-host.ts';
import { createFakeHost } from './fake-host.ts';
import { toolPackManifest } from './fixtures.ts';

function filesHost(overrides?: Partial<FakeHostOptions>) {
  return createFakeHost({
    definition: defineAddon({ tools: {} }),
    manifest: toolPackManifest([]),
    grants: [{ id: 'files.locate' }, { id: 'files.read' }, { id: 'files.write' }],
    ...overrides,
  });
}

describe('fake host files service', () => {
  test('files.locate workspace root round-trips with workspace-relative keys', async () => {
    const host = filesHost();
    const root = (await host.service('files.locate', { scope: 'workspace' })) as { path: string };
    expect(root.path).toBe('/fake-host/workspace');
    const data = Buffer.from('hello').toString('base64');
    await host.service('files.write', { path: 'notes/a.txt', data });
    const composed = (await host.service('files.stat', {
      path: `${root.path}/notes/a.txt`,
    })) as { path: string; size: number };
    expect(composed).toMatchObject({ path: `${root.path}/notes/a.txt`, size: 5 });
    await host.service('files.write', { path: `${root.path}/notes/b.txt`, data });
    const rel = (await host.service('files.read', { path: 'notes/b.txt' })) as {
      data: string;
      size: number;
    };
    expect(rel.size).toBe(5);
    expect(Buffer.from(rel.data, 'base64').toString()).toBe('hello');
    host.close();
  });

  test('files.locate thread scope requires a thread context', async () => {
    await expect(filesHost().service('files.locate', { scope: 'thread' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
    const host = filesHost({ threadId: 't-9' });
    const located = (await host.service('files.locate', { scope: 'thread' })) as { path: string };
    expect(located.path).toBe('/fake-host/threads/t-9');
    host.close();
  });
});
