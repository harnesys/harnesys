import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonQuarantinedException } from '../../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import type {
  InstanceSnapshot,
  InstanceState,
} from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonHealth } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { LauncherNoneAdapter } from '../sandbox/launcher-none.adapter.ts';
import { SandboxLauncherPort } from '../sandbox/sandbox-launcher.port.ts';
import { LogSink } from '../services/sinks.ts';
import { TransportFactory } from '../transport/transport-factory.ts';
import { notifyRuntime, requestOfRuntime, type SupervisorNotifyOutcome } from './instance-calls.ts';
import type { InstanceRecord } from './instance-registry.ts';
import { InstanceRegistry } from './instance-registry.ts';
import { InstanceRuntime } from './instance-runtime.ts';
import {
  buildLaunchTarget,
  type LaunchTarget,
  type LaunchTargetDeps,
  resolvePinnedVersion,
} from './launch-target.ts';
import { SupervisorSettings } from './supervisor.config.ts';
import { SupervisorHooks, SupervisorTimers } from './supervisor-deps.ts';
import { SupervisorRestartPolicy } from './supervisor-restarts.ts';
import type { RpcCallMeta } from './transport-rpc-client.ts';

@Injectable()
export class AddonInstanceSupervisor extends InstanceSupervisorPort {
  private readonly log: Logger;
  private readonly runtimes = new Map<string, InstanceRuntime>();
  private readonly singleFlights = new Map<string, Promise<InstanceSnapshot>>();
  private readonly restarts: SupervisorRestartPolicy;

  constructor(
    @Inject(Logger) logger: Logger,
    private readonly registry: InstanceRegistry,
    private readonly clock: ClockPort,
    private readonly timers: SupervisorTimers,
    private readonly settings: SupervisorSettings,
    private readonly hooks: SupervisorHooks,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly layout: HostFsLayoutPort,
    private readonly osLauncher: SandboxLauncherPort,
    private readonly noneLauncher: LauncherNoneAdapter,
    private readonly transportFactory: TransportFactory,
    private readonly repository: OrgAddonRepositoryPort,
    private readonly grantPolicy: GrantPolicyPort,
    private readonly audit: AddonAuditPort,
    private readonly events: EventBusPort,
    private readonly logSink: LogSink,
  ) {
    super();
    this.log = logger.child('addon-supervisor');
    this.restarts = new SupervisorRestartPolicy(
      timers,
      settings,
      hooks,
      registry,
      this.runtimes,
      clock,
      {
        ensureRunning: (orgId, addonId, reason) => this.ensureRunning(orgId, addonId, reason),
        stop: (orgId, addonId, reason) => this.stop(orgId, addonId, reason),
      },
      this.log,
    );
  }

  async ensureRunning(orgId: string, addonId: string, reason: string): Promise<InstanceSnapshot> {
    this.assertNotQuarantined(orgId, addonId);
    const existing = this.runtimes.get(`${orgId}/${addonId}`);
    if (existing && !existing.isStopped) {
      this.resetIdleTimer(orgId, addonId);
      return this.snapshotOrThrow(orgId, addonId);
    }
    this.restarts.cancelBackoff(orgId, addonId);
    const flight = this.singleFlights.get(`${orgId}/${addonId}`);
    if (flight) {
      return await flight;
    }
    const startPromise = this.startInstance(orgId, addonId, reason);
    this.singleFlights.set(`${orgId}/${addonId}`, startPromise);
    try {
      return await startPromise;
    } finally {
      this.singleFlights.delete(`${orgId}/${addonId}`);
    }
  }

