import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ThreadPolicy } from '../../domain/thread/thread-policy.ts';
import { CONTEXT_FILE_MAX_CHARS, resolveContextFiles } from './context-files-note.ts';

let root = '';

const policyWith = (...paths: string[]): ThreadPolicy => ({
  version: 2,
  contextFiles: paths.map((path) => ({ path, enabled: true })),
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'context-files-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveContextFiles', () => {
  it('injects an existing file as a ranked block', () => {
    writeFileSync(join(root, 'AGENTS.md'), '# Rules\nBe nice.\n');
    const result = resolveContextFiles(policyWith('AGENTS.md'), root);
    expect(result.note).toContain('The following project files are injected for this run');
    expect(result.note).toContain('<file path="AGENTS.md">');
    expect(result.note).toContain('Be nice.');
    expect(result.entries).toEqual([{ path: 'AGENTS.md', chars: 16 }]);
  });

  it('keeps rank order across several files', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'first');
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'rules.md'), 'second');
    const result = resolveContextFiles(policyWith('AGENTS.md', 'docs/rules.md'), root);
    expect(result.entries.map((entry) => entry.path)).toEqual(['AGENTS.md', 'docs/rules.md']);
    const note = result.note ?? '';
    expect(note.indexOf('AGENTS.md')).toBeLessThan(note.indexOf('docs/rules.md'));
  });

  it('defaults to AGENTS.md when the policy has no list', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'default rules');
    const result = resolveContextFiles({ version: 2 }, root);
    expect(result.note).toContain('default rules');
  });

  it('injects nothing for an explicit empty list', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'default rules');
    const result = resolveContextFiles({ version: 2, contextFiles: [] }, root);
    expect(result.note).toBeUndefined();
    expect(result.entries).toEqual([]);
  });

  it('skips a disabled row without reading it', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'ignored');
    const result = resolveContextFiles(
      { version: 2, contextFiles: [{ path: 'AGENTS.md', enabled: false }] },
      root,
    );
    expect(result.note).toBeUndefined();
    expect(result.entries).toEqual([]);
  });

  it('reports a missing file and still returns later entries', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'present');
    const result = resolveContextFiles(policyWith('MISSING.md', 'AGENTS.md'), root);
    expect(result.entries[0]).toEqual({ path: 'MISSING.md', chars: 0, skipped: 'missing' });
    expect(result.entries[1]).toEqual({ path: 'AGENTS.md', chars: 7 });
    expect(result.note).toContain('present');
    expect(result.note).not.toContain('MISSING.md');
  });

  it('returns no note when every file is skipped, but keeps the entries', () => {
    const result = resolveContextFiles(policyWith('MISSING.md'), root);
    expect(result.note).toBeUndefined();
    expect(result.entries).toEqual([{ path: 'MISSING.md', chars: 0, skipped: 'missing' }]);
  });

  it('refuses paths that resolve outside the run root', () => {
    const result = resolveContextFiles(policyWith('../outside.md'), root);
    expect(result.entries[0]?.skipped).toBe('outside-root');
    expect(result.note).toBeUndefined();
  });

  it('refuses a symlink that escapes the run root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'context-outside-'));
    writeFileSync(join(outside, 'secret.md'), 'leaked');
    symlinkSync(join(outside, 'secret.md'), join(root, 'link.md'));
    try {
      const result = resolveContextFiles(policyWith('link.md'), root);
      expect(result.entries[0]?.skipped).toBe('outside-root');
      expect(result.note).toBeUndefined();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('blocks blocklisted paths such as .env', () => {
    writeFileSync(join(root, '.env'), 'TOKEN=1');
    const result = resolveContextFiles(policyWith('.env'), root);
    expect(result.entries[0]?.skipped).toBe('blocked');
    expect(result.note).toBeUndefined();
  });

  it('skips an empty file', () => {
    writeFileSync(join(root, 'empty.md'), '');
    const result = resolveContextFiles(policyWith('empty.md'), root);
    expect(result.entries[0]?.skipped).toBe('empty');
  });

  it('skips a binary file', () => {
    writeFileSync(join(root, 'blob.md'), Buffer.from([0x41, 0x00, 0x42]));
    const result = resolveContextFiles(policyWith('blob.md'), root);
    expect(result.entries[0]?.skipped).toBe('binary');
  });

  it('skips a directory with a dedicated reason', () => {
    mkdirSync(join(root, 'notes'));
    const result = resolveContextFiles(policyWith('notes'), root);
    expect(result.entries[0]?.skipped).toBe('not-a-file');
  });

  it('truncates a huge file and still injects the head', () => {
    writeFileSync(join(root, 'big.md'), 'x'.repeat(CONTEXT_FILE_MAX_CHARS + 500));
    const result = resolveContextFiles(policyWith('big.md'), root);
    expect(result.entries[0]?.skipped).toBe('truncated');
    expect(result.note).toContain('[truncated]');
  });

  it('drops the lowest-ranked file once the total budget is spent', () => {
    const half = Math.ceil(CONTEXT_FILE_MAX_CHARS * 0.9);
    writeFileSync(join(root, 'a.md'), 'a'.repeat(half));
    writeFileSync(join(root, 'b.md'), 'b'.repeat(half));
    writeFileSync(join(root, 'c.md'), 'c'.repeat(half));
    const result = resolveContextFiles(policyWith('a.md', 'b.md', 'c.md'), root);
    const skipped = result.entries.filter((entry) => entry.skipped === 'budget');
    expect(skipped.length).toBeGreaterThan(0);
    expect(result.note).toBeDefined();
  });

  it('never throws when the root is gone', () => {
    rmSync(root, { recursive: true, force: true });
    const result = resolveContextFiles(policyWith('AGENTS.md'), root);
    expect(result.note).toBeUndefined();
    expect(result.entries).toEqual([{ path: 'AGENTS.md', chars: 0, skipped: 'missing' }]);
  });
});
