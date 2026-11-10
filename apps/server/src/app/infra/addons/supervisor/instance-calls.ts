import type { InstanceRuntime } from './instance-runtime.ts';

export interface SupervisorNotifyOutcome {
  delivered: boolean;
}

export interface RuntimeCallInput {
  runtimes: ReadonlyMap<string, InstanceRuntime>;
  orgId: string;
  addonId: string;
  method: string;
  params: unknown;
  timeoutMs: number;
}

export function requestOfRuntime(input: RuntimeCallInput): Promise<unknown> {
  const runtime = requireRuntime(input.runtimes, input.orgId, input.addonId);
  return runtime.request(input.method, input.params, input.timeoutMs);
}

export function notifyRuntime(
  runtimes: ReadonlyMap<string, InstanceRuntime>,
  orgId: string,
  addonId: string,
  method: string,
  params: unknown,
): SupervisorNotifyOutcome {
  const runtime = runtimes.get(`${orgId}/${addonId}`);
  if (!runtime || runtime.isStopped) {
    return { delivered: false };
  }
  runtime.notify(method, params);
  return { delivered: true };
}

export function requireRuntime(
  runtimes: ReadonlyMap<string, InstanceRuntime>,
  orgId: string,
  addonId: string,
): InstanceRuntime {
  const runtime = runtimes.get(`${orgId}/${addonId}`);
  if (!runtime || runtime.isStopped) {
    throw new Error(`Addon instance is not running: ${orgId}/${addonId}`);
  }
  return runtime;
}
