import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitDiffResponse, GitFileStatus } from '../../../../../domain/source/git-vcs.types.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { parsePorcelain } from './git-helpers.ts';

export async function getDiff(safeCwd: string, filePath: string): Promise<GitDiffResponse> {
  const cleanPath = filePath.trim().replace(/^\/+/, '');
  if (!cleanPath || cleanPath.includes('\0') || cleanPath.includes('\n')) {
    throw new Error('invalid path');
  }
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    throw new Error('not a git repository');
  }
  const status = await resolveDiffStatus(safeCwd, cleanPath);
  const originalResult = await readOriginal(safeCwd, cleanPath);
  let isBinary = originalResult.isBinary;
  let original = originalResult.original;
  const currentResult = await readCurrent(safeCwd, cleanPath);
  if (currentResult.isBinary) {
    isBinary = true;
  }
  let current = currentResult.current;
  if (status === 'deleted') {
    current = null;
  }
  if (status === 'untracked' && original !== null) {
    original = null;
  }
  const diff = await buildDiffText(safeCwd, cleanPath, status, current);
  return {
    path: cleanPath,
    status,
    original,
    current,
    diff,
    isBinary,
    truncated: (original?.includes('… truncated') || current?.includes('… truncated')) ?? false,
  };
}

async function resolveDiffStatus(safeCwd: string, cleanPath: string): Promise<GitFileStatus> {
  const rawStatus = await execGit(safeCwd, [
    'status',
    '--porcelain=v1',
    '-z',
    '--no-renames',
    '--untracked-files=all',
    '--ignored',
    '--',
    cleanPath,
  ])
    .then((r) => (r.code === 0 ? r.stdout : ''))
    .catch(() => '');
  const map = parsePorcelain(rawStatus);
  const fromMap = map[cleanPath];
  if (fromMap) {
    return fromMap;
  }
  const abs = join(safeCwd, cleanPath);
  const exists = await stat(abs)
    .then(() => true)
    .catch(() => false);
  const ls = await execGit(safeCwd, ['ls-files', '--error-unmatch', cleanPath]);
  if (!exists) {
    return ls.code === 0 ? 'deleted' : 'modified';
  }
  return ls.code === 0 ? 'modified' : 'untracked';
}

async function readOriginal(
  safeCwd: string,
  cleanPath: string,
): Promise<{ original: string | null; isBinary: boolean }> {
  try {
    const res = await execGit(safeCwd, ['show', `HEAD:${cleanPath}`]);
    if (res.code !== 0) {
      return { original: null, isBinary: false };
    }
    const buf = Buffer.from(res.stdout, 'utf8');
    if (buf.includes(0)) {
      return { original: null, isBinary: true };
    }
    if (res.stdout.length > 500000) {
      return { original: `${res.stdout.slice(0, 500000)}\n… truncated`, isBinary: false };
    }
    return { original: res.stdout, isBinary: false };
  } catch {
    return { original: null, isBinary: false };
  }
}

async function readCurrent(
  safeCwd: string,
  cleanPath: string,
): Promise<{ current: string | null; isBinary: boolean }> {
  const absPath = join(safeCwd, cleanPath);
  try {
    const st = await stat(absPath);
    if (st.isDirectory()) {
      return { current: null, isBinary: true };
    }
    if (!st.isFile()) {
      return { current: null, isBinary: false };
    }
    const buf = await readFile(absPath);
    if (buf.includes(0)) {
      return { current: null, isBinary: true };
    }
    const text = buf.toString('utf8');
    if (st.size > 1000000) {
      return { current: `${text.slice(0, 500000)}\n… truncated`, isBinary: false };
    }
    return { current: text, isBinary: false };
  } catch {
    return { current: null, isBinary: false };
  }
}

async function buildDiffText(
  safeCwd: string,
  cleanPath: string,
  status: GitFileStatus,
  current: string | null,
): Promise<string | null> {
  try {
    const res = await execGit(safeCwd, [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '-U3',
      'HEAD',
      '--',
      cleanPath,
    ]);
    if (res.code === 0 && res.stdout.trim()) {
      return res.stdout;
    }
    const res2 = await execGit(safeCwd, ['diff', '--no-color', '-U3', '--', cleanPath]);
    if (res2.code === 0 && res2.stdout.trim()) {
      return res2.stdout;
    }
    if ((status === 'untracked' || status === 'added') && current !== null) {
      return `--- /dev/null\n+++ b/${cleanPath}\n${current
        .split('\n')
        .map((l) => `+${l}`)
        .join('\n')}`;
    }
    return null;
  } catch {
    return null;
  }
}
