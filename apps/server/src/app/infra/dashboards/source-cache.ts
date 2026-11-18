import type { WidgetParams, WidgetParamValue } from '@harnesys/contracts';
import type { SourceParamValues } from '../../domain/dashboards/param-ref.ts';
import type { SourceRunRequest } from '../../domain/dashboards/source-runner.port.ts';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const EVICT_EXPIRED_THRESHOLD = 512;
const MAX_ENTRIES = 1024;

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlSeconds: number): void {
    if (ttlSeconds <= 0) {
      return;
    }
    if (this.entries.size > EVICT_EXPIRED_THRESHOLD) {
      this.evictExpired();
    }
    this.evictOverflow();
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  private evictExpired(): void {
    const nowMs = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  /** Map preserves insertion order — drop the oldest unexpired entries at the hard cap. */
  private evictOverflow(): void {
    while (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        return;
      }
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * Cache identity of one source run. Resolved query and body already carry the
 * substituted params, and the params themselves are part of the key so two
 * param sets never share an entry even when the substitution is identical.
 */
export function cacheKeyOf(
  orgId: string,
  request: SourceRunRequest,
  values: SourceParamValues,
): string {
  const source = request.source;
  return [
    orgId,
    request.widgetId,
    source.id,
    source.method,
    source.url,
    JSON.stringify(values.query ?? {}),
    stableHash(source.headers ?? {}),
    stableHash(values.body ?? {}),
    stableHash(sortedParams(request.params)),
  ].join('|');
}

/** Params sorted by name so the key does not depend on the client's key order. */
function sortedParams(params: WidgetParams | undefined): Record<string, WidgetParamValue> {
  const out: Record<string, WidgetParamValue> = {};
  if (!params) {
    return out;
  }
  for (const name of Object.keys(params).sort()) {
    const value = params[name];
    if (value !== undefined) {
      out[name] = value;
    }
  }
  return out;
}

/** Deterministic non-crypto hash for cache-key material; secrets are never cached here. */
function stableHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0;
  }
  return String(hash);
}
