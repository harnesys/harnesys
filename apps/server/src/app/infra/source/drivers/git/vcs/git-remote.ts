import { execGit } from './git-exec.ts';

export async function pushRemote(cwd: string): Promise<void> {
  const res = await execGit(cwd, ['push']);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  if (/has no upstream|set-upstream|unknown.*upstream/i.test(err)) {
    const retry = await execGit(cwd, ['push', '-u', 'origin', 'HEAD']);
    if (retry.code === 0) {
      return;
    }
    const retryErr = (retry.stderr + retry.stdout).trim();
    throw new Error(retryErr || err || `git push failed (${retry.code})`);
  }
  throw new Error(err || `git push failed (${res.code})`);
}

export async function pullRemote(cwd: string): Promise<void> {
  const res = await execGit(cwd, ['pull', '--rebase']);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  if (/conflict|needs merge|would be overwritten/i.test(err)) {
    throw new Error(err);
  }
  const retry = await execGit(cwd, ['pull']);
  if (retry.code === 0) {
    return;
  }
  const retryErr = (retry.stderr + retry.stdout).trim();
  throw new Error(retryErr || err || `git pull failed (${retry.code})`);
}

export async function fetchRemote(cwd: string): Promise<void> {
  const res = await execGit(cwd, ['fetch', '--prune']);
  if (res.code === 0) {
    return;
  }
  const err = (res.stderr + res.stdout).trim();
  throw new Error(err || `git fetch failed (${res.code})`);
}
