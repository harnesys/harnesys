import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { HostFsLayoutPort } from '../machine/host-fs-layout.port.ts';
import { SourceLocationPort } from '../source/source-location.port.ts';
import { resolveRuntimePrimary } from './prepare-runtime-input.ts';

const ROOT = '/data';

function createLayout(): HostFsLayoutPort {
  const layout: Pick<HostFsLayoutPort, 'threadDir'> = {
    threadDir: (orgId, threadId) => join(ROOT, orgId, threadId),
  };
  return layout as HostFsLayoutPort;
}

function createSourceLocation(): SourceLocationPort {
  const port: Pick<SourceLocationPort, 'resolve'> = {
    resolve: (input) => ({
      sourceId: input.sourceId,
      hostId: input.hostId,
      absoluteRoot: join(ROOT, 'sources', input.sourceId),
    }),
  };
  return port as SourceLocationPort;
}

function deps() {
  return {
    orgId: 'org-1',
    threadId: 'thread-1',
    layout: createLayout(),
    localHostId: 'host-1',
    sourceLocation: createSourceLocation(),
  };
}

describe('resolveRuntimePrimary', () => {
  test('issue trigger with a bound source runs in the source checkout root', () => {
    const primary = resolveRuntimePrimary(deps(), {
      triggerKind: 'issue',
      sourceId: 'src-1',
    });
    expect(primary.primaryKind).toBe('source');
    expect(primary.primaryDirectory).toBe(join(ROOT, 'sources', 'src-1'));
    expect(primary.threadSandbox).toBe(join(ROOT, 'org-1', 'thread-1', 'sandbox'));
    expect(primary.primarySourceId).toBe('src-1');
    expect(primary.activeWorktree).toBeUndefined();
  });

  test('chat trigger with a bound source keeps the thread sandbox as primary', () => {
    const primary = resolveRuntimePrimary(deps(), { triggerKind: 'chat', sourceId: 'src-1' });
    expect(primary.primaryKind).toBe('sandbox');
    expect(primary.primaryDirectory).toBe(join(ROOT, 'org-1', 'thread-1', 'sandbox'));
    expect(primary.primarySourceId).toBeUndefined();
  });

  test('schedule trigger without a directory falls back to the thread sandbox', () => {
    const primary = resolveRuntimePrimary(deps(), { triggerKind: 'schedule' });
    expect(primary.primaryKind).toBe('sandbox');
    expect(primary.primaryDirectory).toBe(join(ROOT, 'org-1', 'thread-1', 'sandbox'));
    expect(primary.threadSandbox).toBe(join(ROOT, 'org-1', 'thread-1', 'sandbox'));
  });

  test('directory option binds the primary to the given directory', () => {
    const primary = resolveRuntimePrimary(deps(), { directory: '/srv/project' });
    expect(primary.primaryKind).toBe('directory');
    expect(primary.primaryDirectory).toBe('/srv/project');
    expect(primary.threadSandbox).toBe(join(ROOT, 'org-1', 'thread-1', 'sandbox'));
  });
});
