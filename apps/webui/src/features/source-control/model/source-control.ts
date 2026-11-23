import type { GitFileStatus, GitFileStatusResponse } from '@harnesys/studio-shared';

export interface SourceControlDialogData {
  projectId: string;
  message?: string;
  focusPath?: string;
}

export type SourceControlTab = 'changes' | 'history';

export interface FileEntry {
  path: string;
  status: GitFileStatus;
}

export interface FileGroups {
  staged: FileEntry[];
  unstaged: FileEntry[];
  files: FileEntry[];
}

export interface DiscardRequest {
  paths: string[];
  untrackedPaths: string[];
  deletable: boolean;
  defaultDeleteUntracked: boolean;
}

const STAGED_STATUSES = new Set<GitFileStatus>(['staged', 'added', 'renamed']);

export function isStagedStatus(status: GitFileStatus): boolean {
  return STAGED_STATUSES.has(status);
}

export function isDeletableStatus(status: GitFileStatus): boolean {
  return status === 'untracked' || status === 'added';
}

export function deriveFileGroups(response: GitFileStatusResponse | undefined): FileGroups {
  if (!response) {
    return { staged: [], unstaged: [], files: [] };
  }
  const files = Object.entries(response.map)
    .filter(([, status]) => status !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const stagedSet = response.stagedPaths
    ? new Set(response.stagedPaths)
    : new Set(files.filter((file) => isStagedStatus(file.status)).map((file) => file.path));
  const unstagedSet = response.unstagedPaths
    ? new Set(response.unstagedPaths)
    : new Set(files.filter((file) => !stagedSet.has(file.path)).map((file) => file.path));
  return {
    staged: files.filter((file) => stagedSet.has(file.path)),
    unstaged: files.filter((file) => unstagedSet.has(file.path)),
    files,
  };
}

export function buildDiscardRequest(entries: FileEntry[]): DiscardRequest {
  const paths = entries.map((entry) => entry.path);
  const untrackedPaths = entries
    .filter((entry) => isDeletableStatus(entry.status))
    .map((entry) => entry.path);
  const deletable = untrackedPaths.length > 0;
  const defaultDeleteUntracked =
    entries.length > 0 && entries.every((entry) => isDeletableStatus(entry.status));
  return { paths, untrackedPaths, deletable, defaultDeleteUntracked };
}

export function remoteCommitUrl(remote: string | null | undefined, sha: string): string | null {
  const url = remote?.trim();
  if (!url) {
    return null;
  }
  const https = url.match(/^https?:\/\/([^/]+)\/(.+)$/i);
  if (https) {
    return `https://${https[1]}/${normalizeRepoPath(https[2])}/commit/${sha}`;
  }
  const ssh = url.match(/^git@([^:]+):(.+)$/);
  if (ssh) {
    return `https://${ssh[1]}/${normalizeRepoPath(ssh[2])}/commit/${sha}`;
  }
  return null;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\.git$/i, '').replace(/\/+$/, '');
}

export function isHeadRef(ref: string): boolean {
  return ref === 'HEAD' || ref.startsWith('HEAD ->');
}

export function refLabel(ref: string): string {
  if (ref.startsWith('HEAD ->')) {
    return ref.slice('HEAD ->'.length).trim();
  }
  if (ref.startsWith('tag:')) {
    return ref.slice('tag:'.length).trim();
  }
  return ref;
}

export function historyDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
  }
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function splitPatchByFile(patch: string): Map<string, string> {
  const chunks = new Map<string, string>();
  const lines = patch.split('\n');
  let currentPath: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentPath && buffer.length > 0) {
      chunks.set(currentPath, buffer.join('\n'));
    }
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (match) {
      flush();
      currentPath = match[2] ?? match[1] ?? null;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}

export function statusLabel(status: GitFileStatus): string {
  if (status === 'untracked') {
    return 'U';
  }
  if (status === 'modified') {
    return 'M';
  }
  if (status === 'added') {
    return 'A';
  }
  if (status === 'deleted') {
    return 'D';
  }
  if (status === 'staged') {
    return 'S';
  }
  if (status === 'conflicted') {
    return 'C';
  }
  if (status === 'renamed') {
    return 'R';
  }
  return status.slice(0, 1).toUpperCase();
}

export function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'staged':
      return 'text-status-ok';
    case 'untracked':
      return 'text-destructive/80';
    case 'deleted':
      return 'text-muted-foreground';
    case 'modified':
      return 'text-status-info';
    case 'conflicted':
      return 'text-destructive';
    case 'renamed':
      return 'text-status-info';
    default:
      return 'text-muted-foreground';
  }
}

export function badgeColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'staged':
      return 'bg-status-ok/15 text-status-ok';
    case 'untracked':
      return 'bg-destructive/15 text-destructive';
    case 'modified':
      return 'bg-status-info/15 text-status-info';
    case 'deleted':
      return 'bg-muted text-muted-foreground line-through';
    case 'conflicted':
      return 'bg-destructive/15 text-destructive';
    case 'renamed':
      return 'bg-status-info/15 text-status-info';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
