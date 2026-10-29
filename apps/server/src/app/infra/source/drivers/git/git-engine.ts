import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type GitRepositoryLayout,
  gitWorktreePath,
} from '../../../../domain/source/git-repository-layout.ts';
import { GitOperationException } from '../../../../domain/source/source.error.ts';

export type { GitRepositoryLayout };
export const worktreePath = gitWorktreePath;

export function sanitizeGitText(text: string): string {
  return text
    .replace(/\b(https?|git|ssh):\/\/[^\s'"\\]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.username || parsed.password) {
          parsed.username = '';
          parsed.password = '';
          return parsed.toString();
        }
      } catch {
        return url.replace(/\/\/[^/@\s]+@/g, '//');
      }
      return url;
    })
    .replace(/\/\/[^/@\s]+@/g, '//');
}

export function isBareRepoReady(bareRepoPath: string): boolean {
  return existsSync(join(bareRepoPath, 'HEAD')) && existsSync(join(bareRepoPath, 'objects'));
}

export async function cloneBare(url: string, targetRepoPath: string): Promise<void> {
  if (existsSync(targetRepoPath)) {
    throw new GitOperationException(`bare repo already exists: ${targetRepoPath}`);
  }
  mkdirSync(dirname(targetRepoPath), { recursive: true });
  await runGit(['clone', '--bare', url, targetRepoPath]);
  await runGit(
    ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
    targetRepoPath,
  );
  await runGit(['fetch', 'origin', '--prune'], targetRepoPath);
}

export async function detectDefaultBranch(bareRepoPath: string): Promise<string> {
  try {
    const head = await runGit(['symbolic-ref', '--short', 'HEAD'], bareRepoPath);
    if (head) {
      return head;
    }
  } catch {
    // fall through
  }
  const refs = await runGit(
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
    bareRepoPath,
  );
  const branches = refs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const candidate of ['main', 'master']) {
    if (branches.includes(candidate)) {
      return candidate;
    }
  }
  if (branches[0]) {
    return branches[0];
  }
  throw new GitOperationException('could not detect default branch');
}

export async function ensureWorktree(
  bareRepoPath: string,
  targetWorktreePath: string,
  branch: string,
): Promise<void> {
  assertSafeBranch(branch);
  if (existsSync(targetWorktreePath)) {
    return;
  }
  mkdirSync(dirname(targetWorktreePath), { recursive: true });
  const localExists = await refExists(bareRepoPath, `refs/heads/${branch}`);
  if (localExists) {
    await runGit(['worktree', 'add', targetWorktreePath, branch], bareRepoPath);
    return;
  }
  const remoteExists = await refExists(bareRepoPath, `refs/remotes/origin/${branch}`);
  if (remoteExists) {
    await runGit(
      ['worktree', 'add', '-b', branch, targetWorktreePath, `origin/${branch}`],
      bareRepoPath,
    );
    return;
  }
  throw new GitOperationException(`branch not found: ${branch}`);
}

export async function fetchAll(bareRepoPath: string): Promise<void> {
  if (!(await hasOriginRemote(bareRepoPath))) {
    return;
  }
  await runGit(['fetch', 'origin', '--prune'], bareRepoPath);
}

async function hasOriginRemote(repoPath: string): Promise<boolean> {
  const out = await runGit(['remote'], repoPath).catch(() => '');
  return out
    .split('\n')
    .map((line) => line.trim())
    .includes('origin');
}

