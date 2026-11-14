import type { OrgRuntime } from './org-runtime.types.ts';

export interface OrgRuntimeEntry {
  promise: Promise<OrgRuntime>;
  revision: number;
}

export type OrgRuntimeCache = Map<string, OrgRuntimeEntry>;

/**
 * Returns the cached runtime when it was built for the current pack revision.
 * A stale entry (an add-on registered or removed since) is dropped and closed
 * when idle so the next call rebuilds it with the new pack set.
 */
export function cachedRuntimeOf(
  cache: OrgRuntimeCache,
  orgId: string,
  revision: number,
): Promise<OrgRuntime> | undefined {
  const entry = cache.get(orgId);
  if (entry === undefined) {
    return undefined;
  }
  if (entry.revision === revision) {
    return entry.promise;
  }
  cache.delete(orgId);
  void entry.promise.then((runtime) => runtime.closeWhenIdle()).catch(() => {});
  return undefined;
}

export function storeRuntime(
  cache: OrgRuntimeCache,
  orgId: string,
  promise: Promise<OrgRuntime>,
  revision: number,
): void {
  const entry: OrgRuntimeEntry = { promise, revision };
  cache.set(orgId, entry);
  promise.catch(() => {
    if (cache.get(orgId) === entry) {
      cache.delete(orgId);
    }
  });
}

export function takeRuntime(
  cache: OrgRuntimeCache,
  orgId: string,
): Promise<OrgRuntime> | undefined {
  const entry = cache.get(orgId);
  if (entry === undefined) {
    return undefined;
  }
  cache.delete(orgId);
  return entry.promise;
}

export function drainRuntimes(cache: OrgRuntimeCache): void {
  for (const entry of cache.values()) {
    void entry.promise.then((runtime) => runtime.close()).catch(() => {});
  }
  cache.clear();
}
