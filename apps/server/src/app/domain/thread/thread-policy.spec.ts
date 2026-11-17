import { describe, expect, it } from 'bun:test';
import {
  contextFilesOf,
  DEFAULT_CONTEXT_FILES,
  normalizeContextFilePath,
  normalizeContextFiles,
} from './thread-policy.ts';

describe('contextFilesOf', () => {
  it('defaults to AGENTS.md when the policy never picked a list', () => {
    expect(contextFilesOf({ version: 2 })).toEqual(DEFAULT_CONTEXT_FILES);
  });

  it('keeps an explicit empty list: that is the opt-out', () => {
    expect(contextFilesOf({ version: 2, contextFiles: [] })).toEqual([]);
  });

  it('returns the stored list in rank order', () => {
    const contextFiles = [
      { path: 'docs/rules.md', enabled: true },
      { path: 'AGENTS.md', enabled: false },
    ];
    expect(contextFilesOf({ version: 2, contextFiles })).toEqual(contextFiles);
  });
});

describe('normalizeContextFilePath', () => {
  it('collapses backslashes, surrounding space, duplicate and trailing slashes', () => {
    expect(normalizeContextFilePath('  docs\\guide//rules.md/  ')).toBe('docs/guide/rules.md');
  });

  it('drops leading ./ segments', () => {
    expect(normalizeContextFilePath('./AGENTS.md')).toBe('AGENTS.md');
  });

  it('rejects absolute paths', () => {
    expect(normalizeContextFilePath('/etc/passwd')).toBeUndefined();
    expect(normalizeContextFilePath('C:\\secrets.txt')).toBeUndefined();
  });

  it('rejects traversal segments', () => {
    expect(normalizeContextFilePath('../outside.md')).toBeUndefined();
    expect(normalizeContextFilePath('docs/../../outside.md')).toBeUndefined();
  });

  it('rejects empty-ish paths', () => {
    expect(normalizeContextFilePath('   ')).toBeUndefined();
    expect(normalizeContextFilePath('./')).toBeUndefined();
  });
});

describe('normalizeContextFiles', () => {
  it('dedupes on the normalized path and keeps the first occurrence', () => {
    const result = normalizeContextFiles([
      { path: 'AGENTS.md', enabled: true },
      { path: './AGENTS.md', enabled: false },
      { path: 'docs\\rules.md', enabled: true },
    ]);
    expect(result.invalid).toBeUndefined();
    expect(result.entries).toEqual([
      { path: 'AGENTS.md', enabled: true },
      { path: 'docs/rules.md', enabled: true },
    ]);
  });

  it('reports the offending path instead of silently dropping it', () => {
    const result = normalizeContextFiles([
      { path: 'AGENTS.md', enabled: true },
      { path: '../escape.md', enabled: true },
    ]);
    expect(result.entries).toEqual([]);
    expect(result.invalid?.path).toBe('../escape.md');
  });

  it('keeps disabled rows as rank placeholders', () => {
    const result = normalizeContextFiles([
      { path: 'AGENTS.md', enabled: false },
      { path: 'docs/rules.md', enabled: true },
    ]);
    expect(result.entries).toEqual([
      { path: 'AGENTS.md', enabled: false },
      { path: 'docs/rules.md', enabled: true },
    ]);
  });

  it('caps the list at 20 distinct files', () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      path: `rules/${index}.md`,
      enabled: true,
    }));
    const result = normalizeContextFiles(many);
    expect(result.entries).toEqual([]);
    expect(result.invalid?.reason).toContain('20');
  });
});
