import { Logger } from '@harnesys/brix';
import type {
  RunDispatchInput,
  RunDispatchOutcome,
  RunDispatchResult,
} from '../../../application/addons/run-dispatch.port.ts';
import { RunDispatchPort } from '../../../application/addons/run-dispatch.port.ts';
import { AccountsFacadePort } from '../../../application/apps/accounts-facade.port.ts';
import { CancelRunUseCase } from '../../../application/threads/cancel-run.use-case.ts';
import { CreateThreadUseCase } from '../../../application/threads/create-thread.use-case.ts';
import type { HostCallContext } from '../../../domain/addons/host-service.ts';
import type { EffectiveGrants } from '../../../domain/addons/permissions.ts';
import type { TriggerInstanceRow } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import type { AccountView } from '../../../domain/apps/records.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import type { OrgAuditRow } from '../../../domain/fleet/org-audit.port.ts';
import { OrgAudit } from '../../../domain/fleet/org-audit.port.ts';
import { AddonHttpFetchPort } from './http/addon-fetch.port.ts';
import type { AddonLogEntry, TriggerFireOutcome } from './sinks.ts';
import {
  AddonDbAccess,
  AddonSecrets,
  BindingsReader,
  BridgeInboundSink,
  type DbRow,
  type DbStatement,
  LogSink,
  TriggerFireSink,
  WorkerReportSink,
} from './sinks.ts';

export const ADDON = 'acme.test';

export function callCtx(grants: EffectiveGrants = []): HostCallContext {
  return {
    orgId: 'org1',
    addonId: ADDON,
    instanceId: 'inst1',
    generation: 1,
    correlationId: 'corr-1',
    grants,
    now: () => 0,
    signal: new AbortController().signal,
  };
}

export class NullLogger extends Logger {
  override child(): Logger {
    return this;
  }
  override info(): void {}
  override debug(): void {}
  override warn(): void {}
  override error(): void {}
}

export class FakeBus extends EventBusPort {
  readonly published: Array<{ orgId: string; name: string; payload: unknown }> = [];
  override publish(orgId: string, name: string, payload: unknown): void {
    this.published.push({ orgId, name, payload });
  }
  override subscribe(): { close(): void } {
    return { close: () => {} };
  }
}

export class FakeDb extends AddonDbAccess {
  readonly calls: string[] = [];
  rows: DbRow[] = [{ id: 1 }];
  override exec(orgId: string, addonId: string, sql: string): Promise<void> {
    this.calls.push(`exec:${orgId}:${addonId}:${sql}`);
    return Promise.resolve();
  }
  override all(): Promise<DbRow[]> {
    this.calls.push('all');
    return Promise.resolve(this.rows);
  }
  override get(): Promise<DbRow | null> {
    this.calls.push('get');
    return Promise.resolve(this.rows[0] ?? null);
  }
  override run(): Promise<{ changes: number; lastInsertRowid: string | number }> {
    this.calls.push('run');
    return Promise.resolve({ changes: 1, lastInsertRowid: 3 });
  }
  override batch(
    _orgId: string,
    _addonId: string,
    statements: DbStatement[],
  ): Promise<Array<{ changes: number; lastInsertRowid: string | number }>> {
    this.calls.push(`batch:${statements.length}`);
    return Promise.resolve(statements.map(() => ({ changes: 1, lastInsertRowid: 1 })));
  }
}

export class FakeLogSink extends LogSink {
  readonly entries: AddonLogEntry[] = [];
  override append(entry: AddonLogEntry): void {
    this.entries.push(entry);
  }
}

export class FakeSecrets extends AddonSecrets {
  constructor(private readonly values: Record<string, string | null>) {
    super();
  }
  override get(orgId: string, addonId: string, key: string): Promise<string | null> {
    return Promise.resolve(this.values[`${orgId}:${addonId}:${key}`] ?? null);
  }
  override set(orgId: string, addonId: string, key: string, value: string): Promise<void> {
    this.values[`${orgId}:${addonId}:${key}`] = value;
    return Promise.resolve();
  }
  override delete(orgId: string, addonId: string, key: string): Promise<void> {
    delete this.values[`${orgId}:${addonId}:${key}`];
    return Promise.resolve();
  }
}

export class FakeBindings extends BindingsReader {
  constructor(private readonly bindings: Record<string, string[]>) {
    super();
  }
  override accountsFor(
    orgId: string,
    addonId: string,
    connectionId: string,
  ): Array<{ accountId: string }> {
    return (this.bindings[`${orgId}:${addonId}:${connectionId}`] ?? []).map((accountId) => ({
      accountId,
    }));
  }
}