export async function ffWorktree(targetWorktreePath: string, branch: string): Promise<void> {
  assertSafeBranch(branch);
  try {
    await runGit(['merge', '--ff-only', `refs/remotes/origin/${branch}`], targetWorktreePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GitOperationException(
      `fast-forward failed for branch ${branch}: ${message}. Resolve diverged history manually.`,
    );
  }
}

export async function listLocalBranches(bareRepoPath: string): Promise<string[]> {
  const out = await runGit(
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
    bareRepoPath,
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

export async function ensureMaterialized(input: {
  url: string;
  layout: GitRepositoryLayout;
  worktreeId: string;
  branch?: string;
}): Promise<{ activeBranch: string; contentRoot: string; layout: GitRepositoryLayout }> {
  const bare = resolve(input.layout.bareRepoPath);
  const worktreesRoot = resolve(input.layout.worktreesRoot);
  const layout: GitRepositoryLayout = { bareRepoPath: bare, worktreesRoot };
  if (existsSync(bare) && !isBareRepoReady(bare)) {
    rmSync(bare, { recursive: true, force: true });
  }
  if (!existsSync(bare)) {
    await cloneBare(input.url, bare);
  }
  mkdirSync(worktreesRoot, { recursive: true });
  const activeBranch = input.branch?.trim() || (await detectDefaultBranch(bare));
  const contentRoot = worktreePath(layout, input.worktreeId);
  await ensureWorktree(bare, contentRoot, activeBranch);
  return {
    activeBranch,
    contentRoot,
    layout,
  };
}

export async function applyCredentialHelper(
  layout: GitRepositoryLayout,
  remoteUrl: string,
  credentialUrl: string,
): Promise<void> {
  const bare = resolve(layout.bareRepoPath);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  const parsed = new URL(remoteUrl);
  if (parsed.protocol !== 'https:') {
    return;
  }
  parsed.username = '';
  parsed.password = '';
  const configKey = `credential.${parsed.protocol}//${parsed.host}.helper`;
  const helper =
    `!f() { t=$(curl -sf '${credentialUrl}') || exit 0; ` +
    `printf 'username=x-access-token\\npassword=%s\\n' "$t"; }; f`;
  await runGit(['remote', 'set-url', 'origin', parsed.toString()], bare);
  await runGit(['config', '--replace-all', configKey, helper], bare);
}

export async function refreshWorktree(
  layout: GitRepositoryLayout,
  worktreeId: string,
  activeBranch: string,
): Promise<void> {
  const bare = resolve(layout.bareRepoPath);
  const wt = worktreePath(layout, worktreeId);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  if (!existsSync(wt)) {
    throw new GitOperationException(`worktree missing: ${wt}`);
  }
  await fetchAll(bare);
  await ffWorktree(wt, activeBranch);
}

export async function switchWorktreeBranch(
  layout: GitRepositoryLayout,
  worktreeId: string,
  branch: string,
): Promise<{ activeBranch: string; contentRoot: string }> {
  const bare = resolve(layout.bareRepoPath);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  await fetchAll(bare);
  const contentRoot = worktreePath(layout, worktreeId);
  if (existsSync(contentRoot)) {
    const status = await runGit(['status', '--porcelain'], contentRoot);
    if (status.trim()) {
      throw new GitOperationException('checkout forbidden: worktree has uncommitted changes');
    }
    await runGit(['checkout', branch], contentRoot);
    return { activeBranch: branch, contentRoot };
  }
  await ensureWorktree(bare, contentRoot, branch);
  return { activeBranch: branch, contentRoot };
}

export async function createWorktreeBranch(
  layout: GitRepositoryLayout,
  worktreeId: string,
  name: string,
  options: { checkout: boolean; from?: string },
): Promise<{ activeBranch: string; contentRoot: string } | null> {
  assertSafeBranch(name);
  const bare = resolve(layout.bareRepoPath);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  await fetchAll(bare);
  try {
    await runGit(['check-ref-format', '--branch', name], bare);
  } catch {
    throw new GitOperationException(`invalid branch name: ${name}`);
  }
  if (await refExists(bare, `refs/heads/${name}`)) {
    throw new GitOperationException(`branch already exists: ${name}`);
  }
  const startPoint = await resolveStartPoint(bare, options.from);
  if (!options.checkout) {
    const args = ['branch', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await runGit(args, bare);
    return null;
  }
  const contentRoot = worktreePath(layout, worktreeId);
  if (existsSync(contentRoot)) {
    const status = await runGit(['status', '--porcelain'], contentRoot);
    if (status.trim()) {
      throw new GitOperationException('checkout forbidden: worktree has uncommitted changes');
    }
    const args = ['checkout', '-b', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await runGit(args, contentRoot);
    return { activeBranch: name, contentRoot };
  }
  mkdirSync(dirname(contentRoot), { recursive: true });
  const args = ['worktree', 'add', '-b', name, contentRoot];
  if (startPoint) {
    args.push(startPoint);
  }
  await runGit(args, bare);
  return { activeBranch: name, contentRoot };
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
    const safeArgs = args.map((arg) => sanitizeGitText(arg)).join(' ');
    const detail = sanitizeGitText((stderr || stdout || `exit ${code}`).trim());
    throw new GitOperationException(`git ${safeArgs} failed: ${detail}`);
  }
  return stdout.trim();
}
