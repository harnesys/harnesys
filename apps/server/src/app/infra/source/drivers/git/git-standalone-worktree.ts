import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type GitRepositoryLayout,
  gitWorktreePath,
} from '../../../../domain/source/git-repository-layout.ts';
import { GitOperationException } from '../../../../domain/source/source.error.ts';
import { ensureWorktree, fetchAll } from './git-engine.ts';

interface WorktreeListEntry {
  path: string;
  branch: string | null;
  head: string | null;
}

export async function listCheckedOutBranches(bareRepoPath: string): Promise<WorktreeListEntry[]> {
  const bare = resolve(bareRepoPath);
  if (!existsSync(bare)) {
    return [];
  }
  const out = await runGit(['worktree', 'list', '--porcelain'], bare);
  return parseWorktreePorcelain(out);
}

function parseWorktreePorcelain(out: string): WorktreeListEntry[] {
  const entries: WorktreeListEntry[] = [];
  let current: WorktreeListEntry | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice('worktree '.length).trim(), branch: null, head: null };
      continue;
    }
    if (current) {
      applyPorcelainField(current, line);
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

function applyPorcelainField(current: WorktreeListEntry, line: string): void {
  if (line.startsWith('HEAD ')) {
    current.head = line.slice('HEAD '.length).trim() || null;
    return;
  }
  if (line.startsWith('branch ')) {
    const ref = line.slice('branch '.length).trim();
    current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
  }
}

export async function createStandaloneWorktree(input: {
  layout: GitRepositoryLayout;
  worktreeId: string;
  branch: string;
  createBranch?: boolean;
  from?: string;
}): Promise<{ contentRoot: string; branch: string; baseCommit: string }> {
  assertSafeBranch(input.branch);
  const bare = resolve(input.layout.bareRepoPath);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  await fetchAll(bare);
  const contentRoot = gitWorktreePath(input.layout, input.worktreeId);
  const adoptedHead = existsSync(contentRoot)
    ? await runGit(['rev-parse', 'HEAD'], contentRoot).catch(() => '')
    : '';
  if (adoptedHead) {
    return { contentRoot, branch: input.branch, baseCommit: adoptedHead };
  }
  if (existsSync(contentRoot)) {
    rmSync(contentRoot, { recursive: true, force: true });
  }
  await runGit(['worktree', 'prune'], bare).catch(() => undefined);
  const checkedOut = await listCheckedOutBranches(bare);
  const occupied = checkedOut.find((entry) => entry.branch === input.branch);
  if (occupied && !input.createBranch) {
    throw new GitOperationException(`branch already checked out: ${input.branch}`);
  }
  mkdirSync(dirname(contentRoot), { recursive: true });
  if (await refExists(bare, `refs/heads/${input.branch}`)) {
    await runGit(['worktree', 'add', contentRoot, input.branch], bare);
  } else if (input.createBranch) {
    const startPoint = await resolveStartPoint(bare, input.from);
    const args = ['worktree', 'add', '-b', input.branch, contentRoot];
    if (startPoint) {
      args.push(startPoint);
    }
    await runGit(args, bare);
  } else {
    await ensureWorktree(bare, contentRoot, input.branch);
  }
  const baseCommit = await runGit(['rev-parse', 'HEAD'], contentRoot);
  return { contentRoot, branch: input.branch, baseCommit };
}

export async function deleteLocalBranch(repoPath: string, branch: string): Promise<void> {
  assertSafeBranch(branch);
  const repo = resolve(repoPath);
  if (!existsSync(repo)) {
    throw new GitOperationException(`repo missing: ${repo}`);
  }
  if (!(await refExists(repo, `refs/heads/${branch}`))) {
    throw new GitOperationException(`branch not found: ${branch}`);
  }
  const checkedOut = await listCheckedOutBranches(repo);
  if (checkedOut.some((entry) => entry.branch === branch)) {
    throw new GitOperationException(`branch is checked out: ${branch}`);
  }
  const head = await runGit(['symbolic-ref', '--short', 'HEAD'], repo).catch(() => '');
  if (head === branch) {
    throw new GitOperationException(`cannot delete active branch: ${branch}`);
  }
  await runGit(['branch', '-D', branch], repo);
}

export async function removeStandaloneWorktree(
  layout: GitRepositoryLayout,
  worktreeId: string,
): Promise<void> {
  const bare = resolve(layout.bareRepoPath);
  const contentRoot = gitWorktreePath(layout, worktreeId);
  if (!existsSync(contentRoot)) {
    if (existsSync(bare)) {
      await runGit(['worktree', 'prune'], bare).catch(() => undefined);
    }
    return;
  }
  const status = await runGit(['status', '--porcelain'], contentRoot);
  if (status.trim()) {
    throw new GitOperationException('worktree has uncommitted changes');
  }
  const ahead = await countUnpushed(contentRoot);
  if (ahead > 0) {
    throw new GitOperationException('worktree has unpushed commits');
  }
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  await runGit(['worktree', 'remove', contentRoot], bare);
  await runGit(['worktree', 'prune'], bare).catch(() => undefined);
}

export async function observeWorktreeGit(
  contentRoot: string,
): Promise<{ dirty: boolean; unpushed: boolean; branch: string | null; head: string | null }> {
  if (!existsSync(contentRoot)) {
    return { dirty: false, unpushed: false, branch: null, head: null };
  }
  const status = await runGit(['status', '--porcelain'], contentRoot).catch(() => '');
  const branch = await runGit(['symbolic-ref', '--short', 'HEAD'], contentRoot).catch(() => '');
  const head = await runGit(['rev-parse', 'HEAD'], contentRoot).catch(() => '');
  const unpushed = await countUnpushed(contentRoot);
  return {
    dirty: status.trim().length > 0,
    unpushed: unpushed > 0,
    branch: branch || null,
    head: head || null,
  };
}

async function countUnpushed(contentRoot: string): Promise<number> {
  try {
    const counts = await runGit(
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      contentRoot,
    );
    const parts = counts.trim().split(/\s+/);
    const ahead = Number(parts[1] ?? 0);
    return Number.isFinite(ahead) ? ahead : 0;
  } catch {
    return 0;
  }
}

async function resolveStartPoint(bareRepoPath: string, from?: string): Promise<string | null> {
  const trimmed = from?.trim();
  if (!trimmed) {
    return null;
  }
  assertSafeBranch(trimmed);
  if (await refExists(bareRepoPath, `refs/heads/${trimmed}`)) {
    return trimmed;
  }
  if (await refExists(bareRepoPath, `refs/remotes/origin/${trimmed}`)) {
    return `origin/${trimmed}`;
  }
  throw new GitOperationException(`start point not found: ${trimmed}`);
}

function assertSafeBranch(branch: string): void {
  const trimmed = branch.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new GitOperationException(`invalid branch name: ${branch}`);
  }
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await runGit(['show-ref', '--verify', '--quiet', ref], cwd);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = (stderr || stdout || `exit ${code}`).trim();
    throw new GitOperationException(`git ${args.join(' ')} failed: ${detail}`);
  }
  return stdout.trim();
}
