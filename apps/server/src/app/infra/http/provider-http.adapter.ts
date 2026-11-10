import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { EgressPolicy } from '../../domain/apps/egress.ts';
import { ProviderHttpFactoryPort } from '../../domain/apps/ports/provider-http.port.ts';
import type { HttpOutcome, HttpRequest, ProviderHttp } from '../../domain/apps/provider-module.ts';
import { checkEgress } from './egress-guard.ts';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class ProviderHttpAdapter extends ProviderHttpFactoryPort {
  private readonly logger: Logger;

  constructor(@Inject(Logger) logger: Logger) {
    super();
    this.logger = logger.child('apps-http');
  }

  create(policy: EgressPolicy, userHost: string | null): ProviderHttp {
    return {
      send: (request) => this.send(policy, userHost, request),
    };
  }

  private async send(
    policy: EgressPolicy,
    userHost: string | null,
    request: HttpRequest,
  ): Promise<HttpOutcome> {
    const target = withQuery(request.url, request.query);
    const verdict = await checkEgress(policy, userHost, target);
    if (!verdict.allowed) {
      return { kind: 'blocked' };
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    );
    try {
      const response = await fetch(verdict.url, {
        method: request.method,
        headers: buildHeaders(request),
        body: buildBody(request),
        redirect: 'manual',
        signal: controller.signal,
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        return { kind: 'too_large' };
      }
      const text = new TextDecoder().decode(bytes);
      return {
        kind: response.status >= 200 && response.status < 300 ? 'ok' : 'http_error',
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text,
        json: parseJson(text),
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(
        { host: verdict.url.host, outcome: aborted ? 'timeout' : 'network_error' },
        'provider http request failed',
      );
      return { kind: aborted ? 'timeout' : 'network_error' };
    } finally {
      clearTimeout(timer);
    }
  }
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

function buildHeaders(request: HttpRequest): Record<string, string> {
  const headers: Record<string, string> = { ...(request.headers ?? {}) };
  if (request.body && 'json' in request.body) {
    headers['content-type'] = 'application/json';
  }
  if (request.body && 'form' in request.body) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  if (request.body && 'raw' in request.body) {
    headers['content-type'] = request.body.contentType;
  }
  if (request.basicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${request.basicAuth.user}:${request.basicAuth.pass}`).toString('base64')}`;
  }
  return headers;
}

function buildBody(request: HttpRequest): string | Uint8Array | undefined {
  if (!request.body) {
    return undefined;
  }
  if ('json' in request.body) {
    return JSON.stringify(request.body.json);
  }
  if ('form' in request.body) {
    return new URLSearchParams(request.body.form).toString();
  }
  return request.body.raw;
}

function parseJson(text: string): unknown | null {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
