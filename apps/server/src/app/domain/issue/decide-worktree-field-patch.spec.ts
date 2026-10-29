import { describe, expect, test } from 'bun:test';
import { decideWorktreeFieldPatch } from './decide-worktree-field-patch.ts';

const current = { sourceId: 'src-a', branch: 'main' };

describe('decideWorktreeFieldPatch', () => {
  test('rejects any field change while a worktree is ready or creating', () => {
    const result = decideWorktreeFieldPatch({
      current,
      body: { sourceId: 'src-b' },
      activeWorktreeState: 'ready',
      sourceExists: () => true,
    });
    expect(result).toEqual({ kind: 'bound' });
    expect(
      decideWorktreeFieldPatch({
        current,
        body: { branch: 'dev' },
        activeWorktreeState: 'creating',
        sourceExists: () => true,
      }),
    ).toEqual({ kind: 'bound' });
  });

  test('resets the branch when the source changes without an explicit branch', () => {
    const result = decideWorktreeFieldPatch({
      current,
      body: { sourceId: 'src-b' },
      activeWorktreeState: null,
      sourceExists: (id) => id === 'src-b',
    });
    expect(result).toEqual({
      kind: 'ok',
      patch: { sourceId: 'src-b', branch: null },
    });
  });

  test('keeps an explicit branch provided in the same body as the source change', () => {
    const result = decideWorktreeFieldPatch({
      current,
      body: { sourceId: 'src-b', branch: 'feature/x' },
      activeWorktreeState: null,
      sourceExists: (id) => id === 'src-b',
    });
    expect(result).toEqual({
      kind: 'ok',
      patch: { sourceId: 'src-b', branch: 'feature/x' },
    });
  });

  test('rejects a source that does not exist in the org', () => {
    const result = decideWorktreeFieldPatch({
      current,
      body: { sourceId: 'src-ghost' },
      activeWorktreeState: null,
      sourceExists: () => false,
    });
    expect(result).toEqual({ kind: 'unknown-source', sourceId: 'src-ghost' });
  });

  test('patches only the branch when the source is unchanged', () => {
    const result = decideWorktreeFieldPatch({
      current,
      body: { branch: 'release/1' },
      activeWorktreeState: null,
      sourceExists: () => true,
    });
    expect(result).toEqual({ kind: 'ok', patch: { branch: 'release/1' } });
  });
});
