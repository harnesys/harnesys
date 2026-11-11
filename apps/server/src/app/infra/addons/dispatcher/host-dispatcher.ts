import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';
import type { HostCallContext, HostMethodSpec } from '../../../domain/addons/host-service.ts';
import { coversGrant } from '../../../domain/addons/host-service.ts';
import type { EffectiveGrants } from '../../../domain/addons/permissions.ts';
import { applyHostPolicyToGrants } from '../../../domain/addons/permissions.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { HostServiceRegistryPort } from '../../../domain/addons/ports/host-service-registry.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { TokenBucketRateLimiter } from '../../../domain/addons/rate-limit.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import type { OrgAuditRow } from '../../../domain/fleet/org-audit.port.ts';
import { OrgAudit } from '../../../domain/fleet/org-audit.port.ts';
import type { MetricLabels } from '../../../domain/metrics/metrics.port.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { InstanceGenerationPort } from './instance-generation.port.ts';

export interface DispatchTarget {
  orgId: string;
  addonId: string;
  instanceId: string;
  generation: number;
  correlationId: string;
  signal?: AbortSignal;
}

const DEFAULT_RATE = { perSec: 200, burst: 400 };
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULT_KB = 256;

@Injectable()
export class HostDispatcher {
  constructor(
    private readonly registry: HostServiceRegistryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly metrics: MetricsPort,
    private readonly audit: OrgAudit,
    private readonly limiter: TokenBucketRateLimiter,
    private readonly generations: InstanceGenerationPort,
    private readonly grantPolicy: GrantPolicyPort,
  ) {}

  async dispatch(target: DispatchTarget, method: string, params: unknown): Promise<unknown> {
    const spec = this.lookupSpec(method);
    this.assertCurrentGeneration(target, method);
    const grants = this.readGrants(target);
    const controller = new AbortController();
    const ctx = this.buildContext(target, grants, controller);
    const startedAt = this.clock.now();
    try {
      this.assertPermission(spec, grants, method);
      const parsed = this.parseParams(spec, params, method);
      this.acquireRate(spec, target, method);
      const raw = await this.invoke(spec, ctx, parsed, controller, target);
      const result = this.validateResult(spec, raw, method);
      this.record(target, method, 'ok', startedAt);
      return result;
    } catch (error) {
      const reason = error instanceof AddonError ? error.reason : 'internal';
      this.record(target, method, reason, startedAt);
      throw error instanceof AddonError ? error : this.wrapInternal(error);
    }
  }

  private lookupSpec(method: string): HostMethodSpec {
    const [namespace, name = ''] = method.split('.');
    const spec = this.registry.lookup(namespace ?? '', name);
    if (!spec) {
      throw new AddonError('unsupported', { detail: `unknown method: ${method}` });
    }
    return spec;
  }

  private assertCurrentGeneration(target: DispatchTarget, method: string): void {
    const current = this.generations.current(target.orgId, target.addonId);
    if (current !== null && current !== target.generation) {
      throw new AddonError('unavailable', { detail: `stale generation for ${method}` });
    }
  }

  private readGrants(target: DispatchTarget): EffectiveGrants {
    const row = this.orgAddons.find(target.orgId, target.addonId);
    if (!row) {
      throw new AddonError('not_found', { detail: `add-on ${target.addonId} is not enabled` });
    }
    if (!row.enabled) {
      throw new AddonError('unavailable', { detail: `add-on ${target.addonId} is disabled` });
    }
    return applyHostPolicyToGrants(parseGrants(row.grantsJson), this.grantPolicy.read());
  }

  private assertPermission(spec: HostMethodSpec, grants: EffectiveGrants, method: string): void {
    if (spec.permission === null) {
      return;
    }
    if (!coversGrant(grants, spec.permission)) {
      throw new AddonError('permission_denied', {
        detail: `permission '${spec.permission}' required for ${method}`,
      });
    }
  }

