import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureMaterialized,
  refreshWorktree,
  sanitizeGitText,
  switchWorktreeBranch,
  worktreePath,
} from './git-engine.ts';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function layoutFor(root: string) {
  return {
    bareRepoPath: join(root, 'bare'),
    worktreesRoot: join(root, 'bare.worktrees'),
  };
}

async function run(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

async function createRemoteFixture(): Promise<{ remoteUrl: string; remoteDir: string }> {
  const remoteDir = tempDir('harnesys-git-remote-');
  await run(['init', '-b', 'main'], remoteDir);
  await run(['config', 'user.email', 'test@example.com'], remoteDir);
  await run(['config', 'user.name', 'test'], remoteDir);
  writeFileSync(join(remoteDir, 'readme.md'), 'main-v1\n');
  await run(['add', 'readme.md'], remoteDir);
  await run(['commit', '-m', 'main v1'], remoteDir);
  await run(['checkout', '-b', 'feature'], remoteDir);
  writeFileSync(join(remoteDir, 'feature.txt'), 'feature-only\n');
  await run(['add', 'feature.txt'], remoteDir);
  await run(['commit', '-m', 'feature'], remoteDir);
  await run(['checkout', 'main'], remoteDir);
  return { remoteUrl: remoteDir, remoteDir };
}

describe('git-engine', () => {
  test('ensureMaterialized reclones empty pre-created bare directory', async () => {
    const { remoteUrl } = await createRemoteFixture();
    const root = tempDir('harnesys-git-precreate-');
    const layout = layoutFor(root);
    mkdirSync(layout.bareRepoPath, { recursive: true });
    expect(existsSync(layout.bareRepoPath)).toBe(true);
    expect(existsSync(join(layout.bareRepoPath, 'HEAD'))).toBe(false);
    const result = await ensureMaterialized({
      url: remoteUrl,
      layout,
      worktreeId: 'wt-heal',
    });
    expect(existsSync(join(layout.bareRepoPath, 'HEAD'))).toBe(true);
    expect(existsSync(join(result.contentRoot, 'readme.md'))).toBe(true);
  });

  test('sanitizeGitText strips credentials from urls', () => {
    expect(
      sanitizeGitText(
        'git clone --bare https://x-access-token:s3cret@github.com/org/repo.git failed',
      ),
    ).toBe('git clone --bare https://github.com/org/repo.git failed');
  });

  test('ensureMaterialized content root is worktree by id not bare', async () => {
    const { remoteUrl } = await createRemoteFixture();
    const root = tempDir('harnesys-git-mat-');
    const layout = layoutFor(root);
    const result = await ensureMaterialized({
      url: remoteUrl,
      layout,
      worktreeId: 'wt-main',
    });
    expect(result.activeBranch).toBe('main');
    expect(result.contentRoot).toBe(worktreePath(layout, 'wt-main'));
    expect(result.contentRoot.includes('.worktrees')).toBe(true);
    expect(existsSync(join(result.contentRoot, 'readme.md'))).toBe(true);
    expect(readFileSync(join(result.contentRoot, 'readme.md'), 'utf8')).toBe('main-v1\n');
  });

  test('switchBranch reuses worktree id path', async () => {
    const { remoteUrl } = await createRemoteFixture();
    const root = tempDir('harnesys-git-switch-');
    const layout = layoutFor(root);
    const first = await ensureMaterialized({
      url: remoteUrl,
      layout,
      worktreeId: 'wt-1',
    });
    const switched = await switchWorktreeBranch(first.layout, 'wt-1', 'feature');
    expect(switched.activeBranch).toBe('feature');
    expect(switched.contentRoot).toBe(first.contentRoot);
    expect(existsSync(join(switched.contentRoot, 'feature.txt'))).toBe(true);
    expect(readFileSync(join(switched.contentRoot, 'feature.txt'), 'utf8')).toBe('feature-only\n');
  });

  test('refresh fast-forwards worktree after remote update', async () => {
    const { remoteUrl, remoteDir } = await createRemoteFixture();
    const root = tempDir('harnesys-git-refresh-');
    const layout = layoutFor(root);
    const materialized = await ensureMaterialized({
      url: remoteUrl,
      layout,
      worktreeId: 'wt-ff',
    });
    writeFileSync(join(remoteDir, 'readme.md'), 'main-v2\n');
    await run(['add', 'readme.md'], remoteDir);
    await run(['commit', '-m', 'main v2'], remoteDir);
    await refreshWorktree(materialized.layout, 'wt-ff', materialized.activeBranch);
    expect(readFileSync(join(materialized.contentRoot, 'readme.md'), 'utf8')).toBe('main-v2\n');
  });

  test('worktree id is a single path component even for nested branches', async () => {
    const remoteDir = tempDir('harnesys-git-nested-remote-');
    await run(['init', '-b', 'main'], remoteDir);
    await run(['config', 'user.email', 'test@example.com'], remoteDir);
    await run(['config', 'user.name', 'test'], remoteDir);
    writeFileSync(join(remoteDir, 'a.txt'), 'a\n');
    await run(['add', 'a.txt'], remoteDir);
    await run(['commit', '-m', 'init'], remoteDir);
    await run(['checkout', '-b', 'feat/nested'], remoteDir);
    mkdirSync(join(remoteDir, 'nested'), { recursive: true });
    writeFileSync(join(remoteDir, 'nested', 'b.txt'), 'b\n');
    await run(['add', 'nested/b.txt'], remoteDir);
    await run(['commit', '-m', 'nested'], remoteDir);
    await run(['checkout', 'main'], remoteDir);

    const root = tempDir('harnesys-git-nested-mat-');
    const layout = layoutFor(root);
    await ensureMaterialized({ url: remoteDir, layout, worktreeId: 'wt-nested' });
    const switched = await switchWorktreeBranch(layout, 'wt-nested', 'feat/nested');
    expect(switched.contentRoot).toBe(join(layout.worktreesRoot, 'wt-nested'));
    expect(existsSync(join(switched.contentRoot, 'nested', 'b.txt'))).toBe(true);
  });
});
