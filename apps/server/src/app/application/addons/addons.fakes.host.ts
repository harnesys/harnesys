import { Logger } from '@harnesys/brix';
import type { AddonManifest, JsonObject, RouteHandleResult, TransportMessage } from '@harnesys/sdk';
import type { AddonHostPolicy } from '../../domain/addons/permissions.ts';
import {
  AddonCallPort,
  type HookDeliverParams,
  type RouteCallParams,
  type SourceRequestMethod,
  type ToolCallParams,
  type ToolCallResult,
  type TriggerStartParams,
} from '../../domain/addons/ports/addon-call.port.ts';
import type { InstalledAddonPackage } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import { type AddonAuditEntry, AddonAuditPort } from '../../domain/addons/ports/audit.port.ts';
import { GrantPolicyPort } from '../../domain/addons/ports/grant-policy.port.ts';
import {
  type InstanceSnapshot,
  InstanceSupervisorPort,
} from '../../domain/addons/ports/instance-supervisor.port.ts';
import { ClockPort } from '../../domain/apps/ports/clock.port.ts';
import type { AccountView } from '../../domain/apps/records.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { type MetricLabels, MetricsPort } from '../../domain/metrics/metrics.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { type AccountFindQuery, AccountsFacadePort } from '../apps/accounts-facade.port.ts';
import { AddonDataPort } from './addon-data.port.ts';
import type { AddonRpcCall } from './addon-rpc.port.ts';
import { AddonRpcPort } from './addon-rpc.port.ts';
import type {
  RunDispatchInput,
  RunDispatchOutcome,
  RunDispatchResult,
} from './run-dispatch.port.ts';
import { RunDispatchPort } from './run-dispatch.port.ts';

export class NullLogger extends Logger {
  child(): Logger {
    return this;
  }
  info(): void {}
  debug(): void {}
  warn(): void {}
  error(): void {}
}

export class FakeClock extends ClockPort {
  constructor(readonly current: number = 1_000_000) {
    super();
  }
  now(): number {
    return this.current;
  }
}

export class FakeAccounts extends AccountsFacadePort {
  accounts = new Map<string, AccountView>();
  async find(_orgId: string, _query: AccountFindQuery): Promise<AccountView[]> {
    return [...this.accounts.values()];
  }
  async get(_orgId: string, accountId: string): Promise<AccountView | null> {
    return this.accounts.get(accountId) ?? null;
  }
  async access(): Promise<{ credentials: Record<string, string>; expiresAt: number | null }> {
    return { credentials: {}, expiresAt: null };
  }
  async report(): Promise<void> {}
  subscribe(): () => void {
    return () => {};
  }
}

export class FakeSupervisor extends InstanceSupervisorPort {
  states = new Map<string, InstanceSnapshot>();
  started: string[] = [];
  stopped: string[] = [];
  failStart = false;
  async ensureRunning(orgId: string, addonId: string, reason: string): Promise<InstanceSnapshot> {
    if (this.failStart) {
      throw new Error('start failed');
    }
    const key = `${orgId}/${addonId}`;
    const existing = this.states.get(key);
    const snapshot: InstanceSnapshot = existing
      ? existing
      : { orgId, addonId, generation: 1, state: 'running', restarts: 0, startedAt: reason };
    this.states.set(key, snapshot);
    if (!existing) {
      this.started.push(`${key}:${reason}`);
    }
    return snapshot;
  }
  async stop(orgId: string, addonId: string): Promise<void> {
    this.stopped.push(`${orgId}/${addonId}`);
    this.states.delete(`${orgId}/${addonId}`);
  }
  async restart(orgId: string, addonId: string): Promise<InstanceSnapshot> {
    await this.stop(orgId, addonId);
    return await this.ensureRunning(orgId, addonId, 'restart');
  }
  snapshot(orgId: string, addonId: string): InstanceSnapshot | null {
    return this.states.get(`${orgId}/${addonId}`) ?? null;
  }
  mirrorHealth(): void {}
}

export class FakeSecrets extends SecretStorePort {
  values = new Map<string, string>();
  deleted: string[] = [];
  async get(orgId: string, key: string): Promise<string | null> {
    return this.values.get(`${orgId}/${key}`) ?? null;
  }
  async set(orgId: string, key: string, value: string): Promise<void> {
    this.values.set(`${orgId}/${key}`, value);
  }
  async delete(orgId: string, key: string): Promise<void> {
    this.values.delete(`${orgId}/${key}`);
    this.deleted.push(`${orgId}/${key}`);
  }
  async listKeys(orgId: string): Promise<string[]> {
    return [...this.values.keys()]
      .filter((full) => full.startsWith(`${orgId}/`))
      .map((full) => full.slice(orgId.length + 1));
  }
}