  private parseParams(spec: HostMethodSpec, params: unknown, method: string): unknown {
    const parsed = spec.params.safeParse(params);
    if (!parsed.success) {
      throw new AddonError('invalid_params', {
        detail: `${method}: ${describeIssue(parsed.error)}`,
      });
    }
    return parsed.data;
  }

  private acquireRate(spec: HostMethodSpec, target: DispatchTarget, method: string): void {
    const rate = spec.limits?.rate ?? DEFAULT_RATE;
    const key = `${target.orgId}:${target.addonId}`;
    if (!this.limiter.tryAcquire(key, rate)) {
      throw new AddonError('rate_limited', {
        detail: `rate limit exceeded for ${method}`,
        retryable: true,
      });
    }
  }

  private async invoke(
    spec: HostMethodSpec,
    ctx: HostCallContext,
    params: unknown,
    controller: AbortController,
    target: DispatchTarget,
  ): Promise<unknown> {
    const timeoutMs = spec.limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const onOuterAbort = () => controller.abort();
    target.signal?.addEventListener('abort', onOuterAbort, { once: true });
    // Local to this invocation (§6.6): concurrent calls must not clear each
    // other's timeout timers.
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        controller.abort();
        reject(new AddonError('timeout', { detail: `${spec.name} timed out`, retryable: true }));
      }, timeoutMs);
      timeoutTimer.unref?.();
    });
    try {
      return await Promise.race([spec.handle(ctx, params), timeout]);
    } finally {
      clearTimeout(timeoutTimer);
      target.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private validateResult(spec: HostMethodSpec, raw: unknown, method: string): unknown {
    const parsed = spec.result.safeParse(raw);
    if (!parsed.success) {
      throw new AddonError('invalid_response', {
        detail: `${method}: ${describeIssue(parsed.error)}`,
      });
    }
    const maxKb = spec.limits?.maxResultKb ?? DEFAULT_MAX_RESULT_KB;
    const bytes = Buffer.byteLength(JSON.stringify(parsed.data) ?? '');
    if (bytes > maxKb * 1024) {
      throw new AddonError('invalid_response', {
        detail: `${method}: result exceeds ${maxKb} KiB`,
      });
    }
    return parsed.data;
  }

  private buildContext(
    target: DispatchTarget,
    grants: EffectiveGrants,
    controller: AbortController,
  ) {
    return {
      orgId: target.orgId,
      addonId: target.addonId,
      instanceId: target.instanceId,
      generation: target.generation,
      correlationId: target.correlationId,
      grants,
      now: () => this.clock.now(),
      signal: controller.signal,
    };
  }

  private record(target: DispatchTarget, method: string, outcome: string, startedAt: number): void {
    const labels: MetricLabels = { addon: target.addonId, method, outcome };
    this.metrics.increment('addons_host_call_total', labels);
    this.metrics.observe('addons_host_call_seconds', (this.clock.now() - startedAt) / 1000, labels);
    if (outcome !== 'ok') {
      const row: OrgAuditRow = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actorKind: 'system',
        actorId: `addon:${target.addonId}`,
        viaNodeId: null,
        action: 'addon.host_call',
        resource: `${target.addonId}/${method}`,
        result: outcome,
      };
      this.audit.append(target.orgId, row);
    }
  }

  private wrapInternal(error: unknown): AddonError {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return new AddonError('internal', { detail });
  }
}

function parseGrants(grantsJson: string): EffectiveGrants {
  try {
    const parsed: unknown = JSON.parse(grantsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (entry): entry is { id: string; scope?: Record<string, unknown> } =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as { id?: unknown }).id === 'string',
      )
      .map((entry) => ({ id: entry.id, ...(entry.scope ? { scope: entry.scope } : {}) }));
  } catch {
    return [];
  }
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'validation failed';
  }
  const path = issue.path.length > 0 ? issue.path.join('.') : 'params';
  return `${path}: ${issue.message}`;
}
