import type { GitFileStatus } from '../../domain/source/git-vcs.types.ts';

export interface CommitPromptFile {
  path: string;
  status: GitFileStatus;
  isBinary: boolean;
  diff: string | null;
}

export interface CommitPrompt {
  system: string;
  prompt: string;
}

export const COMMIT_DIFF_BUDGET_CHARS = 2000;
export const COMMIT_FILE_DIFF_BUDGET_CHARS = 800;
export const COMMIT_MAX_FILES = 200;

const LOCKFILES = new Set([
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'cargo.lock',
  'composer.lock',
  'poetry.lock',
  'gemfile.lock',
  'go.sum',
  'uv.lock',
]);

const NOISY_SEGMENTS = new Set([
  'dist',
  'build',
  'out',
  'coverage',
  'node_modules',
  'vendor',
  'target',
  '__snapshots__',
]);

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'icns',
  'pdf',
  'zip',
  'gz',
  'tar',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp3',
  'mp4',
  'mov',
  'wasm',
]);

const COMMIT_SYSTEM_PROMPT = `Write one git commit message for the listed changes.

Output rules:
- Plain text only: no quotes, code fences, markdown, or preamble.
- Subject: imperative mood, lowercase after the type, at most 72 characters, no trailing period.
- Optional body: blank line, short lines under 72 characters, only for non-trivial changes.
- Describe intent, not diff mechanics. Never invent files.
- The file list is complete; diffs may be truncated or omitted for noise files.`;

const STATUS_LETTERS: Record<GitFileStatus, string> = {
  added: 'A',
  staged: 'S',
  modified: 'M',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R',
  conflicted: 'C',
  ignored: 'I',
};

export function isNoisyCommitPath(path: string): boolean {
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  const name = segments[segments.length - 1] ?? lower;
  if (LOCKFILES.has(name)) {
    return true;
  }
  if (lower.includes('.min.') || name.endsWith('.map')) {
    return true;
  }
  if (segments.some((segment) => NOISY_SEGMENTS.has(segment))) {
    return true;
  }
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  return BINARY_EXTENSIONS.has(extension);
}

export function buildCommitPrompt(files: CommitPromptFile[], instructions: string): CommitPrompt {
  const listed = files.slice(0, COMMIT_MAX_FILES);
  const sections: string[] = [];
  const trimmedInstructions = instructions.trim();
  if (trimmedInstructions) {
    sections.push(`User instructions for the message format:\n${trimmedInstructions}`);
  }
  sections.push(fileListSection(listed, files.length));
  const diff = diffSection(listed);
  if (diff) {
    sections.push(`Diff:\n${diff}`);
  }
  return { system: COMMIT_SYSTEM_PROMPT, prompt: sections.join('\n\n') };
}

function fileListSection(listed: CommitPromptFile[], total: number): string {
  const lines: string[] = [`Changed files (${listed.length}):`];
  const omitted: string[] = [];
  for (const file of listed) {
    const counts = diffCounts(file.diff);
    const stats = counts ? ` (+${counts.added} −${counts.removed})` : '';
    lines.push(`  ${STATUS_LETTERS[file.status]} ${file.path}${stats}`);
    const reason = omissionReason(file);
    if (reason) {
      omitted.push(`${file.path} (${reason})`);
    }
  }
  if (total > listed.length) {
    lines.push(`  … ${total - listed.length} more files not listed`);
  }
  if (omitted.length > 0) {
    lines.push('', `Diffs omitted: ${omitted.join(', ')}`);
  }
  return lines.join('\n');
}

function omissionReason(file: CommitPromptFile): string | null {
  if (file.isBinary) {
    return 'binary';
  }
  if (isNoisyCommitPath(file.path)) {
    return 'generated or lock file';
  }
  return null;
}

function diffSection(listed: CommitPromptFile[]): string {
  let budget = COMMIT_DIFF_BUDGET_CHARS;
  const blocks: string[] = [];
  let skipped = 0;
  for (const file of listed) {
    if (omissionReason(file) !== null) {
      continue;
    }
    const diff = file.diff?.trim();
    if (!diff) {
      continue;
    }
    if (budget <= 0) {
      skipped += 1;
      continue;
    }
    const limit = Math.min(COMMIT_FILE_DIFF_BUDGET_CHARS, budget);
    const slice = diff.length > limit ? `${diff.slice(0, limit)}\n… truncated` : diff;
    budget -= Math.min(diff.length, limit);
    blocks.push(`--- ${file.path}\n${slice}`);
  }
  if (skipped > 0) {
    blocks.push(`… diffs for ${skipped} more files skipped to fit the budget`);
  }
  return blocks.join('\n\n');
}

export function cleanCommitMessage(raw: string): string {
  let text = raw.trim();
  const fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(text);
  if (fence) {
    text = fence[1]?.trim() ?? '';
  }
  text = text.replace(/^(?:here(?:'s| is) (?:your |the )?)?commit message\s*:\s*/i, '');
  text = text.replace(/^[#>*\-\s]+/, '').trim();
  for (const quote of ['"', "'", '`']) {
    while (text.length >= 2 && text.startsWith(quote) && text.endsWith(quote)) {
      text = text.slice(1, -1).trim();
    }
  }
  text = text.replace(/^\*\*|\*\*$/g, '').trim();
  return text
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 2000)
    .trim();
}

function diffCounts(diff: string | null): { added: number; removed: number } | null {
  if (!diff) {
    return null;
  }
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      added += 1;
    } else if (line.startsWith('-')) {
      removed += 1;
    }
  }
  return { added, removed };
}
