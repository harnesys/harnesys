import { Inject, Injectable, Logger } from '@harnesys/brix';
import { TriggerDescriptorSchema } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import type { TriggerInstanceRow } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { type RunDispatchOutcome, RunDispatchPort } from '../run-dispatch.port.ts';
import { FireWindowTracker, type TriggerLimits } from './trigger-limits.ts';

export interface FireTriggerInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  runKey: string;
  text: string;
  payload?: unknown;
  correlationId?: string;
}

export interface FireTriggerResult {
  outcome: RunDispatchOutcome;
}

interface FireTarget {
  agentId?: string;
  threadId?: string;
}

const NO_LIMITS: TriggerLimits = {};

@Injectable()
export class FireTriggerUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly dispatch: RunDispatchPort,
    private readonly tracker: FireWindowTracker,
    private readonly metrics: MetricsPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-fire-trigger');
  }

  async execute(input: FireTriggerInput): Promise<FireTriggerResult> {
    const instance = this.triggers.find(input.orgId, input.instanceId);
    if (!instance) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${input.instanceId}`);
    }
    if (instance.addonId !== input.addonId) {
      throw new AddonException(
        'permission_denied',
        403,
        'Trigger instance belongs to another addon',
      );
    }
    if (!instance.enabled) {
      return this.suppressed(input, 'disabled');
    }
    const now = Date.now();
    if (!this.triggers.recordFire(input.instanceId, input.runKey, now)) {
      return this.suppressed(input, 'dedup');
    }
    const limits = this.limitsOf(input.orgId, instance);
    if (!this.tracker.allow(input.instanceId, limits, now)) {
      return this.suppressed(input, 'limits');
    }
    const target = this.targetOf(instance);
    if (!target.threadId) {
      return this.suppressed(input, 'no_target');
    }
    const { outcome } = await this.dispatch.dispatch({
      orgId: input.orgId,
      threadId: target.threadId,
      agentId: target.agentId ?? '',
      text: input.text,
      runKey: input.runKey,
      correlationId: input.correlationId,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    });
    this.metrics.increment('addon.trigger.fire', {
      orgId: input.orgId,
      addonId: input.addonId,
      outcome,
    });
    this.logger.info(
      { orgId: input.orgId, instanceId: input.instanceId, runKey: input.runKey, outcome },
      'trigger fired',
    );
    return { outcome };
  }

  private suppressed(input: FireTriggerInput, reason: string): FireTriggerResult {
    this.metrics.increment('addon.trigger.fire', {
      orgId: input.orgId,
      addonId: input.addonId,
      outcome: 'suppressed',
    });
    this.logger.debug(
      { instanceId: input.instanceId, runKey: input.runKey, reason },
      'trigger fire suppressed',
    );
    return { outcome: 'suppressed' };
  }

  private limitsOf(orgId: string, instance: TriggerInstanceRow): TriggerLimits {
    const record = this.registry
      .contributions(orgId, 'trigger')
      .find((entry) => entry.descriptor.kind === instance.triggerId);
    if (!record) {
      return NO_LIMITS;
    }
    const parsed = TriggerDescriptorSchema.pick({ limits: true }).safeParse(record.descriptor);
    return parsed.success ? (parsed.data.limits ?? NO_LIMITS) : NO_LIMITS;
  }

  private targetOf(instance: TriggerInstanceRow): FireTarget {
    try {
      const parsed: unknown = JSON.parse(instance.targetJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as FireTarget)
        : {};
    } catch {
      return {};
    }
  }
}