export class FakeAddonData extends AddonDataPort {
  removed: string[] = [];
  removeData(orgId: string, addonId: string): void {
    this.removed.push(`${orgId}/${addonId}`);
  }
}

export class FakeAudit extends AddonAuditPort {
  entries: AddonAuditEntry[] = [];
  append(_orgId: string, entry: AddonAuditEntry): void {
    this.entries.push({ ...entry });
  }
}

export class FakePolicy extends GrantPolicyPort {
  policy: AddonHostPolicy = {
    forbiddenPermissions: [],
    forbiddenHosts: [],
    allowUnsandboxedExternal: false,
  };
  read(): AddonHostPolicy {
    return this.policy;
  }
  write(policy: AddonHostPolicy): void {
    this.policy = policy;
  }
}

export class FakeEvents extends EventBusPort {
  published: Array<{ orgId: string; name: string; payload: unknown }> = [];
  publish(orgId: string, name: string, payload: unknown): void {
    this.published.push({ orgId, name, payload });
  }
  subscribe(): { close(): void } {
    return { close: () => {} };
  }
}

export class FakeMetrics extends MetricsPort {
  counters: Array<{ name: string; labels: MetricLabels }> = [];
  increment(name: string, labels: MetricLabels): void {
    this.counters.push({ name, labels });
  }
  observe(): void {}
}

export class FakeRpc extends AddonRpcPort {
  requests: Array<{ method: string; params: unknown; timeoutMs: number }> = [];
  result: unknown = { ok: true };
  async request(call: AddonRpcCall): Promise<unknown> {
    this.requests.push({ method: call.method, params: call.params, timeoutMs: call.timeoutMs });
    return this.result;
  }
}

export class FakeDispatch extends RunDispatchPort {
  outcome: RunDispatchOutcome = 'fired';
  runId: string | null = null;
  calls: RunDispatchInput[] = [];
  async dispatch(input: RunDispatchInput): Promise<RunDispatchResult> {
    this.calls.push(input);
    return { outcome: this.outcome, runId: this.runId };
  }
}

export class NoopCalls extends AddonCallPort {
  calls: string[] = [];
  async callTool(
    _orgId: string,
    _addonId: string,
    _params: ToolCallParams,
  ): Promise<ToolCallResult> {
    return { output: {} };
  }
  async callRoute(
    _orgId: string,
    _addonId: string,
    _params: RouteCallParams,
  ): Promise<RouteHandleResult> {
    return { status: 200, body: '{}' } as RouteHandleResult;
  }
  async triggerStart(_orgId: string, _addonId: string, params: TriggerStartParams): Promise<void> {
    this.calls.push(`trigger.start:${params.instanceId}`);
  }
  async triggerStop(
    _orgId: string,
    _addonId: string,
    params: { instanceId: string },
  ): Promise<void> {
    this.calls.push(`trigger.stop:${params.instanceId}`);
  }
  async jobRun(): Promise<void> {}
  async workerStart(): Promise<void> {}
  async workerStop(): Promise<void> {}
  async hookDeliver(_orgId: string, _addonId: string, _params: HookDeliverParams): Promise<void> {}
  async transportSend(
    _orgId: string,
    _addonId: string,
    _message: TransportMessage,
  ): Promise<{ messageId?: string }> {
    return {};
  }
  async transportEdit(): Promise<void> {}
  async transportTyping(): Promise<void> {}
  async sourceRequest(
    _orgId: string,
    _addonId: string,
    method: SourceRequestMethod,
    _params: JsonObject,
  ): Promise<JsonObject> {
    this.calls.push(method);
    return {};
  }
}

export interface TestManifest {
  manifest: AddonManifest;
  pkg: InstalledAddonPackage;
}

export function testManifest(overrides?: Partial<AddonManifest>): TestManifest {
  const manifest: AddonManifest = {
    id: 'acme.tool',
    version: '1.0.0',
    platform: 1,
    title: { default: 'Acme Tool' },
    description: { default: 'Acme addon' },
    runtime: { entry: 'index.js', profile: 'trusted' },
    activation: 'lazy',
    permissions: [{ id: 'http.fetch', reason: 'needs network' }],
    connections: [],
    contributions: [],
    ...overrides,
  };
  const pkg: InstalledAddonPackage = {
    id: manifest.id,
    version: manifest.version,
    digest: 'digest-1',
    source: 'builtin',
    trust: 'builtin',
    root: '/tmp/addon',
    manifest,
    installedAt: new Date().toISOString(),
  };
  return { manifest, pkg };
}
