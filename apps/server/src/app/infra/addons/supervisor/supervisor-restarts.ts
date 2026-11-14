import type { Logger } from '@harnesys/brix';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { backoffDelayMs, CrashBreaker } from './crash-breaker.ts';
import type { InstanceRegistry } from './instance-registry.ts';
import type { InstanceRuntime } from './instance-runtime.ts';
import type { SupervisorSettings } from './supervisor.config.ts';
import type { SupervisorHooks, SupervisorTimers } from './supervisor-deps.ts';

export interface SupervisorLifecycleCallbacks {
  ensureRunning(orgId: string, addonId: string, reason: string): Promise<unknown>;
  stop(orgId: string, addonId: string, reason: string): Promise<void>;
}

/**
 * Backoff timers, idle timers and crash breakers of the supervisor,
 * extracted to keep the supervisor class focused on instance lifecycle.
 */
export class SupervisorRestartPolicy {
  private readonly backoffTimers = new Map<string, unknown>();
  private readonly idleTimers = new Map<string, unknown>();
  private readonly breakers = new Map<string, CrashBreaker>();

  constructor(
    private readonly timers: SupervisorTimers,
    private readonly settings: SupervisorSettings,
    private readonly hooks: SupervisorHooks,
    private readonly registry: InstanceRegistry,
    private readonly runtimes: ReadonlyMap<string, InstanceRuntime>,
    private readonly clock: ClockPort,
    private readonly callbacks: SupervisorLifecycleCallbacks,
    private readonly logger: Logger,
  ) {}

  cancelBackoff(orgId: string, addonId: string): void {
    const key = `${orgId}/${addonId}`;
    const pending = this.backoffTimers.get(key);
    if (pending !== undefined) {
      this.timers.clearTimeout(pending);
      this.backoffTimers.delete(key);
    }
  }

  resetIdleTimer(orgId: string, addonId: string): void {
    const key = `${orgId}/${addonId}`;
    this.clearIdleTimer(key);
    const timer = this.timers.setTimeout(() => {
      this.idleTimers.delete(key);
      this.idleCheck(orgId, addonId);
    }, this.settings.config.idleTimeoutMs);
    this.idleTimers.set(key, timer);
  }

  breaker(orgId: string, addonId: string): CrashBreaker {
    const key = `${orgId}/${addonId}`;
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CrashBreaker(
        this.clock,
        this.settings.config.crashWindowMs,
        this.settings.config.crashThreshold,
      );
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  scheduleRestart(orgId: string, addonId: string, reason: string): void {
    const key = `${orgId}/${addonId}`;
    const restarts = this.registry.get(orgId, addonId)?.restarts ?? 1;
    const delay = backoffDelayMs(
      restarts,
      this.settings.config.backoffInitialMs,
      this.settings.config.backoffMaxMs,
    );
    if (!this.hooks.reasonsToLive.hasReason(orgId, addonId)) {
      this.logger.info(
        { orgId, addonId, reason },
        'no reason to live, waiting for next ensureRunning',
      );
      return;
    }
    const timer = this.timers.setTimeout(() => {
      this.backoffTimers.delete(key);
      void this.callbacks
        .ensureRunning(orgId, addonId, `restart after ${reason}`)
        .catch((error: unknown) => {
          this.logger.warn({ orgId, addonId, error: String(error) }, 'scheduled restart failed');
        });
    }, delay);
    this.backoffTimers.set(key, timer);
  }

  private idleCheck(orgId: string, addonId: string): void {
    const runtime = this.runtimes.get(`${orgId}/${addonId}`);
    if (!runtime || runtime.isStopped) {
      return;
    }
    if (this.hooks.reasonsToLive.hasReason(orgId, addonId) || runtime.inFlightCalls > 0) {
      this.resetIdleTimer(orgId, addonId);
      return;
    }
    void this.callbacks.stop(orgId, addonId, 'idle_timeout');
  }

  private clearIdleTimer(key: string): void {
    const timer = this.idleTimers.get(key);
    if (timer !== undefined) {
      this.timers.clearTimeout(timer);
      this.idleTimers.delete(key);
    }
  }
}
