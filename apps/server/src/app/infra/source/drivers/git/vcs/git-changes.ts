import { execGit } from './git-exec.ts';
import { sanitizePaths } from './git-helpers.ts';

export async function stagePaths(cwd: string, paths: string[]): Promise<void> {
  const clean = sanitizePaths(paths);
  const args = clean.length === 0 ? ['add', '-A'] : ['add', '--', ...clean];
  const res = await execGit(cwd, args);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git add failed (${res.code})`);
  }
}

export async function unstagePaths(cwd: string, paths: string[]): Promise<void> {
  const clean = sanitizePaths(paths);
  const args =
    clean.length === 0
      ? ['restore', '--staged', '--', '.']
      : ['restore', '--staged', '--', ...clean];
  const res = await execGit(cwd, args);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git restore failed (${res.code})`);
  }
}

export async function discardPaths(
  cwd: string,
  paths: string[],
  untrackedPaths: string[],
): Promise<void> {
  const clean = sanitizePaths(paths);
  const cleanUntracked = sanitizePaths(untrackedPaths);
  if (clean.length === 0 && cleanUntracked.length === 0) {
    throw new Error('paths are required');
  }
  if (clean.length > 0) {
    await execGit(cwd, ['restore', '--staged', '--', ...clean]);
    await restoreTracked(cwd, clean);
  }
  if (cleanUntracked.length > 0) {
    await cleanUntrackedPaths(cwd, cleanUntracked);
  }
}

async function restoreTracked(cwd: string, paths: string[]): Promise<void> {
  const tracked: string[] = [];
  for (const path of paths) {
    const res = await execGit(cwd, ['ls-files', '--error-unmatch', '--', path]);
    if (res.code === 0) {
      tracked.push(path);
    }
  }
  if (tracked.length === 0) {
    return;
  }
  const res = await execGit(cwd, ['restore', '--source=HEAD', '--worktree', '--', ...tracked]);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git restore failed (${res.code})`);
  }
}

async function cleanUntrackedPaths(cwd: string, paths: string[]): Promise<void> {
  const res = await execGit(cwd, ['clean', '-fd', '--', ...paths]);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git clean failed (${res.code})`);
  }
}

export async function commitChanges(
  cwd: string,
  message: string,
  paths?: string[],
  amend?: boolean,
): Promise<void> {
  const msg = message.trim();
  if (!msg) {
    throw new Error('commit message is required');
  }
  if (msg.includes('\0')) {
    throw new Error('invalid commit message');
  }
  const clean = sanitizePaths(paths ?? []);
  const commitArgs = amend ? ['commit', '--amend', '-m', msg] : null;
  if (clean.length === 0) {
    const addRes = await execGit(cwd, ['add', '-A']);
    if (addRes.code !== 0) {
      throw new Error((addRes.stderr || addRes.stdout).trim() || `git add failed (${addRes.code})`);
    }
    await runCommit(cwd, commitArgs ?? ['commit', '-m', msg]);
    return;
  }
  const addRes = await execGit(cwd, ['add', '--', ...clean]);
  if (addRes.code !== 0) {
    throw new Error((addRes.stderr || addRes.stdout).trim() || `git add failed (${addRes.code})`);
  }
  await runCommit(cwd, commitArgs ?? ['commit', '-m', msg, '--', ...clean]);
}

async function runCommit(cwd: string, args: string[]): Promise<void> {
  const res = await execGit(cwd, args);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  if (/nothing to commit|no changes added/i.test(err)) {
    throw new Error('nothing to commit');
  }
  throw new Error(err || `git commit failed (${res.code})`);
}
