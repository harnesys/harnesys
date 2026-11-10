import type { AddonManifest } from '../manifest/manifest.ts';
import { isBaselinePermissionId } from '../permissions/permissions.ts';
import { AddonError } from '../protocol/error.ts';
import type { FakeDb } from './fake-db.ts';
import type { FakeAccount, FakeHostOptions } from './fake-host.ts';

export interface FakeServiceSinks {
  logs: Array<{ level: string; message: string; fields?: Record<string, unknown> }>;
  emitted: Array<{ name: string; payload: unknown }>;
  dispatchedRuns: Array<{ threadId?: string; agentId?: string; input: string }>;
  createdThreads: string[];
  accountReports: Array<{ connection: string; accountId?: string; code: string }>;
  workerReports: Array<{ workerId: string; state: string; code?: string }>;
  inboundMessages: Array<{ channel: string; from?: string; text: string; payload?: unknown }>;
}

export interface FakeServiceContext {
  manifest: AddonManifest;
  options: FakeHostOptions;
  db: FakeDb;
  sinks: FakeServiceSinks;
  startedTriggers: Set<string>;
  firedKeys: Set<string>;
}

type ServiceParams = Record<string, unknown>;

export function createFakeServices(context: FakeServiceContext): {
  execute(method: string, params: ServiceParams): Promise<unknown>;
  hasGrant(permission: string): boolean;
} {
  const grants: Array<{ id: string; scope?: Record<string, unknown> }> =
    context.options.grants ??
    context.manifest.permissions.map((p) => ({ id: p.id, scope: p.scope }));

  function granted(
    permission: string,
  ): { id: string; scope?: Record<string, unknown> } | undefined {
    if (isBaselinePermissionId(permission)) {
      return { id: permission };
    }
    if (
      permission === 'trigger' &&
      context.manifest.contributions.some((c) => c.family === 'trigger')
    ) {
      return { id: permission };
    }
    if (
      permission === 'worker' &&
      context.manifest.contributions.some((c) => c.family === 'worker')
    ) {
      return { id: permission };
    }
    return grants.find((grant) => grant.id === permission);
  }

  function hasGrant(permission: string): boolean {
    return granted(permission) !== undefined;
  }

  async function execute(method: string, params: ServiceParams): Promise<unknown> {
    switch (method) {
      case 'db.exec':
      case 'db.all':
      case 'db.get':
      case 'db.run':
      case 'db.batch':
        return executeDb(method, params);
      case 'accounts.list':
      case 'accounts.report':
      case 'accounts.access':
        return executeAccounts(method, params);
      case 'http.fetch':
        return executeHttp(params);
      case 'triggers.fire':
        return fireTrigger(params);
      default:
        return executeRecord(method, params);
    }
  }

  function executeDb(method: string, params: ServiceParams): unknown {
    const db = context.db;
    switch (method) {
      case 'db.exec':
        db.exec(params.sql as string);
        return {};
      case 'db.all':
        return { rows: db.all(params.sql as string, params.params as never) };
      case 'db.get':
        return { row: db.get(params.sql as string, params.params as never) };
      case 'db.run':
        return db.run(params.sql as string, params.params as never);
      default:
        return { results: db.batch(params.statements as never) };
    }
  }

  async function executeAccounts(method: string, params: ServiceParams): Promise<unknown> {
    const connection = params.connection as string;
    assertConnection(connection);
    if (method === 'accounts.list') {
      const accounts = boundAccounts(connection);
      return {
        accounts: accounts.map((account) => ({
          accountId: account.accountId,
          label: account.label ?? account.accountId,
          externalAccountId: account.externalAccountId ?? account.accountId,
          status: account.status ?? 'connected',
        })),
      };
    }
    if (method === 'accounts.report') {
      context.sinks.accountReports.push({
        connection,
        accountId: params.accountId as string | undefined,
        code: params.code as string,
      });
      return {};
    }
    const account = selectAccount(connection, params.accountId as string | undefined);
    return { credentials: account.credentials ?? null, expiresAt: account.expiresAt };
  }

  async function executeHttp(params: ServiceParams): Promise<unknown> {
    const request = params as {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: string;
    };
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw new AddonError('invalid_params', { detail: `url '${request.url}' is not valid` });
    }
    if (url.protocol !== 'https:') {
      throw new AddonError('permission_denied', { detail: 'egress policy allows https only' });
    }
    const grant = granted('http.fetch');
    if (
      grant?.scope &&
      Array.isArray(grant.scope.hosts) &&
      !(grant.scope.hosts as string[]).includes(url.host)
    ) {
      throw new AddonError('permission_denied', {
        detail: `host '${url.host}' is outside the granted scope`,
      });
    }
    if (!context.options.http) {
      throw new AddonError('unavailable', { detail: 'fake host has no http handler configured' });
    }
    const response = await context.options.http({
      url: request.url,
      method: request.method,
      headers: request.headers ?? {},
      body: request.body,
      auth: params.auth,
    });
    return {
      status: response.status,
      headers: response.headers ?? {},
      body: response.body ?? null,
    };
  }

  function fireTrigger(params: ServiceParams): unknown {
    const instanceId = params.instanceId as string;
    const runKey = params.runKey as string;
    if (!context.startedTriggers.has(instanceId)) {
      throw new AddonError('not_found', {
        detail: `trigger instance '${instanceId}' was not started`,
      });
    }
    const key = `${instanceId}:${runKey}`;
    if (context.firedKeys.has(key)) {
      return { outcome: 'suppressed' };
    }
    context.firedKeys.add(key);
    return { outcome: 'fired' };
  }

  function executeRecord(method: string, params: ServiceParams): unknown {
    const sinks = context.sinks;
    switch (method) {
      case 'config.get':
        return configValues(params.keys as string[] | undefined);
      case 'secrets.get': {
        const value = context.options.secrets?.[params.key as string];
        return { value: value === undefined ? null : value };
      }
      case 'log.write':
        sinks.logs.push({
          level: params.level as string,
          message: params.message as string,
          fields: params.fields as never,
        });
        return {};
      case 'events.emit': {
        const name = params.name as string;
        if (!name.startsWith(`${context.manifest.id}.`)) {
          throw new AddonError('invalid_params', {
            detail: `events.emit name '${name}' is outside the addon namespace '${context.manifest.id}.*'`,
          });
        }
        sinks.emitted.push({ name, payload: params.payload });
        return {};
      }
      case 'runs.dispatch':
        sinks.dispatchedRuns.push(params as never);
        return { runId: `run-${sinks.dispatchedRuns.length}` };
      case 'threads.create': {
        const threadId = `thread-${sinks.createdThreads.length + 1}`;
        sinks.createdThreads.push(threadId);
        return { threadId };
      }
      case 'bridge.inbound':
        sinks.inboundMessages.push(params.message as never);
        return {};
      case 'workers.report':
        sinks.workerReports.push(params as never);
        return {};
      default:
        throw new AddonError('unsupported', {
          detail: `fake host has no service implementation for '${method}'`,
        });
    }
  }

  function configValues(keys: string[] | undefined): unknown {
    const values: Record<string, unknown> = { ...context.options.config };
    if (!keys) {
      return { values };
    }
    return {
      values: Object.fromEntries(
        keys.filter((key) => key in values).map((key) => [key, values[key]]),
      ),
    };
  }

  function boundAccounts(connection: string): FakeAccount[] {
    return (context.options.accounts ?? []).filter((account) => account.connection === connection);
  }

  function assertConnection(connection: string): void {
    const declared = context.manifest.connections.some(
      (requirement) => requirement.id === connection,
    );
    if (!declared) {
      throw new AddonError('invalid_params', {
        detail: `connection '${connection}' is not declared in the manifest`,
      });
    }
  }

  function selectAccount(connection: string, accountId: string | undefined): FakeAccount {
    const accounts = boundAccounts(connection);
    if (accounts.length === 0) {
      throw new AddonError('account_failed', {
        detail: `no account is bound to connection '${connection}'`,
        accountCode: 'not_connected',
      });
    }
    if (accountId === undefined) {
      if (accounts.length > 1) {
        throw new AddonError('invalid_params', {
          detail: `accountId is required: connection '${connection}' has ${accounts.length} bindings`,
        });
      }
      return accounts[0] as FakeAccount;
    }
    const found = accounts.find((account) => account.accountId === accountId);
    if (!found) {
      throw new AddonError('account_failed', {
        detail: `account '${accountId}' is not bound to '${connection}'`,
        accountCode: 'not_bound',
      });
    }
    return found;
  }

  return { execute, hasGrant };
}
