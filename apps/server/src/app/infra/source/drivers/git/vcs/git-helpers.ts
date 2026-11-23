import type {
  GitFileStatus,
  GitFileStatusMap,
} from '../../../../../domain/source/git-vcs.types.ts';

export function parsePorcelain(raw: string): GitFileStatusMap {
  const map: GitFileStatusMap = {};
  if (!raw) {
    return map;
  }
  const parts = raw.split('\0');
  for (const entry of parts) {
    if (!entry || entry.length < 3) {
      continue;
    }
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) {
      continue;
    }
    map[path] = xyToStatus(xy);
  }
  return map;
}

export function parsePorcelainSides(raw: string): {
  stagedPaths: string[];
  unstagedPaths: string[];
} {
  const stagedPaths: string[] = [];
  const unstagedPaths: string[] = [];
  const stagedSeen = new Set<string>();
  const unstagedSeen = new Set<string>();
  for (const { xy, path } of splitStatusEntries(raw)) {
    if (isStagedSide(xy)) {
      pushUnique(stagedPaths, stagedSeen, path);
    }
    if (isUnstagedSide(xy)) {
      pushUnique(unstagedPaths, unstagedSeen, path);
    }
  }
  return { stagedPaths, unstagedPaths };
}

function splitStatusEntries(raw: string): Array<{ xy: string; path: string }> {
  if (!raw) {
    return [];
  }
  const entries: Array<{ xy: string; path: string }> = [];
  for (const entry of raw.split('\0')) {
    if (!entry || entry.length < 3) {
      continue;
    }
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path || xy === '!!') {
      continue;
    }
    entries.push({ xy, path });
  }
  return entries;
}

function isStagedSide(xy: string): boolean {
  const x = xy[0] ?? ' ';
  return x !== ' ' && x !== '?' && x !== '!';
}

function isUnstagedSide(xy: string): boolean {
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  const conflicted = x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD';
  return (y !== ' ' && y !== '?') || xy === '??' || conflicted;
}

function pushUnique(list: string[], seen: Set<string>, path: string): void {
  if (seen.has(path)) {
    return;
  }
  seen.add(path);
  list.push(path);
}

export function sanitizePaths(paths: string[]): string[] {
  return paths
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.includes('\0') && !p.includes('\n'));
}

export function xyToStatus(xy: string): GitFileStatus {
  if (xy === '??') {
    return 'untracked';
  }
  if (xy === '!!') {
    return 'ignored';
  }
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  if (x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD') {
    return 'conflicted';
  }
  if (x === '?' || y === '?') {
    return 'untracked';
  }
  if (x !== ' ' && x !== '?' && x !== '!' && y === ' ') {
    return stagedLetterStatus(x);
  }
  if (y !== ' ') {
    return 'modified';
  }
  if (x === 'A') {
    return 'added';
  }
  return 'modified';
}

function stagedLetterStatus(x: string): GitFileStatus {
  if (x === 'A') {
    return 'added';
  }
  if (x === 'D') {
    return 'deleted';
  }
  if (x === 'R') {
    return 'renamed';
  }
  return 'staged';
}

export function statusRank(status: GitFileStatus): number {
  switch (status) {
    case 'conflicted':
      return 6;
    case 'modified':
      return 5;
    case 'staged':
    case 'added':
      return 4;
    case 'renamed':
      return 3;
    case 'untracked':
      return 2;
    case 'deleted':
      return 1;
    case 'ignored':
      return 0;
    default:
      return -1;
  }
}
