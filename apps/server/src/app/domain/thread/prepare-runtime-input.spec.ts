import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { RunEnvironment } from '@harnesys/contracts';
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

function environment(partial: Partial<RunEnvironment>): RunEnvironment {
  return { anchor: null, cwd: 'sandbox', provenance: 'fallback', ...partial };
}

const SANDBOX = join(ROOT, 'org-1', 'thread-1', 'sandbox');

describe('resolveRuntimePrimary', () => {
  test('chat thread with a folder environment runs in that directory', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({
        anchor: { kind: 'folder', path: '/srv/project' },
        cwd: 'anchor',
        provenance: 'run',
      }),
    });
    expect(primary.primaryKind).toBe('directory');
    expect(primary.primaryDirectory).toBe('/srv/project');
    expect(primary.threadSandbox).toBe(SANDBOX);
  });

  test('empty environment falls back to the thread sandbox', () => {
    expect(resolveRuntimePrimary(deps())).toEqual({
      primaryDirectory: SANDBOX,
      primaryKind: 'sandbox',
      threadSandbox: SANDBOX,
    });
    expect(
      resolveRuntimePrimary(deps(), {
        environment: environment({ anchor: null, cwd: 'sandbox', provenance: 'agent' }),
      }),
    ).toEqual({ primaryDirectory: SANDBOX, primaryKind: 'sandbox', threadSandbox: SANDBOX });
  });

  test('issue worktree environment runs in the worktree root', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({
        anchor: { kind: 'source', sourceId: 'src-1', worktreeId: 'wt-1' },
        cwd: 'anchor',
        provenance: 'run',
      }),
    });
    const root = join(ROOT, 'sources', 'src-1');
    expect(primary.primaryKind).toBe('worktree');
    expect(primary.primaryDirectory).toBe(root);
    expect(primary.activeWorktree).toEqual({
      worktreeId: 'wt-1',
      sourceId: 'src-1',
      hostId: 'host-1',
      root,
    });
    expect(primary.primarySourceId).toBeUndefined();
  });

  test('issue source environment runs in the source root', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({
        anchor: { kind: 'source', sourceId: 'src-1' },
        cwd: 'anchor',
        provenance: 'run',
      }),
    });
    expect(primary.primaryKind).toBe('source');
    expect(primary.primaryDirectory).toBe(join(ROOT, 'sources', 'src-1'));
    expect(primary.primarySourceId).toBe('src-1');
    expect(primary.activeWorktree).toBeUndefined();
  });

  test('container source environment keeps the sandbox primary with an anchor present', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({
        anchor: { kind: 'source', sourceId: 'src-1' },
        cwd: 'sandbox',
        provenance: 'run',
      }),
    });
    expect(primary.primaryKind).toBe('sandbox');
    expect(primary.primaryDirectory).toBe(SANDBOX);
    expect(primary.primarySourceId).toBeUndefined();
  });

  test('schedule sandbox environment runs in the thread sandbox', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({ anchor: null, cwd: 'sandbox', provenance: 'run' }),
    });
    expect(primary.primaryKind).toBe('sandbox');
    expect(primary.primaryDirectory).toBe(SANDBOX);
    expect(primary.threadSandbox).toBe(SANDBOX);
  });

  test('source subpath is joined onto the source root', () => {
    const primary = resolveRuntimePrimary(deps(), {
      environment: environment({
        anchor: { kind: 'source', sourceId: 'src-1' },
        cwd: 'anchor',
        subpath: 'apps/web',
        provenance: 'thread',
      }),
    });
    expect(primary.primaryKind).toBe('source');
    expect(primary.primaryDirectory).toBe(join(ROOT, 'sources', 'src-1', 'apps/web'));
  });
});