  async stop(orgId: string, addonId: string, reason = 'manual'): Promise<void> {
    const key = `${orgId}/${addonId}`;
    this.restarts.cancelBackoff(orgId, addonId);
    const runtime = this.runtimes.get(key);
    if (!runtime) {
      this.registry.update(orgId, addonId, { state: 'stopped' });
      this.mirror(orgId, addonId, 'stopped');
      return;
    }
    this.runtimes.delete(key);
    await runtime.shutdown(reason);
    this.registry.update(orgId, addonId, { state: 'stopped', lastExitReason: reason });
    this.mirror(orgId, addonId, 'stopped');
    this.log.info({ orgId, addonId, reason }, 'addon instance stopped');
  }

  private resetIdleTimer(orgId: string, addonId: string): void {
    this.restarts.resetIdleTimer(orgId, addonId);
  }

  async restart(orgId: string, addonId: string, reason = 'manual'): Promise<InstanceSnapshot> {
    await this.stop(orgId, addonId, reason);
    this.restarts.breaker(orgId, addonId).reset();
    return await this.ensureRunning(orgId, addonId, reason);
  }

  snapshot(orgId: string, addonId: string): InstanceSnapshot | null {
    return this.registry.snapshot(orgId, addonId);
  }

  async request(
    orgId: string,
    addonId: string,
    method: string,
    params: unknown,
    timeoutMs: number,
    meta?: RpcCallMeta,
  ): Promise<unknown> {
    return await requestOfRuntime({
      runtimes: this.runtimes,
      orgId,
      addonId,
      method,
      params,
      timeoutMs,
      meta,
    });
  }

  notify(orgId: string, addonId: string, method: string, params: unknown): SupervisorNotifyOutcome {
    return notifyRuntime(this.runtimes, orgId, addonId, method, params);
  }

  mirrorHealth(
    orgId: string,
    addonId: string,
    state: 'stopped' | 'running' | 'failed' | 'quarantined',
    lastError?: string | null,
  ): void {
    this.repository.updateHealth(orgId, addonId, state, lastError ?? null);
  }

