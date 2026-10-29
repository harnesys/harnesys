import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GitBranch,
  GitFileStatusMap,
  GitStatusCounts,
  GitStatusResponse,
} from '../../../../../domain/source/git-vcs.types.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { parsePorcelain } from './git-helpers.ts';

const GIT_SLOW_THRESHOLD_MS = 800;

interface StatusCache {
  map: GitFileStatusMap;
  truncated: boolean;
  mtimeKey: string;
  ts: number;
  slowCount: number;
}

export async function getStatus(
  safeCwd: string,
  getAheadBehind: (cwd: string) => Promise<{
    ahead: number;
    behind: number;
  }>,
  getVersion: () => Promise<string | null>,
  listBranches: (cwd: string) => Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }>,
): Promise<GitStatusResponse> {
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    return { isGit: false, gitVersion: await getVersion().catch(() => null) };
  }
  const [branchRaw, head, porcelain, aheadBehind, version, userName, userEmail, remote] =
    await Promise.all([
      execGitTrim(safeCwd, ['symbolic-ref', '--short', 'HEAD']).catch(() => ''),
      execGitTrim(safeCwd, ['rev-parse', '--short', 'HEAD']).catch(() => ''),
      execGit(safeCwd, [
        'status',
        '--porcelain=v1',
        '-z',
        '--no-renames',
        '--untracked-files=all',
        '--ignored',
      ])
        .then((r) => (r.code === 0 ? r.stdout : ''))
        .catch(() => ''),
      getAheadBehind(safeCwd),
      getVersion().catch(() => null),
      execGitTrim(safeCwd, ['config', '--get', 'user.name']).catch(() => ''),
      execGitTrim(safeCwd, ['config', '--get', 'user.email']).catch(() => ''),
      execGitTrim(safeCwd, ['config', '--get', 'remote.origin.url']).catch(() => ''),
    ]);
  const headState = await resolveHeadState(safeCwd, branchRaw, head);
  const counts = countStatuses(parsePorcelain(porcelain));
  const dirtyCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const branches = await listBranches(safeCwd).catch(() => ({
    local: [] as GitBranch[],
    recent: [] as GitBranch[],
  }));
  return {
    isGit: true,
    branch: headState.branch,
    detached: headState.detached,
    head: headState.headShort,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    dirty: dirtyCount > 0,
    dirtyCount,
    counts: dirtyCount > 0 ? counts : undefined,
    noCommits: headState.noCommits,
    gitVersion: version,
    gitUser: userName || userEmail ? { name: userName || null, email: userEmail || null } : null,
    remote: remote || null,
    branches,
  };
}

async function resolveHeadState(
  safeCwd: string,
  branchRaw: string,
  head: string,
): Promise<{
  branch: string | null;
  detached: boolean;
  headShort: string | null;
  noCommits: boolean;
}> {
  if (branchRaw) {
    return { branch: branchRaw, detached: false, headShort: head || null, noCommits: false };
  }
  const verify = await execGitTrim(safeCwd, ['rev-parse', '--verify', 'HEAD']).catch(() => '');
  if (!verify) {
    const headRef = await execGitTrim(safeCwd, ['symbolic-ref', 'HEAD']).catch(() => '');
    const branch = headRef.startsWith('refs/heads/') ? headRef.replace('refs/heads/', '') : null;
    return { branch, detached: false, headShort: null, noCommits: true };
  }
  return { branch: null, detached: true, headShort: head || null, noCommits: false };
}

function countStatuses(map: GitFileStatusMap): GitStatusCounts {
  const counts: GitStatusCounts = {
    added: 0,
    modified: 0,
    deleted: 0,
    untracked: 0,
    staged: 0,
    conflicted: 0,
    renamed: 0,
  };
  for (const v of Object.values(map)) {
    if (v === 'ignored') {
      continue;
    }
    bumpCount(counts, v);
  }
  return counts;
}

function bumpCount(counts: GitStatusCounts, status: string): void {
  if (status === 'added') {
    counts.added++;
  } else if (status === 'modified') {
    counts.modified++;
  } else if (status === 'deleted') {
    counts.deleted++;
  } else if (status === 'untracked') {
    counts.untracked++;
  } else if (status === 'staged') {
    counts.staged++;
  } else if (status === 'conflicted') {
    counts.conflicted++;
  } else if (status === 'renamed') {
    counts.renamed++;
  }
}

export async function getFileStatus(
  safeCwd: string,
  statusCache: Map<string, StatusCache>,
  getMtimeKey: (cwd: string) => Promise<string>,
  subPath?: string,
): Promise<{
  map: GitFileStatusMap;
  truncated: boolean;
}> {
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    return { map: {}, truncated: false };
  }
  const cacheKey = subPath ? `${safeCwd}::${subPath}` : safeCwd;
  const now = Date.now();
  const mtimeKey = await getMtimeKey(safeCwd).catch(() => '');
  const start = Date.now();
  const args = [
    'status',
    '--porcelain=v1',
    '-z',
    '--no-renames',
    '--untracked-files=all',
    '--ignored',
  ];
  if (subPath) {
    args.push('--', subPath);
  }
  const raw = await execGit(safeCwd, args)
    .then((r) => (r.code === 0 ? r.stdout : ''))
    .catch(() => '');
  const elapsed = Date.now() - start;
  const prev = statusCache.get(cacheKey);
  if (elapsed > GIT_SLOW_THRESHOLD_MS) {
    const slowCount = (prev?.slowCount ?? 0) + 1;
    const truncated = slowCount >= 2;
    const map = truncated ? {} : parsePorcelain(raw);
    statusCache.set(cacheKey, { map, truncated, mtimeKey, ts: now, slowCount });
    return { map, truncated };
  }
  const map = parsePorcelain(raw);
  statusCache.set(cacheKey, { map, truncated: false, mtimeKey, ts: now, slowCount: 0 });
  return { map, truncated: false };
}

export async function getMtimeKey(cwd: string): Promise<string> {
  const gitDir = await execGitTrim(cwd, ['rev-parse', '--git-dir']).catch(() => '.git');
  const absGitDir = gitDir.startsWith('/') ? gitDir : join(cwd, gitDir);
  const idx = join(absGitDir, 'index');
  const head = join(absGitDir, 'HEAD');
  const [a, b] = await Promise.all([
    stat(idx)
      .then((s) => String(s.mtimeMs))
      .catch(() => '0'),
    stat(head)
      .then((s) => String(s.mtimeMs))
      .catch(() => '0'),
  ]);
  return `${a}:${b}`;
}
