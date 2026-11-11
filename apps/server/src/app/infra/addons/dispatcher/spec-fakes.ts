import { z } from 'zod';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../domain/addons/host-service.ts';
import type { AddonHostPolicy, EffectiveGrants } from '../../../domain/addons/permissions.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { TokenBucketRateLimiter } from '../../../domain/addons/rate-limit.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import type { OrgAuditRow } from '../../../domain/fleet/org-audit.port.ts';
import { OrgAudit } from '../../../domain/fleet/org-audit.port.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { HostDispatcher } from './host-dispatcher.ts';
import { InMemoryHostServiceRegistry } from './host-service-registry.adapter.ts';
import { InstanceGenerationPort } from './instance-generation.port.ts';
import { PermissionDefinitionRegistry } from './permission-definitions.ts';

export class FakeClock extends ClockPort {
  constructor(private current = 1_000_000) {
    super();
  }
  override now(): number {
    return this.current;
  }
}

export class FakeMetrics extends MetricsPort {
  readonly counters: Array<{ name: string; labels: Record<string, string> }> = [];
  override increment(name: string, labels: Record<string, string>): void {
    this.counters.push({ name, labels });
  }
  override observe(): void {}
}

export class FakeAudit extends OrgAudit {
  readonly rows: OrgAuditRow[] = [];
  override append(_orgId: string, row: OrgAuditRow): void {
    this.rows.push(row);
  }
  override list() {
    return { items: this.rows, total: this.rows.length };
  }
}

export class FakeRepo extends OrgAddonRepositoryPort {
  private readonly row: OrgAddonRow;

  constructor(grants: EffectiveGrants, enabled = true) {
    super();
    this.row = {
      orgId: 'org1',
      addonId: 'acme.test',
      version: '1.0.0',
      enabled,
      grantsJson: JSON.stringify(grants),
      grantsDigest: 'digest',
      configJson: '{}',
      health: 'running',
      lastError: null,
      createdAt: '',
      updatedAt: '',
    };
  }

  override find(orgId: string, addonId: string): OrgAddonRow | null {
    return orgId === this.row.orgId && addonId === this.row.addonId ? this.row : null;
  }
  override list(): OrgAddonRow[] {
    return [this.row];
  }
  override listAll(): OrgAddonRow[] {
    return [this.row];
  }
  override setEnabled(_o: string, _a: string, enabled: boolean): void {
    this.row.enabled = enabled;
  }
  override updateGrants(_o: string, _a: string, grantsJson: string): void {
    this.row.grantsJson = grantsJson;
  }
  override upsert(): void {}
  override updateConfig(): void {}
  override updateHealth(): void {}
  override remove(): void {}
}

export class FakeGrantPolicy extends GrantPolicyPort {
  constructor(private policy: AddonHostPolicy = {}) {
    super();
  }
  override read(): AddonHostPolicy {
    return this.policy;
  }
  override write(policy: AddonHostPolicy): void {
    this.policy = policy;
  }
}

export class FixedGeneration extends InstanceGenerationPort {
  private readonly value: number | null;
  constructor(generation: number | null) {
    super();
    this.value = generation;
  }
  override current(): number | null {
    return this.value;
  }
}

export function target(): {
  orgId: string;
  addonId: string;
  instanceId: string;
  generation: number;
  correlationId: string;
} {
  return {
    orgId: 'org1',
    addonId: 'acme.test',
    instanceId: 'inst1',
    generation: 2,
    correlationId: 'corr-1',
  };
}

export function methodSpec(args: {
  name: string;
  permission?: string | null;
  limits?: { rate?: { perSec: number; burst: number }; timeoutMs?: number; maxResultKb?: number };
  handle: (ctx: HostCallContext, params: { value: number }) => Promise<unknown>;
  result?: z.ZodType;
}): HostMethodSpec {
  return {
    name: args.name,
    params: z.object({ value: z.number() }),
    result: args.result ?? z.object({ value: z.number() }),
    permission: args.permission ?? null,
    limits: args.limits,
    handle: args.handle as (ctx: HostCallContext, params: unknown) => Promise<unknown>,
  };
}

export function buildSpecModule(methods: HostMethodSpec[]): HostServiceModule {
  return { namespace: 'test', methods };
}

export function buildDispatcher(
  module: HostServiceModule,
  generation: number | null = null,
  clock = new FakeClock(),
  grants: EffectiveGrants = [{ id: 'runs.dispatch' }],
): {
  dispatcher: HostDispatcher;
  metrics: FakeMetrics;
  audit: FakeAudit;
  registry: InMemoryHostServiceRegistry;
  repo: FakeRepo;
} {
  const registry = new InMemoryHostServiceRegistry(new PermissionDefinitionRegistry());
  registry.register(module);
  const metrics = new FakeMetrics();
  const audit = new FakeAudit();
  const repo = new FakeRepo(grants);
  const dispatcher = new HostDispatcher(
    registry,
    repo,
    clock,
    metrics,
    audit,
    new TokenBucketRateLimiter(clock),
    new FixedGeneration(generation),
    new FakeGrantPolicy(),
  );
  return { dispatcher, metrics, audit, registry, repo };
}
