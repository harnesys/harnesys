import type { InstanceRuntime } from './instance-runtime.ts';

export interface SupervisorNotifyOutcome {
  delivered: boolean;
}

export function requestOfRuntime(
  runtimes: ReadonlyMap<string, InstanceRuntime>,
  orgId: string,
  addonId: string,
  method: string,
  params: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const runtime = requireRuntime(runtimes, orgId, addonId);
  return runtime.request(method, params, timeoutMs);
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
