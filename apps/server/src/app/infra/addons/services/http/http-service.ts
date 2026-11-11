import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { AccountsFacadePort } from '../../../../application/apps/accounts-facade.port.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { PermissionEngine } from '../../dispatcher/permission-engine.ts';
import { resolveBoundAccountId } from '../account-binding.ts';
import { serviceMethod } from '../method.ts';
import { BindingsReader } from '../sinks.ts';
import { resolveAddonEgress } from './addon-egress.ts';
import { AddonHttpFetchPort } from './addon-fetch.port.ts';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const HTTP_LIMITS = { timeoutMs: 30000, maxResultKb: 8192 };

interface HttpAuthRequest {
  connection: string;
  accountId?: string;
  scheme: 'bearer' | 'basic' | 'header' | 'path';
  credentialKey?: string;
  header?: string;
  placeholder?: string;
}

interface HttpFetchParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  responseEncoding?: 'text' | 'base64';
  auth?: HttpAuthRequest;
}

@Injectable()
export class HttpHostService implements HostServiceModule {
  readonly namespace = 'http';
  readonly methods: readonly HostMethodSpec[];
  private readonly logger: Logger;

  constructor(
    private readonly accounts: AccountsFacadePort,
    private readonly bindings: BindingsReader,
    private readonly engine: PermissionEngine,
    private readonly fetcher: AddonHttpFetchPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-http');
    this.methods = [
      serviceMethod('http.fetch', HTTP_LIMITS, (ctx, params) => this.fetch(ctx, params)),
    ];
  }

  private async fetch(
    ctx: HostCallContext,
    params: HttpFetchParams,
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string | null;
    bodyBase64?: string;
  }> {
    const url =
      params.auth?.scheme === 'path'
        ? await this.urlWithPathCredential(ctx, params.url, params.auth)
        : new URL(params.url);
    await this.checkEgress(url, this.allowedHosts(ctx));
    const authHeader =
      params.auth && params.auth.scheme !== 'path'
        ? await this.buildAuthHeader(ctx, params.auth)
        : null;
    const headers: Record<string, string> = { ...(params.headers ?? {}) };
    if (authHeader) {
      headers.authorization = authHeader.value;
    }
    const response = await this.fetcher.fetch(url, {
      method: params.method ?? 'GET',
      headers,
      body: requestBody(params),
      signal: ctx.signal,
      redirect: 'manual',
    });
    await this.reportAuthFailure(ctx, params.auth, response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new AddonError('invalid_response', { detail: 'response exceeds 8 MiB' });
    }
    if (params.responseEncoding === 'base64') {
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: null,
        bodyBase64: bytes.byteLength === 0 ? '' : Buffer.from(bytes).toString('base64'),
      };
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: bytes.byteLength === 0 ? null : new TextDecoder().decode(bytes),
    };
  }

  protected checkEgress(url: URL, allowedHosts: readonly string[] | null): Promise<void> {
    return resolveAddonEgress(url, allowedHosts);
  }

  private allowedHosts(ctx: HostCallContext): readonly string[] | null {
    const scope = this.engine.scopeOf(ctx.grants, 'http.fetch');
    const hosts = scope?.hosts;
    return Array.isArray(hosts) ? hosts.map(String) : null;
  }

  private async credentialsOf(
    ctx: HostCallContext,
    auth: HttpAuthRequest,
  ): Promise<Record<string, string>> {
    if (!this.engine.grantsCover(ctx.grants, 'accounts.use', { connections: [auth.connection] })) {
      throw new AddonError('permission_denied', {
        detail: `permission 'accounts.use' covering connection '${auth.connection}' is required for http.fetch auth`,
      });
    }
    const rows = this.bindings.accountsFor(ctx.orgId, ctx.addonId, auth.connection);
    const accountId = resolveBoundAccountId(rows, auth.accountId);
    const { credentials } = await this.accounts.access(ctx.orgId, accountId);
    return credentials;
  }

  private async buildAuthHeader(
    ctx: HostCallContext,
    auth: HttpAuthRequest,
  ): Promise<{ value: string }> {
    const credentials = await this.credentialsOf(ctx, auth);
    switch (auth.scheme) {
      case 'bearer':
        return { value: `Bearer ${pickCredential(credentials, auth.credentialKey ?? 'token')}` };
      case 'basic': {
        const user = pickCredential(credentials, auth.credentialKey ?? 'username');
        const password = pickCredential(credentials, 'password');
        return { value: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` };
      }
      case 'header': {
        const name = auth.header ?? auth.credentialKey;
        if (!name) {
          throw new AddonError('invalid_params', {
            detail: 'auth.header or auth.credentialKey is required',
          });
        }
        return { value: pickCredential(credentials, auth.credentialKey ?? name) };
      }
      case 'path':
        throw new AddonError('invalid_params', {
          detail: 'scheme path injects the credential into the URL and sends no header',
        });
    }
  }

  private async urlWithPathCredential(
    ctx: HostCallContext,
    rawUrl: string,
    auth: HttpAuthRequest,
  ): Promise<URL> {
    const placeholder = auth.placeholder ?? '{token}';
    if (!rawUrl.includes(placeholder)) {
      throw new AddonError('invalid_params', {
        detail: `url does not contain the auth placeholder '${placeholder}'`,
      });
    }
    const credentials = await this.credentialsOf(ctx, auth);
    const credential = pickCredential(credentials, auth.credentialKey ?? 'token');
    assertPathCredential(credential);
    return new URL(rawUrl.replaceAll(placeholder, credential));
  }

  private async reportAuthFailure(
    ctx: HostCallContext,
    auth: HttpAuthRequest | undefined,
    status: number,
  ): Promise<void> {
    if (!auth || (status !== 401 && status !== 403)) {
      return;
    }
    try {
      const rows = this.bindings.accountsFor(ctx.orgId, ctx.addonId, auth.connection);
      const accountId = resolveBoundAccountId(rows, auth.accountId);
      await this.accounts.report(
        ctx.orgId,
        accountId,
        status === 401 ? 'invalid_credentials' : 'denied',
      );
    } catch (_error) {
      this.logger.warn(
        { addonId: ctx.addonId, status },
        'failed to report auth failure to accounts',
      );
    }
  }
}

const PATH_CREDENTIAL = /^[A-Za-z0-9._~:-]+$/;

function assertPathCredential(value: string): void {
  if (!PATH_CREDENTIAL.test(value)) {
    throw new AddonError('invalid_params', {
      detail: 'credential contains characters that are not safe in a URL path',
    });
  }
}

function requestBody(params: HttpFetchParams): string | Uint8Array | undefined {
  if (params.bodyBase64 !== undefined) {
    return Uint8Array.from(Buffer.from(params.bodyBase64, 'base64'));
  }
  return params.body;
}

function pickCredential(credentials: Record<string, string>, key: string): string {
  const value = credentials[key];
  if (value === undefined || value === '') {
    throw new AddonError('account_failed', {
      detail: `credential '${key}' is missing`,
      accountCode: 'invalid_credentials',
    });
  }
  return value;
}
