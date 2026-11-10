import { Logger } from '@harnesys/brix';
import type { AddonManifest, TransportMessage } from '@harnesys/sdk';
import type { PackRegistration } from 'harnesys';
import type { OwnerKey } from '../../../../domain/addons/owner.ts';
import {
  type AddonCallOptions,
  AddonCallPort,
  type HookDeliverParams,
  type RouteCallParams,
  type ToolCallParams,
  type ToolCallResult,
  type TriggerStartParams,
} from '../../../../domain/addons/ports/addon-call.port.ts';
import { PackRegistryPort } from '../../../../domain/capabilities/pack-registry.port.ts';

export const OWNER: OwnerKey = {
  orgId: 'org-1',
  addonId: 'acme.test',
  version: '1.0.0',
};

export const MANIFEST: AddonManifest = {
  id: OWNER.addonId,
  version: OWNER.version,
  platform: 1,
  title: 'Test addon',
  description: 'test',
  runtime: { entry: './dist/index.js', profile: 'trusted' },
  activation: 'lazy',
  permissions: [],
  connections: [
    { id: 'github', label: 'GitHub', accountKinds: ['github-installation'], cardinality: 'many' },
  ],
  contributions: [],
};

export class FakeLogger extends Logger {
  readonly lines: string[] = [];
  override child(): FakeLogger {
    return new FakeLogger();
  }
  override info(): void {}
  override debug(): void {}
  override warn(): void {}
  override error(): void {}
}

export class FakePackRegistry extends PackRegistryPort {
  readonly map = new Map<string, PackRegistration>();
  override register(name: string, registration: PackRegistration): void {
    this.map.set(name, registration);
  }
  override unregister(name: string): void {
    this.map.delete(name);
  }
  override registrations(): PackRegistration[] {
    return [...this.map.values()];
  }
  override find(name: string): PackRegistration | undefined {
    return this.map.get(name);
  }
}

export interface RecordedCall {
  method: string;
  params: unknown;
  opts?: AddonCallOptions;
}

export class FakeAddonCallPort extends AddonCallPort {
  readonly calls: RecordedCall[] = [];
  private next: Error | null = null;

  failOnce(error: Error): void {
    this.next = error;
  }

  private record(method: string, params: unknown, opts?: AddonCallOptions): void {
    this.calls.push({ method, params, opts });
    if (this.next !== null) {
      const error = this.next;
      this.next = null;
      throw error;
    }
  }

  override async callTool(
    _orgId: string,
    _addonId: string,
    params: ToolCallParams,
    opts?: AddonCallOptions,
  ): Promise<ToolCallResult> {
    this.record('tools.call', params, opts);
    return { output: { ok: true } };
  }

  override async callRoute(
    _orgId: string,
    _addonId: string,
    params: RouteCallParams,
    opts?: AddonCallOptions,
  ): Promise<{ status: number }> {
    this.record('route.handle', params, opts);
    return { status: 200 };
  }

  override async triggerStart(
    _orgId: string,
    _addonId: string,
    params: TriggerStartParams,
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('trigger.start', params, opts);
  }

  override async triggerStop(
    _orgId: string,
    _addonId: string,
    params: { instanceId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('trigger.stop', params, opts);
  }

  override async jobRun(
    _orgId: string,
    _addonId: string,
    params: { jobId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('job.run', params, opts);
  }

  override async workerStart(
    _orgId: string,
    _addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('worker.start', params, opts);
  }

  override async workerStop(
    _orgId: string,
    _addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('worker.stop', params, opts);
  }

  override async hookDeliver(
    _orgId: string,
    _addonId: string,
    params: HookDeliverParams,
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('hook.deliver', params, opts);
  }

  override async transportSend(
    _orgId: string,
    _addonId: string,
    message: TransportMessage,
    opts?: AddonCallOptions,
  ): Promise<{ messageId?: string }> {
    this.record('transport.send', message, opts);
    return { messageId: 'm1' };
  }

  override async transportEdit(
    _orgId: string,
    _addonId: string,
    params: { messageId: string; message: TransportMessage },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('transport.edit', params, opts);
  }

  override async transportTyping(
    _orgId: string,
    _addonId: string,
    params: { channel: string; on: boolean },
    opts?: AddonCallOptions,
  ): Promise<void> {
    this.record('transport.typing', params, opts);
  }
}
