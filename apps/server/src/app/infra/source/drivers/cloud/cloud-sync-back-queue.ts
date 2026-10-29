import { trace } from '../../../../libs/trace.ts';
import type { CloudChangeKind } from './cloud-sync-back.ts';

export const SYNC_BACK_DEBOUNCE_MS = 2_000;
const DRAIN_INTERVAL_MS = 500;
const MAX_SYNC_RETRIES = 5;
const SYNC_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export interface PendingCloudChange {
  orgId: string;
  sourceId: string;
  path: string;
  kind: CloudChangeKind;
}

export class CloudSyncBackQueue {
  private readonly pending = new Map<string, Map<string, number>>();
  private readonly kinds = new Map<string, Map<string, CloudChangeKind>>();
  private readonly retries = new Map<string, Map<string, number>>();
  private drain: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly process: (change: PendingCloudChange) => Promise<void>) {}

  enqueue(change: PendingCloudChange): void {
    if (isInternalCloudPath(change.path)) {
      return;
    }
    const key = `${change.sourceId}:${change.path}`;
    const paths = this.pending.get(change.orgId) ?? new Map<string, number>();
    const kinds = this.kinds.get(change.orgId) ?? new Map<string, CloudChangeKind>();
    paths.set(key, Date.now());
    kinds.set(key, change.kind);
    this.retries.get(change.orgId)?.delete(key);
    this.pending.set(change.orgId, paths);
    this.kinds.set(change.orgId, kinds);
    this.ensureDrain();
  }

  clearOrg(orgId: string): void {
    this.pending.delete(orgId);
    this.kinds.delete(orgId);
    this.retries.delete(orgId);
  }

  clearSource(orgId: string, sourceId: string): void {
    const prefix = `${sourceId}:`;
    for (const paths of [this.pending.get(orgId), this.kinds.get(orgId), this.retries.get(orgId)]) {
      if (!paths) {
        continue;
      }
      for (const path of paths.keys()) {
        if (path.startsWith(prefix)) {
          paths.delete(path);
        }
      }
    }
  }

  private ensureDrain(): void {
    if (this.drain) {
      return;
    }
    this.drain = setInterval(() => this.drainDue(), DRAIN_INTERVAL_MS);
    this.drain.unref();
  }

  private async drainDue(): Promise<void> {
    for (const [orgId, pending] of [...this.pending]) {
      const due = coalescePaths(pending, Date.now(), SYNC_BACK_DEBOUNCE_MS);
      due.sort((left, right) => comparePendingPaths(this.kinds.get(orgId), left, right));
      await this.processDue(orgId, due);
    }
    if ([...this.pending.values()].every((paths) => paths.size === 0) && this.drain) {
      clearInterval(this.drain);
      this.drain = null;
    }
  }

  private async processDue(orgId: string, due: string[]): Promise<void> {
    for (const key of due) {
      const separator = key.indexOf(':');
      const sourceId = key.slice(0, separator);
      const path = key.slice(separator + 1);
      const kind = this.kinds.get(orgId)?.get(key) ?? 'change';
      this.kinds.get(orgId)?.delete(key);
      try {
        await this.process({ orgId, sourceId, path, kind });
        this.retries.get(orgId)?.delete(key);
      } catch (err) {
        trace('cloud-sync-back', 'syncBack failed', { orgId, sourceId, path, error: String(err) });
        this.scheduleRetry(orgId, key, kind);
      }
    }
  }

  private scheduleRetry(orgId: string, key: string, kind: CloudChangeKind): void {
    const attempts = this.retries.get(orgId) ?? new Map<string, number>();
    const count = (attempts.get(key) ?? 0) + 1;
    if (count > MAX_SYNC_RETRIES) {
      attempts.delete(key);
      this.retries.set(orgId, attempts);
      return;
    }
    attempts.set(key, count);
    this.retries.set(orgId, attempts);
    const delay = SYNC_RETRY_DELAYS_MS[count - 1] ?? 60_000;
    const paths = this.pending.get(orgId) ?? new Map<string, number>();
    paths.set(key, Date.now() + delay - SYNC_BACK_DEBOUNCE_MS);
    this.pending.set(orgId, paths);
    this.kinds.get(orgId)?.set(key, kind);
  }
}

export function coalescePaths(
  pending: Map<string, number>,
  now: number,
  debounceMs: number,
): string[] {
  const due: string[] = [];
  for (const [path, changedAt] of pending) {
    if (now - changedAt >= debounceMs) {
      due.push(path);
      pending.delete(path);
    }
  }
  return due;
}

export function comparePendingPaths(
  kinds: Map<string, CloudChangeKind> | undefined,
  left: string,
  right: string,
): number {
  const leftKind = kinds?.get(left) ?? 'change';
  const rightKind = kinds?.get(right) ?? 'change';
  if (leftKind === 'delete' && rightKind !== 'delete') {
    return 1;
  }
  if (leftKind !== 'delete' && rightKind === 'delete') {
    return -1;
  }
  const leftDepth = left.slice(left.indexOf(':') + 1).split('/').length;
  const rightDepth = right.slice(right.indexOf(':') + 1).split('/').length;
  return leftKind === 'delete' ? rightDepth - leftDepth : leftDepth - rightDepth;
}

export function isInternalCloudPath(path: string): boolean {
  return path.split(/[/\\]/).some((part) => part === '.harnesys-mirror' || part === '.git');
}
