import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { Expr, ExternalSource, SourceParamValues } from '@harnesys/contracts';
import { substituteParams } from '@harnesys/contracts';
import { DashboardWidgetValidationException } from '../../domain/dashboards/dashboard.error.ts';
import type {
  SourceHttpMethod,
  SourceRunRequest,
  SourceRunResult,
} from '../../domain/dashboards/source-runner.port.ts';
import { SourceRunnerPort } from '../../domain/dashboards/source-runner.port.ts';
import { applyVaultRefs, collectVaultRefs } from '../../domain/dashboards/vault-ref.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { vaultStorageKey } from '../../domain/secret/vault-keys.ts';
import type { EgressRule } from '../http/egress-guard.ts';
import { checkEgress } from '../http/egress-guard.ts';
import { cacheKeyOf, TtlCache } from './source-cache.ts';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CACHE_TTL_SECONDS = 60;
const DYNAMIC_EXPRESSION_REASON = 'dynamic_expression_requires_runtime';

@Injectable()
export class SourceRunnerAdapter extends SourceRunnerPort {
  private readonly logger: Logger;
  private readonly cache = new TtlCache<SourceRunResult>();

  constructor(
    private readonly secrets: SecretStorePort,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('dashboards-source-runner');
  }

  override async run(orgId: string, request: SourceRunRequest): Promise<SourceRunResult> {
    const source = request.source;
    const substituted = substituteParams(literalSourceValues(source), request.params);
    if (!substituted.ok) {
      return { ok: false, error: 'param_missing', param: substituted.param };
    }
    const values = substituted.value;
    const cacheable = request.cache !== false;
    const cacheKey = cacheable ? cacheKeyOf(orgId, request, values) : '';
    const ttl = source.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
    const cached = cacheable ? this.cache.get(cacheKey) : undefined;
    if (cached) {
      return { ...cached, cacheHit: true };
    }
    const resolved = await this.resolveSecrets(orgId, source.headers, values.query);
    if (resolved === null) {
      return { ok: false, error: 'secret_ref_unresolved' };
    }
    const target = withQuery(source.url, resolved.query);
    const verdict = await checkEgress(egressRuleFor(source.url), null, target);
    if (!verdict.allowed) {
      return { ok: false, error: 'egress_blocked' };
    }
    const result = await this.fetch(verdict.url, source.method, resolved.headers, values.body);
    if (cacheable && result.ok) {
      this.cache.set(cacheKey, result, ttl);
    }
    return result;
  }

  private async resolveSecrets(
    orgId: string,
    rawHeaders: Record<string, string> | undefined,
    rawQuery: Record<string, string> | undefined,
  ): Promise<{ headers?: Record<string, string>; query?: Record<string, string> } | null> {
    if (!hasVaultRefs(rawHeaders, rawQuery)) {
      return { headers: rawHeaders, query: rawQuery };
    }
    const headers = await this.resolveRecord(orgId, rawHeaders);
    if (headers === null) {
      return null;
    }
    const query = await this.resolveRecord(orgId, rawQuery);
    if (query === null) {
      return null;
    }
    return { headers, query };
  }

  private async resolveRecord(
    orgId: string,
    record: Record<string, string> | undefined,
  ): Promise<Record<string, string> | null> {
    if (!record) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      const resolved = await this.resolveValue(orgId, value);
      if (resolved === null) {
        return null;
      }
      out[key] = resolved;
    }
    return out;
  }

  private async resolveValue(orgId: string, value: string): Promise<string | null> {
    const refs = collectVaultRefs(value);
    if (refs.length === 0) {
      return value;
    }
    const resolvedByName = new Map<string, string>();
    for (const ref of refs) {
      if (resolvedByName.has(ref.name)) {
        continue;
      }
      const resolved =
        (await this.secrets.get(orgId, vaultStorageKey('variable', ref.name))) ??
        (await this.secrets.get(orgId, vaultStorageKey('secret', ref.name)));
      if (resolved === null) {
        return null;
      }
      resolvedByName.set(ref.name, resolved);
    }
    return applyVaultRefs(value, (name) => resolvedByName.get(name) ?? null);
  }

  private async fetch(
    url: URL,
    method: SourceHttpMethod,
    headers: Record<string, string> | undefined,
    body: unknown,
  ): Promise<SourceRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...(headers ?? {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: 'manual',
        signal: controller.signal,
      });
      const bytes = await readCapped(response);
      if (bytes === null) {
        return { ok: false, error: 'too_large' };
      }
      const text = new TextDecoder().decode(bytes);
      const json = parseJson(text);
      const fetchedAt = new Date().toISOString();
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, status: response.status, json, fetchedAt, cacheHit: false };
      }
      return { ok: false, status: response.status, error: 'http_error' };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(
        { host: url.host, outcome: aborted ? 'timeout' : 'network_error' },
        'dashboard source fetch failed',
      );
      return { ok: false, error: aborted ? 'timeout' : 'network_error' };
    } finally {
      clearTimeout(timer);
    }
  }
}

function hasVaultRefs(
  headers: Record<string, string> | undefined,
  query: Record<string, string> | undefined,
): boolean {
  const values = [...Object.values(headers ?? {}), ...Object.values(query ?? {})];
  return values.some((value) => collectVaultRefs(value).length > 0);
}

/**
 * The server holds no widget runtime state, so `query` and `body` expressions
 * must reduce to plain JSON. A `ref`/`tpl`/`fn` marker is rejected with a
 * validation error naming the field instead of being coerced to a string.
 */
function literalSourceValues(source: ExternalSource): SourceParamValues {
  const query =
    source.query === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(source.query).map(([key, expr]) => [
            key,
            queryValue(literalValue(expr, `query.${key}`)),
          ]),
        );
  const body = source.body === undefined ? undefined : literalValue(source.body, 'body');
  return {
    ...(query === undefined ? {} : { query }),
    ...(body === undefined ? {} : { body }),
  };
}

function literalValue(expr: Expr, field: string): unknown {
  if (Array.isArray(expr)) {
    return expr.map((entry) => literalValue(entry, field));
  }
  if (isRecord(expr)) {
    if ('ref' in expr || 'tpl' in expr || 'fn' in expr) {
      throw new DashboardWidgetValidationException('dynamic expression requires runtime state', {
        reason: DYNAMIC_EXPRESSION_REASON,
        field,
      });
    }
    if ('lit' in expr) {
      return expr.lit;
    }
    return Object.fromEntries(
      Object.entries(expr).map(([key, value]) => [key, literalValue(value as Expr, field)]),
    );
  }
  return expr;
}

function queryValue(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function egressRuleFor(rawUrl: string): EgressRule {
  let hostname = '';
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    hostname = '';
  }
  return { hosts: hostname ? [hostname] : [] };
}

function withQuery(url: string, query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) {
    return url;
  }
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/** Stream-read the response body and abort as soon as the byte cap is exceeded. */
async function readCapped(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function parseJson(text: string): unknown | null {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
