import { Injectable } from '@harnesys/brix';
import type { HostRequestName, RouteHandleResult, TransportMessage } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { AddonCallOptions } from '../../../domain/addons/ports/addon-call.port.ts';
import {
  AddonCallPort,
  type HookDeliverParams,
  type RouteCallParams,
  type ToolCallParams,
  type ToolCallResult,
  type TriggerStartParams,
} from '../../../domain/addons/ports/addon-call.port.ts';
import type { InstanceSnapshot } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { AddonRpcPort } from '../addon-rpc.port.ts';

const DEFAULT_TIMEOUTS: Partial<Record<HostRequestName, number>> = {
  'tools.call': 60_000,
  'route.handle': 30_000,
  'hook.deliver': 10_000,
  'job.run': 900_000,
};

@Injectable()
export class AddonCallService extends AddonCallPort {
  constructor(
    private readonly supervisor: InstanceSupervisorPort,
    private readonly rpc: AddonRpcPort,
  ) {
    super();
  }

  async callTool(
    orgId: string,
    addonId: string,
    params: ToolCallParams,
    opts?: AddonCallOptions,
  ): Promise<ToolCallResult> {
    const output = await this.request(orgId, addonId, 'tools.call', params, opts);
    return { output };
  }

  async callRoute(
    orgId: string,
    addonId: string,
    params: RouteCallParams,
    opts?: AddonCallOptions,
  ): Promise<RouteHandleResult> {
    return (await this.request(orgId, addonId, 'route.handle', params, opts)) as RouteHandleResult;
  }

  async triggerStart(
    orgId: string,
    addonId: string,
    params: TriggerStartParams,
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'trigger.start', params, opts);
  }

  async triggerStop(
    orgId: string,
    addonId: string,
    params: { instanceId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'trigger.stop', params, opts);
  }

  async jobRun(
    orgId: string,
    addonId: string,
    params: { jobId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'job.run', params, opts);
  }

  async workerStart(
    orgId: string,
    addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'worker.start', params, opts);
  }

  async workerStop(
    orgId: string,
    addonId: string,
    params: { workerId: string },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'worker.stop', params, opts);
  }

  async hookDeliver(
    orgId: string,
    addonId: string,
    params: HookDeliverParams,
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'hook.deliver', params, opts);
  }

  async transportSend(
    orgId: string,
    addonId: string,
    message: TransportMessage,
    opts?: AddonCallOptions,
  ): Promise<{ messageId?: string }> {
    const result = await this.request(orgId, addonId, 'transport.send', message, opts);
    return result && typeof result === 'object' ? (result as { messageId?: string }) : {};
  }

  async transportEdit(
    orgId: string,
    addonId: string,
    params: { messageId: string; message: TransportMessage },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'transport.edit', params, opts);
  }

  async transportTyping(
    orgId: string,
    addonId: string,
    params: { channel: string; on: boolean },
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.request(orgId, addonId, 'transport.typing', params, opts);
  }

  private async request(
    orgId: string,
    addonId: string,
    method: HostRequestName,
    params: unknown,
    opts?: AddonCallOptions,
  ): Promise<unknown> {
    const snapshot = await this.supervisor.ensureRunning(orgId, addonId, method);
    this.assertRunning(snapshot);
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUTS[method] ?? 30_000;
    try {
      const result = await this.rpc.request(
        orgId,
        addonId,
        method,
        params,
        timeoutMs,
        opts?.signal,
      );
      this.assertSameGeneration(snapshot, orgId, addonId);
      return result;
    } catch (error) {
      this.assertSameGeneration(snapshot, orgId, addonId);
      throw error;
    }
  }

  private assertSameGeneration(snapshot: InstanceSnapshot, orgId: string, addonId: string): void {
    const latest = this.supervisor.snapshot(orgId, addonId);
    if (latest && latest.generation !== snapshot.generation) {
      throw new AddonException('unavailable', 503, 'Addon instance was restarted during call', {
        retryable: true,
      });
    }
  }

  private assertRunning(snapshot: InstanceSnapshot): void {
    if (snapshot.state !== 'running') {
      throw new AddonException(
        'unavailable',
        503,
        `Addon instance is not running (${snapshot.state}): ${snapshot.lastError ?? 'no error'}`,
        { retryable: true },
      );
    }
  }
}
