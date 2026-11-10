import type { ResolvedAddonDefinition } from '../define-addon.ts';
import type { HostChannel } from '../host-client.ts';
import type { AddonManifest } from '../manifest/manifest.ts';
import { AddonError } from '../protocol/error.ts';
import { methodSpec } from '../protocol/map.ts';
import type { CallMeta } from '../protocol/meta.ts';
import { type AddonRuntime, createAddonRuntime } from '../runtime.ts';
import { createFakeDb, type FakeDb } from './fake-db.ts';
import { createFakeServices } from './fake-services.ts';

export interface FakeAccount {
  connection: string;
  accountId: string;
  label?: string;
  externalAccountId?: string;
  status?: string;
  credentials?: unknown;
  expiresAt?: string;
}

export interface FakeHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  auth?: unknown;
}

export interface FakeHttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

export type FakeHttpHandler = (
  request: FakeHttpRequest,
) => FakeHttpResponse | Promise<FakeHttpResponse>;

export interface FakeGrant {
  id: string;
  scope?: Record<string, unknown>;
}

export interface FakeHostOptions {
  definition: ResolvedAddonDefinition;
  manifest: AddonManifest;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  accounts?: FakeAccount[];
  http?: FakeHttpHandler;
  grants?: FakeGrant[];
  now?(): number;
}

export interface FakeHost {
  readonly manifest: AddonManifest;
  logs: Array<{ level: string; message: string; fields?: Record<string, unknown> }>;
  emitted: Array<{ name: string; payload: unknown }>;
  dispatchedRuns: Array<{ threadId?: string; agentId?: string; input: string }>;
  createdThreads: string[];
  accountReports: Array<{ connection: string; accountId?: string; code: string }>;
  workerReports: Array<{ workerId: string; state: string; code?: string }>;
  inboundMessages: Array<{ channel: string; from?: string; text: string; payload?: unknown }>;
  progress: Array<{ token: string; value: unknown }>;
  now(): number;
  advanceTime(ms: number): void;
  callTool(
    pack: string,
    tool: string,
    input?: Record<string, unknown>,
  ): Promise<{ output: unknown }>;
  callRoute(
    routeId: string,
    request: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      path?: string;
      query?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<{ status: number; body?: unknown }>;
  runJob(jobId: string): Promise<void>;
  startTrigger(
    instanceId: string,
    kind: string,
    config?: Record<string, unknown>,
    target?: unknown,
  ): Promise<void>;
  stopTrigger(instanceId: string): Promise<void>;
  startWorker(workerId: string): Promise<void>;
  emit(event: Record<string, unknown>, hookId: string): Promise<void>;
  notify(method: string, params: unknown): Promise<void>;
  deliver(method: string, params: unknown): Promise<unknown>;
  service(method: string, params: unknown): Promise<unknown>;
  close(): void;
}

export function createFakeHost(options: FakeHostOptions): FakeHost {
  const { definition, manifest } = options;
  let clockOffset = 0;
  let correlation = 0;
  const base = options.now ?? ((): number => Date.now());
  const now = (): number => base() + clockOffset;
  const db: FakeDb = createFakeDb();
  const startedTriggers = new Set<string>();
  const firedKeys = new Set<string>();
  const progress: Array<{ token: string; value: unknown }> = [];
  const sinks = {
    logs: [] as Array<{ level: string; message: string; fields?: Record<string, unknown> }>,
    emitted: [] as Array<{ name: string; payload: unknown }>,
    dispatchedRuns: [] as Array<{ threadId?: string; agentId?: string; input: string }>,
    createdThreads: [] as string[],
    accountReports: [] as Array<{ connection: string; accountId?: string; code: string }>,
    workerReports: [] as Array<{ workerId: string; state: string; code?: string }>,
    inboundMessages: [] as Array<{
      channel: string;
      from?: string;
      text: string;
      payload?: unknown;
    }>,
  };
  const services = createFakeServices({ manifest, options, db, sinks, startedTriggers, firedKeys });
  const fakeChannel: HostChannel = {
    request(method: string, params: unknown): Promise<unknown> {
      return dispatchAddonToHost(method, params);
    },
    notify(method: string, params: unknown): void {
      if (method === '$/progress') {
        progress.push(params as { token: string; value: unknown });
      }
    },
  };

  const runtime: AddonRuntime = createAddonRuntime({
    definition,
    addon: { id: manifest.id, version: manifest.version },
    channel: fakeChannel,
  });

  const host: FakeHost = {
    manifest,
    logs: sinks.logs,
    emitted: sinks.emitted,
    dispatchedRuns: sinks.dispatchedRuns,
    createdThreads: sinks.createdThreads,
    accountReports: sinks.accountReports,
    workerReports: sinks.workerReports,
    inboundMessages: sinks.inboundMessages,
    progress,
    now,
    advanceTime(ms: number) {
      clockOffset += ms;
    },
    async callTool(pack, tool, input = {}) {
      const result = (await deliver('tools.call', { pack, tool, input })) as { output: unknown };
      return { output: result.output };
    },
    async callRoute(routeId, request) {
      const result = (await deliver('route.handle', {
        routeId,
        request: {
          method: request.method ?? 'GET',
          path: request.path ?? '/',
          query: request.query ?? {},
          headers: {},
          body: request.body,
        },
      })) as { status: number; body?: unknown };
      return { status: result.status, body: result.body };
    },
    async runJob(jobId) {
      await deliver('job.run', { jobId });
    },
    async startTrigger(instanceId, kind, config = {}, target) {
      await deliver('trigger.start', { instanceId, kind, config, target });
      startedTriggers.add(instanceId);
    },
    async stopTrigger(instanceId) {
      startedTriggers.delete(instanceId);
      await deliver('trigger.stop', { instanceId });
    },
    async startWorker(workerId) {
      await deliver('worker.start', { workerId });
    },
    async emit(event, hookId) {
      await deliver('hook.deliver', { hookId, event });
    },
    async notify(method, params) {
      await runtime.handleNotification(method, params, new AbortController().signal);
    },
    async deliver(method, params) {
      return deliver(method, params);
    },
    async service(method, params) {
      return dispatchAddonToHost(method, params);
    },
    close() {
      db.close();
    },
  };

  function deliver(method: string, params: unknown): Promise<unknown> {
    correlation += 1;
    const meta: CallMeta = {
      correlationId: `fake-${correlation}`,
      deadline: base() + 5000,
      principal: { type: 'system' },
      locale: 'en',
    };
    const controller = new AbortController();
    const withMeta =
      method === 'initialize' ? params : { ...(params as Record<string, unknown>), _meta: meta };
    return runtime.handleRequest(method, withMeta, controller.signal);
  }

  async function dispatchAddonToHost(method: string, rawParams: unknown): Promise<unknown> {
    const spec = methodSpec(method);
    if (spec?.direction !== 'addon-to-host') {
      throw new AddonError('unsupported', {
        detail: `method '${method}' is not an addon-to-host service`,
      });
    }
    await checkPermission(spec.permission);
    const params = spec.params.parse(rawParams) as Record<string, unknown>;
    const result = await services.execute(method, params);
    return spec.result ? spec.result.parse(result) : result;
  }

  function checkPermission(permission: string | null): void {
    if (permission === null || services.hasGrant(permission)) {
      return;
    }
    throw new AddonError('permission_denied', {
      detail: `permission '${permission}' was not granted`,
    });
  }

  return host;
}
