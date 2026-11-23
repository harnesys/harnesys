import { describe, expect, test } from 'bun:test';
import {
  mapLegacyDirectory,
  parseWorkspaceRef,
  projectLegacyRunDirectory,
} from './legacy-workspace-ref.ts';
import { threadPatchUpdates } from './thread-patch-updates.ts';

const sourceRoots = [
  { sourceId: 'src-api', root: '/srv/sources/api' },
  { sourceId: 'src-web', root: '/srv/sources/web' },
];

describe('mapLegacyDirectory', () => {
  test('maps a directory equal to a source root to a bare source ref', () => {
    expect(mapLegacyDirectory({ runDirectory: '/srv/sources/api', sourceRoots })).toEqual({
      kind: 'source',
      sourceId: 'src-api',
    });
  });

  test('maps a directory under a source root to a source ref with subpath', () => {
    expect(
      mapLegacyDirectory({ runDirectory: '/srv/sources/api/packages/core', sourceRoots }),
    ).toEqual({ kind: 'source', sourceId: 'src-api', subpath: 'packages/core' });
  });

  test('maps a directory outside every source root to a hostless folder ref', () => {
    expect(mapLegacyDirectory({ runDirectory: '/home/dev/scratch', sourceRoots })).toEqual({
      kind: 'folder',
      path: '/home/dev/scratch',
    });
  });

  test('ignores trailing slashes on both the directory and the source root', () => {
    expect(mapLegacyDirectory({ runDirectory: '/srv/sources/api/', sourceRoots })).toEqual({
      kind: 'source',
      sourceId: 'src-api',
    });
    expect(
      mapLegacyDirectory({
        runDirectory: '/srv/sources/api/packages/',
        sourceRoots: [{ sourceId: 'src-api', root: '/srv/sources/api/' }],
      }),
    ).toEqual({ kind: 'source', sourceId: 'src-api', subpath: 'packages' });
  });

  test('prefers the longest matching root for nested sources', () => {
    expect(
      mapLegacyDirectory({
        runDirectory: '/srv/sources/api/vendor/lib',
        sourceRoots: [...sourceRoots, { sourceId: 'src-vendor', root: '/srv/sources/api/vendor' }],
      }),
    ).toEqual({ kind: 'source', sourceId: 'src-vendor', subpath: 'lib' });
  });

  test('returns null for an empty directory', () => {
    expect(mapLegacyDirectory({ runDirectory: '  ', sourceRoots })).toBeNull();
  });
});

describe('projectLegacyRunDirectory', () => {
  test('projects source refs back to absolute paths', () => {
    expect(projectLegacyRunDirectory({ kind: 'source', sourceId: 'src-api' }, sourceRoots)).toBe(
      '/srv/sources/api',
    );
    expect(
      projectLegacyRunDirectory(
        { kind: 'source', sourceId: 'src-api', subpath: 'packages/core' },
        sourceRoots,
      ),
    ).toBe('/srv/sources/api/packages/core');
  });

  test('projects folder refs to their path', () => {
    expect(
      projectLegacyRunDirectory({ kind: 'folder', path: '/home/dev/scratch' }, sourceRoots),
    ).toBe('/home/dev/scratch');
  });

  test('returns null for sandbox, inherit, worktree, and unknown sources', () => {
    expect(projectLegacyRunDirectory({ kind: 'sandbox' }, sourceRoots)).toBeNull();
    expect(projectLegacyRunDirectory({ kind: 'inherit' }, sourceRoots)).toBeNull();
    expect(
      projectLegacyRunDirectory(
        { kind: 'worktree', sourceId: 'src-api', worktreeId: 'wt-1' },
        sourceRoots,
      ),
    ).toBeNull();
    expect(
      projectLegacyRunDirectory({ kind: 'source', sourceId: 'missing' }, sourceRoots),
    ).toBeNull();
    expect(projectLegacyRunDirectory(null, sourceRoots)).toBeNull();
  });
});

describe('parseWorkspaceRef', () => {
  test('parses valid stored json and rejects garbage', () => {
    expect(parseWorkspaceRef('{"kind":"sandbox"}')).toEqual({ kind: 'sandbox' });
    expect(parseWorkspaceRef('not json')).toBeNull();
    expect(parseWorkspaceRef('{"kind":"unknown"}')).toBeNull();
    expect(parseWorkspaceRef(null)).toBeNull();
  });
});

describe('threadPatchUpdates dual-write', () => {
  test('projects a source ref with subpath to the legacy column', () => {
    const updates = threadPatchUpdates(
      { workspaceRef: { kind: 'source', sourceId: 'src-api', subpath: 'apps' } },
      sourceRoots,
    );
    expect(updates.workspaceRef).toBe(
      JSON.stringify({ kind: 'source', sourceId: 'src-api', subpath: 'apps' }),
    );
    expect(updates.runDirectory).toBe('/srv/sources/api/apps');
  });

  test('leaves the legacy column untouched for worktree and sandbox refs', () => {
    const worktree = threadPatchUpdates(
      { workspaceRef: { kind: 'worktree', sourceId: 'src-api', worktreeId: 'wt-1' } },
      sourceRoots,
    );
    expect(worktree.runDirectory).toBeUndefined();
    const sandbox = threadPatchUpdates({ workspaceRef: { kind: 'sandbox' } }, sourceRoots);
    expect(sandbox.runDirectory).toBeUndefined();
  });

  test('projects a folder ref to its path', () => {
    const updates = threadPatchUpdates(
      { workspaceRef: { kind: 'folder', hostId: 'host-1', path: '/home/dev/app' } },
      sourceRoots,
    );
    expect(updates.runDirectory).toBe('/home/dev/app');
  });
});
