import { Logger } from '@harnesys/brix';
import type { InitializeResult } from '@harnesys/sdk';
import { PROTOCOL_PLATFORM } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import type { InstanceState } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { resolveLaunchPlan } from '../sandbox/launch-policy.ts';
import { LauncherNoneAdapter } from '../sandbox/launcher-none.adapter.ts';
import { SandboxLauncherPort } from '../sandbox/sandbox-launcher.port.ts';
import type { AddonLogSink, ChildHandle } from '../transport/stdio-wiring.ts';
import { SIGKILL } from '../transport/stdio-wiring.ts';
import type { TransportFactory } from '../transport/transport-factory.ts';
import { AddonHandlersMismatchError, AddonIdentityMismatchError } from './handshake-errors.ts';
import type { LaunchTarget } from './launch-target.ts';
import type { SupervisorSettings } from './supervisor.config.ts';
import type { SupervisorHooks, SupervisorTimers } from './supervisor-deps.ts';
import type { RpcCallMeta } from './transport-rpc-client.ts';
import { TransportRpcClient } from './transport-rpc-client.ts';

export interface InstanceRuntimeCallbacks {
  onState(state: InstanceState, detail?: string): void;
  onExit(reason: string, code: number | null): void;
}

export interface InstanceRuntimeDeps {
  readonly target: LaunchTarget;
  readonly generation: number;
  readonly settings: SupervisorSettings;
  readonly clock: ClockPort;
  readonly timers: SupervisorTimers;
  readonly osLauncher: SandboxLauncherPort;
  readonly noneLauncher: LauncherNoneAdapter;
  readonly transportFactory: TransportFactory;
  readonly hooks: SupervisorHooks;
  readonly grantPolicy: GrantPolicyPort;
  readonly audit: AddonAuditPort;
  readonly logSink: AddonLogSink;
}

const SIGTERM = 15;

export class InstanceRuntime {
  readonly generation: number;
  private readonly logger: Logger;
  private readonly target: LaunchTarget;
  private readonly deps: InstanceRuntimeDeps;
  private readonly callbacks: InstanceRuntimeCallbacks;
  private transport: AddonTransportPort | null = null;
  private child: ChildHandle | null = null;
  private rpc: TransportRpcClient | null = null;
  private startPromise: Promise<void> | null = null;
  private stopping = false;
  private stopped = false;
  private pingTimer: unknown;
  private pingMisses = 0;
  private rssUnavailableLogged = false;
  pid: number | undefined;
  startedAt: string | undefined;

