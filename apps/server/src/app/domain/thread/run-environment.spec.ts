import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { RunEnvironment } from '@harnesys/contracts';
import {
  assertFolderAllowed,
  assertRelativeSubpath,
  materializePrimary,
} from './run-environment.ts';

const ROOT = '/data/orgs/org-1/sources/src-1';
const THREAD_DIR = '/data/orgs/org-1/threads/thread-1';

function environment(partial: Partial<RunEnvironment>): RunEnvironment {
  return { anchor: null, cwd: 'sandbox', provenance: 'fallback', ...partial };
}

describe('assertRelativeSubpath', () => {
  test('accepts a nested relative subpath', () => {
    expect(() => assertRelativeSubpath('apps/web')).not.toThrow();
  });

  test('rejects a path escaping the root', () => {
    expect(() => assertRelativeSubpath('../other')).toThrow('workspace subpath escapes');
  });

  test('rejects an absolute subpath', () => {
    expect(() => assertRelativeSubpath('/etc')).toThrow('workspace subpath must be relative');
  });
});

describe('assertFolderAllowed', () => {
  const PROTECTED = ['/home/user/data/orgs', '/home/user/orgs'];

  test('rejects a protected root itself', () => {
    expect(() => assertFolderAllowed(PROTECTED, '/home/user/orgs')).toThrow(
      'workspace folder must be outside protected roots',
    );
  });

  test('rejects the org database tree', () => {
    expect(() => assertFolderAllowed(PROTECTED, '/home/user/orgs/org-1/org.db')).toThrow(
      'workspace folder must be outside protected roots',
    );
  });

  test('rejects system roots', () => {
    expect(() => assertFolderAllowed(PROTECTED, '/')).toThrow(
      'workspace folder must be outside protected roots',
    );
    expect(() => assertFolderAllowed(PROTECTED, '/etc')).toThrow(
      'workspace folder must be outside protected roots',
    );
  });

  test('accepts a project folder', () => {
    expect(() => assertFolderAllowed(PROTECTED, '/srv/project')).not.toThrow();
  });
});

describe('materializePrimary', () => {
  test('sandbox cwd runs inside the thread dir', () => {
    const primary = materializePrimary(environment({ cwd: 'sandbox' }), {
      anchorRoot: null,
      threadDir: THREAD_DIR,
    });
    expect(primary).toEqual({ primaryDirectory: THREAD_DIR, primaryKind: 'sandbox' });
  });

  test('folder anchor maps to a directory primary', () => {
    const primary = materializePrimary(
      environment({
        anchor: { kind: 'folder', path: '/srv/project' },
        cwd: 'anchor',
        provenance: 'run',
      }),
      { anchorRoot: '/srv/project', threadDir: THREAD_DIR },
    );
    expect(primary).toEqual({ primaryDirectory: '/srv/project', primaryKind: 'directory' });
  });

  test('source anchor maps to a source primary joined with the subpath', () => {
    const primary = materializePrimary(
      environment({
        anchor: { kind: 'source', sourceId: 'src-1' },
        cwd: 'anchor',
        subpath: 'apps/web',
        provenance: 'thread',
      }),
      { anchorRoot: ROOT, threadDir: THREAD_DIR },
    );
    expect(primary).toEqual({ primaryDirectory: join(ROOT, 'apps/web'), primaryKind: 'source' });
  });

  test('worktree anchor maps to a worktree primary', () => {
    const primary = materializePrimary(
      environment({
        anchor: { kind: 'source', sourceId: 'src-1', worktreeId: 'wt-1' },
        cwd: 'anchor',
        provenance: 'run',
      }),
      { anchorRoot: ROOT, threadDir: THREAD_DIR },
    );
    expect(primary).toEqual({ primaryDirectory: ROOT, primaryKind: 'worktree' });
  });

  test('container source anchor with sandbox cwd runs inside the thread dir', () => {
    const primary = materializePrimary(
      environment({
        anchor: { kind: 'source', sourceId: 'src-1' },
        cwd: 'sandbox',
        provenance: 'run',
      }),
      { anchorRoot: ROOT, threadDir: THREAD_DIR },
    );
    expect(primary).toEqual({ primaryDirectory: THREAD_DIR, primaryKind: 'sandbox' });
  });
});
