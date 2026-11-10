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
  scheme: 'bearer' | 'basic' | 'header';
  credentialKey?: string;
  header?: string;
}

interface HttpFetchParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
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
  }> {
    const url = new URL(params.url);
    await this.checkEgress(url, this.allowedHosts(ctx));
    const authHeader = params.auth ? await this.buildAuthHeader(ctx, params.auth) : null;
    const headers: Record<string, string> = { ...(params.headers ?? {}) };
    if (authHeader) {
      headers.authorization = authHeader.value;
    }
    const response = await this.fetcher.fetch(url, {
      method: params.method ?? 'GET',
      headers,
      body: params.body,
      signal: ctx.signal,
      redirect: 'manual',
    });
    await this.reportAuthFailure(ctx, params.auth, response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new AddonError('invalid_response', { detail: 'response exceeds 8 MiB' });
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

  private async buildAuthHeader(
    ctx: HostCallContext,
    auth: HttpAuthRequest,
  ): Promise<{ value: string }> {
    const rows = this.bindings.accountsFor(ctx.orgId, ctx.addonId, auth.connection);
    const accountId = resolveBoundAccountId(rows, auth.accountId);
    const { credentials } = await this.accounts.access(ctx.orgId, accountId);
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
    }
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
