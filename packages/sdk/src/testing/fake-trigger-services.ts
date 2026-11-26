import { AddonError } from '../protocol/error.ts';
import type { FakeServiceContext } from './fake-services.ts';

type ServiceParams = Record<string, unknown>;

export interface FakeTriggerServices {
  fire(params: ServiceParams): unknown;
  get(params: ServiceParams): unknown;
  create(params: ServiceParams): unknown;
  update(params: ServiceParams): unknown;
}

export function createFakeTriggerServices(context: FakeServiceContext): FakeTriggerServices {
  function fire(params: ServiceParams): unknown {
    const instanceId = params.instanceId as string;
    const runKey = params.runKey as string;
    if (!context.startedTriggers.has(instanceId)) {
      throw new AddonError('not_found', {
        detail: `trigger instance '${instanceId}' was not started`,
      });
    }
    const key = `${instanceId}:${runKey}`;
    if (context.firedKeys.has(key)) {
      return { outcome: 'suppressed' };
    }
    context.firedKeys.add(key);
    return { outcome: 'fired' };
  }

  function create(params: ServiceParams): unknown {
    const kind = params.kind as string;
    const declared = context.manifest.contributions.some(
      (c) => c.family === 'trigger' && (c.descriptor as { kind?: string }).kind === kind,
    );
    if (!declared) {
      throw new AddonError('invalid_params', {
        detail: `trigger kind is not declared: ${kind}`,
      });
    }
    const instanceId = `trigger-instance-${context.sinks.createdTriggerInstances.length + 1}`;
    context.sinks.createdTriggerInstances.push({ ...params, instanceId });
    context.startedTriggers.add(instanceId);
    return { instanceId };
  }

  function get(params: ServiceParams): unknown {
    const instanceId = params.instanceId as string;
    const stored = context.sinks.createdTriggerInstances.find(
      (row) => row.instanceId === instanceId,
    );
    if (!stored) {
      throw new AddonError('not_found', {
        detail: `trigger instance not found: ${instanceId}`,
      });
    }
    return {
      instanceId,
      kind: stored.kind as string,
      label: typeof stored.label === 'string' ? stored.label : '',
      config: (stored.config as Record<string, unknown> | undefined) ?? {},
      target: stored.target ?? null,
      instructions: typeof stored.instructions === 'string' ? stored.instructions : '',
      enabled: stored.enabled !== false,
    };
  }

  function update(params: ServiceParams): unknown {
    const instanceId = params.instanceId as string;
    const stored = context.sinks.createdTriggerInstances.find(
      (row) => row.instanceId === instanceId,
    );
    if (!stored) {
      throw new AddonError('not_found', {
        detail: `trigger instance not found: ${instanceId}`,
      });
    }
    for (const key of ['label', 'config', 'target', 'instructions'] as const) {
      if (params[key] !== undefined) {
        stored[key] = params[key];
      }
    }
    return { instanceId };
  }

  return { fire, get, create, update };
}
