import type {
  GitCommitDetail,
  GitCommitFileChange,
  GitCommitSummary,
  GitFileStatus,
} from '../../../../../domain/source/git-vcs.types.ts';
import { execGit } from './git-exec.ts';

const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%P%x1f%D';
const SHOW_FORMAT = `${LOG_FORMAT}%x1f%B`;
const PATCH_LIMIT = 400_000;
const SHA_PATTERN = /^[0-9a-f]{4,40}$/i;

export async function getLog(cwd: string, limit: number): Promise<GitCommitSummary[]> {
  const res = await execGit(cwd, [
    'log',
    '--no-color',
    '--date=iso-strict',
    `--max-count=${limit}`,
    `--format=${LOG_FORMAT}`,
  ]);
  if (res.code !== 0) {
    return [];
  }
  return res.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => toSummary(line.split('\x1f')));
}

export async function getShow(cwd: string, sha: string): Promise<GitCommitDetail> {
  const ref = validateSha(sha);
  const meta = await execGit(cwd, ['show', '-s', '--no-color', `--format=${SHOW_FORMAT}`, ref]);
  if (meta.code !== 0) {
    throw new Error((meta.stderr || meta.stdout).trim() || `git show failed (${meta.code})`);
  }
  const fields = meta.stdout.split('\x1f');
  const [files, patch] = await Promise.all([getFiles(cwd, ref), getPatch(cwd, ref)]);
  return {
    commit: toSummary(fields),
    body: bodyWithoutSubject(fields[8] ?? ''),
    files,
    patch: patch.patch,
    truncated: patch.truncated,
  };
}

export async function revertCommit(cwd: string, sha: string): Promise<void> {
  const ref = validateSha(sha);
  const res = await execGit(cwd, ['revert', '--no-edit', ref]);
  if (res.code !== 0) {
    throw new Error((res.stderr + res.stdout).trim() || `git revert failed (${res.code})`);
  }
}

function validateSha(sha: string): string {
  const ref = sha.trim();
  if (!SHA_PATTERN.test(ref)) {
    throw new Error('invalid sha');
  }
  return ref;
}

function bodyWithoutSubject(raw: string): string {
  const message = raw.trim();
  const newline = message.indexOf('\n');
  return newline === -1 ? '' : message.slice(newline).trim();
}

function toSummary(fields: string[]): GitCommitSummary {
  return {
    sha: fields[0] ?? '',
    shortSha: fields[1] ?? '',
    author: { name: fields[2] ?? '', email: fields[3] ?? '' },
    date: fields[4] ?? '',
    subject: fields[5] ?? '',
    parents: (fields[6] ?? '').split(' ').filter((p) => p.length > 0),
    refs: (fields[7] ?? '').split(', ').filter((r) => r.length > 0),
  };
}

async function getFiles(cwd: string, ref: string): Promise<GitCommitFileChange[]> {
  const [numstat, nameStatus] = await Promise.all([
    execGit(cwd, ['show', '--numstat', '--format=', '--no-renames', ref]),
    execGit(cwd, ['show', '--name-status', '--format=', '--no-renames', ref]),
  ]);
  const statuses = new Map<string, GitFileStatus>();
  for (const line of nameStatus.stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split('\t');
    const path = parts.slice(1).join('\t');
    if (!path) {
      continue;
    }
    statuses.set(path, letterToStatus(parts[0] ?? ''));
  }
  const changes: GitCommitFileChange[] = [];
  for (const line of numstat.stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 3) {
      continue;
    }
    const path = parts.slice(2).join('\t');
    changes.push({
      path,
      added: toCount(parts[0] ?? ''),
      deleted: toCount(parts[1] ?? ''),
      status: statuses.get(path) ?? 'modified',
    });
  }
  return changes;
}

async function getPatch(cwd: string, ref: string): Promise<{ patch: string; truncated: boolean }> {
  const res = await execGit(cwd, [
    'show',
    '--patch',
    '--format=',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    ref,
  ]);
  const raw = res.code === 0 ? res.stdout : res.stderr || res.stdout;
  if (raw.length > PATCH_LIMIT) {
    return { patch: `${raw.slice(0, PATCH_LIMIT)}\n... truncated`, truncated: true };
  }
  return { patch: raw, truncated: false };
}

function letterToStatus(letter: string): GitFileStatus {
  if (letter === 'A') {
    return 'added';
  }
  if (letter === 'D') {
    return 'deleted';
  }
  return 'modified';
}

function toCount(value: string): number {
  if (value === '-') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
