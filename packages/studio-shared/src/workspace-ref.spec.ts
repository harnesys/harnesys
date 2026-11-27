import { describe, expect, test } from 'bun:test';
import type { WorkspaceRef } from '@harnesys/contracts';
import {
  resolveEnvironment,
  type WorkspaceLayer,
  type WorkspaceLayerOrigin,
} from './workspace-ref.ts';

function layer(origin: WorkspaceLayerOrigin, ref: WorkspaceRef | null): WorkspaceLayer {
  return { origin, ref };
}

const SOURCE: WorkspaceRef = { kind: 'source', sourceId: 'src-1' };
const SOURCE_API: WorkspaceRef = { kind: 'source', sourceId: 'src-1', subpath: 'api' };
const SOURCE_OTHER: WorkspaceRef = { kind: 'source', sourceId: 'src-2', subpath: 'web' };
const WORKTREE: WorkspaceRef = { kind: 'worktree', sourceId: 'src-1', worktreeId: 'wt-1' };

describe('resolveEnvironment', () => {
  test('run layer wins over thread and agent', () => {
    const environment = resolveEnvironment({
      layers: [layer('run', WORKTREE), layer('thread', SOURCE_API), layer('agent', SOURCE_OTHER)],
      issue: false,
    });
    expect(environment.provenance).toBe('run');
    expect(environment.anchor).toEqual({ kind: 'source', sourceId: 'src-1', worktreeId: 'wt-1' });
    expect(environment.cwd).toBe('anchor');
  });

  test('inherit makes the thread layer transparent', () => {
    const environment = resolveEnvironment({
      layers: [layer('thread', { kind: 'inherit' }), layer('agent', SOURCE_API)],
      issue: false,
    });
    expect(environment.provenance).toBe('agent');
    expect(environment.anchor).toEqual({ kind: 'source', sourceId: 'src-1' });
    expect(environment.subpath).toBe('api');
  });

  test('explicit thread ref on the thread wins over the agent default', () => {
    const environment = resolveEnvironment({
      layers: [layer('thread', { kind: 'thread' }), layer('agent', SOURCE_API)],
      issue: false,
    });
    expect(environment.provenance).toBe('thread');
    expect(environment.anchor).toBeNull();
    expect(environment.cwd).toBe('thread');
  });

  test('agent subpath composes onto an issue worktree of the same source', () => {
    const environment = resolveEnvironment({
      layers: [layer('run', WORKTREE), layer('agent', SOURCE_API)],
      issue: false,
    });
    expect(environment.anchor).toEqual({ kind: 'source', sourceId: 'src-1', worktreeId: 'wt-1' });
    expect(environment.subpath).toBe('api');
  });

  test('subpath does not compose across different sources', () => {
    const environment = resolveEnvironment({
      layers: [layer('run', WORKTREE), layer('agent', SOURCE_OTHER)],
      issue: false,
    });
    expect(environment.subpath).toBeUndefined();
  });

  test('subpath does not compose onto a folder anchor', () => {
    const environment = resolveEnvironment({
      layers: [layer('run', { kind: 'folder', path: '/srv/legacy' }), layer('agent', SOURCE_API)],
      issue: false,
    });
    expect(environment.anchor).toEqual({ kind: 'folder', path: '/srv/legacy' });
    expect(environment.subpath).toBeUndefined();
  });

  test('run-layer source runs in the checkout only for issue runs', () => {
    const issue = resolveEnvironment({ layers: [layer('run', SOURCE)], issue: true });
    expect(issue.cwd).toBe('anchor');
    expect(issue.anchor).toEqual({ kind: 'source', sourceId: 'src-1' });
    const chat = resolveEnvironment({ layers: [layer('run', SOURCE)], issue: false });
    expect(chat.cwd).toBe('thread');
  });

  test('thread-layer source keeps anchor cwd for every run kind', () => {
    const environment = resolveEnvironment({
      layers: [layer('thread', SOURCE_API)],
      issue: false,
    });
    expect(environment.cwd).toBe('anchor');
  });

  test('empty layers fall back to the thread directory', () => {
    const environment = resolveEnvironment({ layers: [layer('thread', null)], issue: false });
    expect(environment.anchor).toBeNull();
    expect(environment.cwd).toBe('thread');
    expect(environment.provenance).toBe('fallback');
  });

  test('branch is carried through to the environment', () => {
    const environment = resolveEnvironment({
      layers: [layer('run', SOURCE)],
      issue: false,
      branch: 'feat/x',
    });
    expect(environment.branch).toBe('feat/x');
  });
});
