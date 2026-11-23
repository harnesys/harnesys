import {
  GitBranchExistsError,
  GitBranchInvalidError,
  GitDirtyError,
} from '../../../../../domain/source/git-vcs.error.ts';
import type { GitBranch } from '../../../../../domain/source/git-vcs.types.ts';
import { execGit, execGitTrim } from './git-exec.ts';

export async function listBranches(cwd: string): Promise<{
  local: GitBranch[];
  recent: GitBranch[];
}> {
  const current = await execGitTrim(cwd, ['branch', '--show-current']).catch(() => '');
  const raw = await execGitTrim(cwd, [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads',
  ]).catch(() => '');
  let names = raw ? raw.split('\n').filter(Boolean) : [];
  if (names.length === 0) {
    const fb = await execGitTrim(cwd, ['branch', '--format=%(refname:short)']).catch(() => '');
    names = fb ? fb.split('\n').filter(Boolean) : [];
  }
  if (names.length === 0 && current) {
    names = [current];
  }
  const local: GitBranch[] = names.map((n) => ({
    name: n.trim(),
    current: n.trim() === current,
  }));
  return { local, recent: local.slice(0, 5) };
}

export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
  if (!branch || branch.includes('\0') || branch.includes('\n')) {
    throw new GitBranchInvalidError('invalid branch name');
  }
  const res = await execGit(cwd, ['checkout', branch]);
  if (res.code === 0) {
    return;
  }
  const err = res.stderr + res.stdout;
  if (/already exists/i.test(err)) {
    throw new GitBranchExistsError(err.trim());
  }
  if (/would be overwritten|local changes|needs merge|overwritten by checkout/i.test(err)) {
    throw new GitDirtyError(err.trim());
  }
  throw new Error(err.trim() || `git checkout failed (${res.code})`);
}

export async function mergeBranch(cwd: string, branch: string): Promise<void> {
  if (!branch || branch.includes('\0') || branch.includes('\n')) {
    throw new GitBranchInvalidError('invalid branch name');
  }
  const res = await execGit(cwd, ['merge', branch]);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  if (/would be overwritten|local changes/i.test(err)) {
    throw new GitDirtyError(err);
  }
  throw new Error(err || `git merge failed (${res.code})`);
}

export async function createBranch(
  cwd: string,
  name: string,
  checkout: boolean,
  from?: string,
): Promise<void> {
  const ok = await validateBranchName(cwd, name);
  if (!ok) {
    throw new GitBranchInvalidError(`invalid branch name: ${name}`);
  }
  const args = checkout ? ['checkout', '-b', name] : ['branch', name];
  if (from) {
    args.push(from);
  }
  const res = await execGit(cwd, args);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  if (/already exists/i.test(err)) {
    throw new GitBranchExistsError(err);
  }
  throw new Error(err || `git branch failed (${res.code})`);
}

export async function validateBranchName(cwd: string, name: string): Promise<boolean> {
  const res = await execGit(cwd, ['check-ref-format', '--branch', name]);
  return res.code === 0;
}