export class FakeAccounts extends AccountsFacadePort {
  readonly reports: Array<{ orgId: string; accountId: string; code: string }> = [];
  credentials: Record<string, string> = { token: 'canary-token' };
  accessCalls: string[] = [];
  override find(): Promise<AccountView[]> {
    return Promise.resolve([]);
  }
  override get(_orgId: string, accountId: string): Promise<AccountView | null> {
    return Promise.resolve({
      id: accountId,
      appId: null,
      kind: 'github-installation',
      externalAccountId: 'ext-1',
      partition: '',
      label: 'Bound account',
      status: 'connected',
      lastError: null,
      scopes: [],
      expiresAt: null,
      config: {},
      secretFields: [],
      endpoints: {},
      verifiedAt: null,
      createdAt: '',
      updatedAt: '',
    } as AccountView);
  }
  override access(
    _orgId: string,
    accountId: string,
  ): Promise<{ credentials: Record<string, string>; expiresAt: number | null }> {
    this.accessCalls.push(accountId);
    return Promise.resolve({ credentials: this.credentials, expiresAt: 1730000000000 });
  }
  override report(orgId: string, accountId: string, code: never): Promise<void> {
    this.reports.push({ orgId, accountId, code: String(code) });
    return Promise.resolve();
  }
  override subscribe(): () => void {
    return () => {};
  }
}

export class FakeAudit extends OrgAudit {
  readonly rows: OrgAuditRow[] = [];
  override append(orgId: string, row: OrgAuditRow): void {
    this.rows.push({ ...row, resource: `${orgId}:${row.resource}` });
  }
  override list(): { items: OrgAuditRow[]; total: number } {
    return { items: this.rows, total: this.rows.length };
  }
}

export class FakeRuns extends RunDispatchPort {
  outcome: RunDispatchOutcome = 'fired';
  runId: string | null = null;
  readonly inputs: RunDispatchInput[] = [];
  override dispatch(input: RunDispatchInput): Promise<RunDispatchResult> {
    this.inputs.push(input);
    return Promise.resolve({ outcome: this.outcome, runId: this.runId });
  }
}

export class FakeTriggerRepo extends TriggerInstanceRepositoryPort {
  row: TriggerInstanceRow = {
    id: 'ti1',
    orgId: 'org1',
    addonId: ADDON,
    triggerId: 'feed',
    label: '',
    configJson: '{}',
    instructions: '',
    targetJson: '{}',
    enabled: true,
    createdAt: '',
    updatedAt: '',
  };
  override find(_orgId: string, instanceId: string): TriggerInstanceRow | null {
    return this.row.id === instanceId ? this.row : null;
  }
  override list(): TriggerInstanceRow[] {
    return [this.row];
  }
  override create(row: TriggerInstanceRow): TriggerInstanceRow {
    return row;
  }
  override update(): void {}
  override remove(): void {}
  override removeAddon(): void {}
  override recordFire(): boolean {
    return true;
  }
  override cleanupFires(): void {}
}

export class FakeTriggerSink extends TriggerFireSink {
  outcome: TriggerFireOutcome = { outcome: 'fired' };
  readonly fired: Array<{ instanceId: string; runKey: string; correlationId: string }> = [];
  override fire(
    ctx: HostCallContext,
    input: { instanceId: string; runKey: string },
  ): Promise<TriggerFireOutcome> {
    this.fired.push({
      instanceId: input.instanceId,
      runKey: input.runKey,
      correlationId: ctx.correlationId,
    });
    return Promise.resolve(this.outcome);
  }
}

export class FakeBridgeSink extends BridgeInboundSink {
  readonly messages: Array<{ channel: string; correlationId: string }> = [];
  override inbound(ctx: HostCallContext, message: { channel: string }): Promise<void> {
    this.messages.push({ channel: message.channel, correlationId: ctx.correlationId });
    return Promise.resolve();
  }
}

export class FakeWorkerSink extends WorkerReportSink {
  readonly reports: Array<{ workerId: string; state: string; code?: string }> = [];
  override report(
    _ctx: HostCallContext,
    input: { workerId: string; state: 'running' | 'stopped' | 'failed'; code?: string },
  ): Promise<void> {
    this.reports.push(input);
    return Promise.resolve();
  }
}

export class FakeFetch extends AddonHttpFetchPort {
  readonly inits: Array<{ url: string; headers: Record<string, string> }> = [];
  status = 200;
  override fetch(url: URL, init: RequestInit): Promise<Response> {
    this.inits.push({
      url: url.toString(),
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return Promise.resolve(new Response('ok-body', { status: this.status }));
  }
}

export class ZeroClock extends ClockPort {
  override now(): number {
    return 0;
  }
}

export function stubThreads(
  threadId = 'thread-1',
): CreateThreadUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string; body: { agentId?: string; title?: string } }) => {
      requests.push(request as Record<string, unknown>);
      return Promise.resolve({ id: threadId });
    },
  };
  return Object.assign(Object.create(CreateThreadUseCase.prototype), stub);
}

export function stubCancelRun(
  error: Error | null = null,
): CancelRunUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string; threadId: string; runId: string }) => {
      requests.push(request as Record<string, unknown>);
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve({ ok: true as const });
    },
  };
  return Object.assign(Object.create(CancelRunUseCase.prototype), stub);
}