  constructor(deps: InstanceRuntimeDeps, callbacks: InstanceRuntimeCallbacks, logger: Logger) {
    this.deps = deps;
    this.target = deps.target;
    this.generation = deps.generation;
    this.callbacks = callbacks;
    this.logger = logger;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  get inFlightCalls(): number {
    return this.rpc?.pendingCount ?? 0;
  }

  request(
    method: string,
    params: unknown,
    timeoutMs: number,
    meta?: RpcCallMeta,
  ): Promise<unknown> {
    const rpc = this.rpc;
    if (!rpc || this.stopped || this.stopping) {
      return Promise.reject(
        new AddonException(
          'unavailable',
          503,
          `Addon instance is not running: ${this.target.addonId}`,
          {
            retryable: true,
          },
        ),
      );
    }
    return rpc.call(method, params, timeoutMs, meta);
  }

  notify(method: string, params: unknown): void {
    this.rpc?.notify(method, params);
  }

  start(): Promise<void> {
    this.startPromise ??= this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.callbacks.onState('starting');
    try {
      const plan = resolveLaunchPlan({
        addonId: this.target.addonId,
        trust: this.target.trust,
        profile: this.target.profile,
        osSandboxAvailable: this.deps.osLauncher.available(),
        allowUnsandboxedExternal: this.deps.grantPolicy.read().allowUnsandboxedExternal ?? false,
        inProcessEnabled: this.deps.settings.config.inProcessEnabled,
      });
      await this.launch(plan.mode === 'in-process');
      await this.handshake();
      this.callbacks.onState('running');
      this.startPingLoop();
      await this.deps.hooks.replayHook.replay(this.target.orgId, this.target.addonId);
    } catch (error) {
      await this.teardown();
      throw error;
    }
  }

  async shutdown(reason: string): Promise<void> {
    if (this.stopped || this.stopping) {
      return;
    }
    this.stopping = true;
    this.clearPingTimer();
    this.callbacks.onState('stopping');
    const rpc = this.rpc;
    if (rpc) {
      try {
        await rpc.call(
          'shutdown',
          { reason, deadlineMs: this.deps.settings.config.shutdownDeadlineMs },
          this.deps.settings.config.shutdownDeadlineMs,
        );
      } catch {
        this.logger.warn(
          { orgId: this.target.orgId, addonId: this.target.addonId },
          'addon shutdown call failed',
        );
        this.deps.logSink.write(
          this.target.orgId,
          this.target.addonId,
          `shutdown call failed: ${reason}`,
        );
      }
      await rpc.waitIdle(this.deps.settings.config.shutdownDeadlineMs).catch(() => undefined);
    }
    await this.teardown();
    this.stopped = true;
    this.callbacks.onState('stopped');
  }

  private async launch(inProcess: boolean): Promise<void> {
    const { orgId, addonId, version, packageRoot, entryPath, dataDir, platform } = this.target;
    if (inProcess) {
      const launched = await this.deps.transportFactory.forInProcess(
        { orgId, addonId, version, packageRoot, entryPath, dataDir },
        { orgId, addonId },
        this.deps.logSink,
      );
      this.adopt(launched.transport, launched.child);
      return;
    }
    const restrictedFallback = this.target.profile === 'restricted';
    const launcher = restrictedFallback ? this.deps.osLauncher : this.deps.noneLauncher;
    if (restrictedFallback && launcher.mechanism === 'none') {
      this.deps.audit.append(orgId, {
        actor: { kind: 'host', id: 'addon-supervisor' },
        action: 'addon.sandbox.unsandboxed_external',
        target: addonId,
        outcome: 'ok',
        details: { version, reason: 'OS sandbox unavailable, allowed by host policy' },
      });
    }
    const spawned = await launcher.spawn({
      orgId,
      addonId,
      version,
      packageRoot,
      command: ['bun', entryPath],
      dataDir,
      platform,
    });
    const launched = this.deps.transportFactory.forSpawned(
      spawned,
      { orgId, addonId },
      this.deps.logSink,
    );
    this.adopt(launched.transport, launched.child);
  }

  private adopt(transport: AddonTransportPort, child: ChildHandle | null): void {
    this.transport = transport;
    this.child = child;
    this.pid = child?.pid;
    this.startedAt = new Date(this.deps.clock.now()).toISOString();
    this.rpc = new TransportRpcClient({
      transport,
      locale: this.deps.settings.config.locale,
      handleRequest: (line, _message) =>
        this.deps.hooks.requestHandler.handle(
          this.target.orgId,
          this.target.addonId,
          line,
          this.generation,
        ),
      handleNotification: (line) =>
        void this.deps.hooks.requestHandler.handle(
          this.target.orgId,
          this.target.addonId,
          line,
          this.generation,
        ),
    });
    this.rpc.attach();
    if (child) {
      void child.exited.then((code) => {
        if (!this.stopping && !this.stopped) {
          this.callbacks.onExit('crashed', code);
        }
      });
    }
  }

  private async handshake(): Promise<void> {
    const rpc = this.rpc;
    if (!rpc) {
      throw new Error('transport missing before handshake');
    }
    const { settings, hooks } = this.deps;
    const result = await rpc.call<InitializeResult>(
      'initialize',
      {
        platform: PROTOCOL_PLATFORM,
        host: {
          version: settings.config.hostVersion,
          features: [...settings.config.hostFeatures],
        },
        instance: {
          orgId: this.target.orgId,
          generation: this.generation,
          dataDir: this.target.dataDir,
          locale: settings.config.locale,
        },
        permissions: hooks.permissionsProvider.effectivePermissions(
          this.target.orgId,
          this.target.addonId,
        ),
        experimental: hooks.permissionsProvider.experimentalMethods(this.target.addonId),
        deprecations: hooks.permissionsProvider.deprecations(this.target.addonId),
      },
      settings.config.startupTimeoutMs,
    );
    if (result.addon.id !== this.target.addonId) {
      throw new AddonIdentityMismatchError(this.target.addonId, result.addon.id);
    }
    const check = hooks.handlersValidator.validate(this.target.addonId, result.handlers);
    if (!check.ok) {
      throw new AddonHandlersMismatchError(check.missing);
    }
    rpc.notify('initialized', {});
  }

  private startPingLoop(): void {
    this.pingTimer = this.deps.timers.setTimeout(
      () => void this.pingTick(),
      this.deps.settings.config.pingIntervalMs,
    );
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== undefined) {
      this.deps.timers.clearTimeout(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private async pingTick(): Promise<void> {
    if (this.stopped || this.stopping || !this.rpc) {
      return;
    }
    this.checkRssLimit();
    try {
      await this.rpc.call('ping', {}, this.deps.settings.config.pingTimeoutMs);
      this.pingMisses = 0;
    } catch {
      this.pingMisses += 1;
      if (this.pingMisses >= this.deps.settings.config.pingMissesToRestart) {
        this.callbacks.onExit('ping_unresponsive', null);
        return;
      }
    }
    this.startPingLoop();
  }

  private checkRssLimit(): void {
    if (!this.child) {
      return;
    }
    const rss = this.child.rssBytes();
    if (rss === null) {
      if (!this.rssUnavailableLogged) {
        this.rssUnavailableLogged = true;
        this.deps.logSink.write(
          this.target.orgId,
          this.target.addonId,
          'rss measurement unavailable for this platform/runtime; limit checks skipped',
        );
      }
      return;
    }
    if (rss > this.deps.settings.config.rssLimitBytes) {
      this.callbacks.onExit('rss_limit', null);
    }
  }

  private async teardown(): Promise<void> {
    this.clearPingTimer();
    this.rpc?.detach();
    this.rpc = null;
    this.transport?.close();
    this.transport = null;
    const child = this.child;
    if (child) {
      child.kill(SIGTERM);
      const killTimer = this.deps.timers.setTimeout(
        () => child.kill(SIGKILL),
        this.deps.settings.config.sigtermGraceMs,
      );
      await child.exited;
      this.deps.timers.clearTimeout(killTimer);
      this.child = null;
    }
    this.pid = undefined;
  }
}