  private async startInstance(
    orgId: string,
    addonId: string,
    reason: string,
  ): Promise<InstanceSnapshot> {
    const record = this.registry.ensure(orgId, addonId, this.resolveVersion(orgId, addonId));
    const generation = record.generation + 1;
    this.registry.update(orgId, addonId, { generation, state: 'starting', lastError: undefined });
    const target = this.buildTarget(orgId, addonId);
    const runtime = new InstanceRuntime(
      {
        target,
        generation,
        settings: this.settings,
        clock: this.clock,
        timers: this.timers,
        osLauncher: this.osLauncher,
        noneLauncher: this.noneLauncher,
        transportFactory: this.transportFactory,
        hooks: this.hooks,
        grantPolicy: this.grantPolicy,
        audit: this.audit,
        logSink: {
          write: (o, a, line) => {
            this.logSink.write(o, a, line);
            this.log.info({ orgId: o, addonId: a }, `stderr: ${line}`);
          },
        },
      },
      {
        onState: (state, detail) => this.onRuntimeState(orgId, addonId, state, detail),
        onExit: (exitReason, code) => void this.onRuntimeExit(orgId, addonId, exitReason, code),
      },
      this.log,
    );
    this.runtimes.set(`${orgId}/${addonId}`, runtime);
    try {
      await runtime.start();
    } catch (error) {
      await this.teardownFailedStart(orgId, addonId, runtime, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
    this.registry.update(orgId, addonId, {
      state: 'running',
      pid: runtime.pid,
      startedAt: runtime.startedAt,
    });
    this.mirror(orgId, addonId, 'running');
    this.restarts.resetIdleTimer(orgId, addonId);
    this.log.info({ orgId, addonId, generation, reason }, 'addon instance started');
    return this.snapshotOrThrow(orgId, addonId);
  }

  private async teardownFailedStart(
    orgId: string,
    addonId: string,
    runtime: InstanceRuntime,
    error: unknown,
  ): Promise<void> {
    this.runtimes.delete(`${orgId}/${addonId}`);
    await runtime.shutdown('start_failed');
    const message = error instanceof Error ? error.message : String(error);
    this.registry.update(orgId, addonId, { state: 'failed', lastError: message });
    this.mirror(orgId, addonId, 'failed', message);
  }

  private onRuntimeState(
    orgId: string,
    addonId: string,
    state: InstanceState,
    detail?: string,
  ): void {
    const patch: Partial<InstanceRecord> = { state };
    if (state === 'stopping' || state === 'starting') {
      this.registry.update(orgId, addonId, patch);
      return;
    }
    if (detail !== undefined) {
      patch.lastError = detail;
    }
    this.registry.update(orgId, addonId, patch);
  }

  private async onRuntimeExit(
    orgId: string,
    addonId: string,
    reason: string,
    code: number | null,
  ): Promise<void> {
    const key = `${orgId}/${addonId}`;
    const runtime = this.runtimes.get(key);
    if (!runtime || runtime.isStopped) {
      return;
    }
    this.runtimes.delete(key);
    await runtime.shutdown(reason);
    const record = this.registry.update(orgId, addonId, {
      state: 'failed',
      lastExitReason: reason,
      lastError: code === null ? reason : `${reason} (exit ${code})`,
      restarts: (this.registry.get(orgId, addonId)?.restarts ?? 0) + 1,
    });
    this.mirror(orgId, addonId, 'failed', reason);
    this.log.warn({ orgId, addonId, reason, code }, 'addon instance exited unexpectedly');
    if (this.restarts.breaker(orgId, addonId).recordCrash()) {
      this.quarantine(orgId, addonId, record?.restarts ?? 0);
      return;
    }
    this.restarts.scheduleRestart(orgId, addonId, reason);
  }

  private quarantine(orgId: string, addonId: string, restarts: number): void {
    this.restarts.breaker(orgId, addonId).reset();
    this.registry.update(orgId, addonId, {
      state: 'quarantined',
      lastError: 'circuit breaker: repeated crashes',
    });
    this.mirror(orgId, addonId, 'quarantined', 'circuit breaker: repeated crashes');
    this.audit.append(orgId, {
      actor: { kind: 'host', id: 'addon-supervisor' },
      action: 'addon.quarantined',
      target: addonId,
      outcome: 'ok',
      details: { restarts, windowMs: this.settings.config.crashWindowMs },
    });
    this.log.error({ orgId, addonId, restarts }, 'addon quarantined by circuit breaker');
  }

  private assertNotQuarantined(orgId: string, addonId: string): void {
    if (this.registry.get(orgId, addonId)?.state === 'quarantined') {
      throw new AddonQuarantinedException(addonId);
    }
  }

  private resolveVersion(orgId: string, addonId: string): string {
    return resolvePinnedVersion(this.targetDeps, orgId, addonId);
  }

  private buildTarget(orgId: string, addonId: string): LaunchTarget {
    return buildLaunchTarget(this.targetDeps, orgId, addonId);
  }

  private get targetDeps(): LaunchTargetDeps {
    return { catalog: this.catalog, layout: this.layout, repository: this.repository };
  }

  private mirror(orgId: string, addonId: string, health: OrgAddonHealth, lastError?: string): void {
    try {
      this.mirrorHealth(orgId, addonId, health, lastError ?? null);
      this.events.publish(orgId, 'addon.state_changed', {
        type: 'addon.state_changed',
        orgId,
        addonId,
        at: new Date(this.clock.now()).toISOString(),
        state: health,
        ...(lastError === undefined ? {} : { lastError: lastError ?? null }),
      });
    } catch (error) {
      this.log.warn({ orgId, addonId, error: String(error) }, 'health mirror write failed');
    }
  }

  private snapshotOrThrow(orgId: string, addonId: string): InstanceSnapshot {
    const snapshot = this.registry.snapshot(orgId, addonId);
    if (!snapshot) {
      throw new Error(`instance snapshot missing for ${orgId}/${addonId}`);
    }
    return snapshot;
  }
}
