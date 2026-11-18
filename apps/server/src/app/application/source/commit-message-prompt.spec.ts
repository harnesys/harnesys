import { describe, expect, test } from 'bun:test';
import type { GitFileStatus } from '../../domain/source/git-vcs.types.ts';
import {
  buildCommitPrompt,
  COMMIT_DIFF_BUDGET_CHARS,
  cleanCommitMessage,
} from './commit-message-prompt.ts';

function file(path: string, diff: string | null, status: GitFileStatus = 'modified') {
  return { path, status, isBinary: false, diff };
}

describe('buildCommitPrompt', () => {
  test('keeps the full file list while capping the diff budget', () => {
    const huge = `+${'x'.repeat(5000)}`;
    const files = [
      file('src/a.ts', huge),
      file('src/b.ts', huge),
      file('src/c.ts', huge),
      file('src/d.ts', huge),
    ];
    const { prompt } = buildCommitPrompt(files, '');
    for (const entry of files) {
      expect(prompt).toContain(entry.path);
    }
    const diffPart = prompt.slice(prompt.indexOf('Diff:'));
    expect(diffPart.length).toBeLessThan(COMMIT_DIFF_BUDGET_CHARS + 1200);
    expect(diffPart).toContain('truncated');
  });

  test('omits lockfiles and generated diffs from the prompt', () => {
    const { prompt } = buildCommitPrompt(
      [
        file('package-lock.json', '+lock'),
        file('dist/bundle.js', '+bundle'),
        file('src/app.ts', '+export const app = 1;'),
      ],
      '',
    );
    expect(prompt).toContain('package-lock.json');
    expect(prompt).toContain('src/app.ts');
    expect(prompt).toContain('Diffs omitted: package-lock.json (generated or lock file)');
    expect(prompt).not.toContain('+lock');
    expect(prompt).not.toContain('+bundle');
  });

  test('includes user instructions before the change set', () => {
    const { prompt } = buildCommitPrompt([file('src/a.ts', '+x')], 'Conventional Commits.');
    expect(prompt.indexOf('Conventional Commits.')).toBeLessThan(prompt.indexOf('Changed files'));
  });
});

describe('cleanCommitMessage', () => {
  test('strips code fences and surrounding quotes', () => {
    expect(cleanCommitMessage('```\nfeat: add vcs settings\n```')).toBe('feat: add vcs settings');
    expect(cleanCommitMessage('"fix: guard empty diff"')).toBe('fix: guard empty diff');
  });

  test('strips markdown emphasis and labels', () => {
    expect(cleanCommitMessage('**feat: add vcs settings**')).toBe('feat: add vcs settings');
    expect(cleanCommitMessage('Commit message: `fix: guard empty diff`')).toBe(
      'fix: guard empty diff',
    );
  });

  test('caps the message at the commit field limit', () => {
    expect(cleanCommitMessage('a'.repeat(3000)).length).toBe(2000);
  });
});
