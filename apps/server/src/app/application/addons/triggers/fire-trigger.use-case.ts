import { Inject, Injectable, Logger } from '@harnesys/brix';
import { type TriggerScripts, TriggerScriptsSchema, type WorkspaceRef } from '@harnesys/contracts';
import { TriggerDescriptorSchema } from '@harnesys/sdk';
import {
  TRIGGER_HUMAN_ORIGIN,
  type TriggerTaskField,
  triggerTaskText,
} from '@harnesys/studio-shared';
import { AddonException } from '../../../domain/addons/errors.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import type { TriggerInstanceRow } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { TriggerWorkspacePort } from '../../../domain/thread/trigger-workspace.port.ts';
import { type RunDispatchOutcome, RunDispatchPort } from '../run-dispatch.port.ts';
import { RunTriggerScriptsUseCase } from './run-trigger-scripts.use-case.ts';
import { FireWindowTracker, type TriggerLimits } from './trigger-limits.ts';

export interface FireTriggerInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  runKey: string;
  text?: string;
  title?: string;
  fields?: TriggerTaskField[];
  payload?: unknown;
  correlationId?: string;
}

export interface FireTriggerResult {
  outcome: RunDispatchOutcome;
  runId?: string | null;
}

interface FireTarget {
  agentId?: string;
  threadId?: string;
  modeId?: string;
  workspace?: WorkspaceRef;
  scripts?: unknown;
}

interface FireScriptContext {
  input: FireTriggerInput;
  instance: TriggerInstanceRow;
  target: FireTarget;
  threadId: string;
  scripts: TriggerScripts | undefined;
  firedAt: string;
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
    private readonly triggerWorkspace: TriggerWorkspacePort,
    private readonly scripts: RunTriggerScriptsUseCase,
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
    const target = this.targetOf(instance);
    if (!target.threadId) {
      return this.suppressed(input, 'no_target');
    }
    if (target.workspace !== undefined) {
      this.applyWorkspace(input.orgId, target.threadId, target.workspace);
    }
    const scripts = this.scriptsOf(target.scripts);
    const firedAt = new Date(now).toISOString();
    const scriptContext: FireScriptContext = {
      input,
      instance,
      target,
      threadId: target.threadId,
      scripts,
      firedAt,
    };
    const pre = await this.runPreScript(scriptContext);
    if (pre.blocked !== undefined) {
      return this.suppressed(input, pre.blocked);
    }
    const limits = this.limitsOf(input.orgId, instance);
    if (!this.tracker.allow(input.instanceId, limits, now)) {
      return this.suppressed(input, 'limits');
    }
    const text = this.textOf(input, instance);
    const { outcome, runId } = await this.dispatch.dispatch({
      orgId: input.orgId,
      threadId: target.threadId,
      agentId: target.agentId ?? '',
      text: pre.note === undefined ? text : `${text}\n\n${pre.note}`,
      origin: TRIGGER_HUMAN_ORIGIN,
      runKey: input.runKey,
      correlationId: input.correlationId,
      ...(target.modeId === undefined ? {} : { mode: target.modeId }),
      ...(input.payload === undefined ? {} : { payload: input.payload }),
      actorUserId: instance.createdByUserId,
    });
    this.schedulePost(scriptContext, runId, pre.cwd);
    this.metrics.increment('addon.trigger.fire', {
      orgId: input.orgId,
      addonId: input.addonId,
      outcome,
    });
    this.logger.info(
      { orgId: input.orgId, instanceId: input.instanceId, runKey: input.runKey, outcome },
      'trigger fired',
    );
    return runId === undefined ? { outcome } : { outcome, runId };
  }

  private async runPreScript(
    context: FireScriptContext,
  ): Promise<{ blocked?: string; cwd: string | null; note?: string }> {
    const { input, instance, target, scripts, firedAt } = context;
    if (scripts?.pre === undefined) {
      return { cwd: null };
    }
    const pre = await this.scripts.runPre({
      orgId: input.orgId,
      addonId: input.addonId,
      instanceId: input.instanceId,
      triggerId: instance.triggerId,
      threadId: context.threadId,
      agentId: target.agentId ?? '',
      ...(input.payload === undefined ? {} : { payload: input.payload }),
      firedAt,
      pre: scripts.pre,
    });
    if (!pre.proceed) {
      return { blocked: pre.reason ?? 'script-failed', cwd: pre.cwd };
    }
    return { cwd: pre.cwd, ...(pre.note === undefined ? {} : { note: pre.note }) };
  }

  private schedulePost(context: FireScriptContext, runId: string | null, cwd: string | null): void {
    const { input, instance, target, scripts, firedAt } = context;
    if (runId === null || scripts?.post === undefined) {
      return;
    }
    this.scripts.registerPost({
      context: {
        orgId: input.orgId,
        addonId: input.addonId,
        instanceId: input.instanceId,
        triggerId: instance.triggerId,
        threadId: context.threadId,
        agentId: target.agentId ?? '',
        ...(input.payload === undefined ? {} : { payload: input.payload }),
        firedAt,
      },
      post: scripts.post,
      runId,
      cwd: cwd ?? this.scripts.resolveCwd({ orgId: input.orgId, threadId: context.threadId }),
    });
  }

  private textOf(input: FireTriggerInput, instance: TriggerInstanceRow): string {
    return triggerTaskText({
      addonId: input.addonId,
      triggerId: instance.triggerId,
      label: instance.label,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.text === undefined ? {} : { text: input.text }),
      ...(input.fields === undefined ? {} : { fields: input.fields }),
      instructions: instance.instructions,
    });
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

  private applyWorkspace(orgId: string, threadId: string, workspace: WorkspaceRef): void {
    try {
      this.triggerWorkspace.apply({ orgId, threadId, workspace });
    } catch (error) {
      this.logger.warn(
        { orgId, threadId, error: error instanceof Error ? error.message : String(error) },
        'trigger workspace apply failed, keeping the current thread binding',
      );
    }
  }

  private scriptsOf(value: unknown): TriggerScripts | undefined {
    if (value === undefined) {
      return undefined;
    }
    const parsed = TriggerScriptsSchema.safeParse(value);
    if (!parsed.success) {
      return undefined;
    }
    const scripts = parsed.data;
    if (!scripts.acknowledged && (scripts.pre !== undefined || scripts.post !== undefined)) {
      return undefined;
    }
    return scripts;
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
