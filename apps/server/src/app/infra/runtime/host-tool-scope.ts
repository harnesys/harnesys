import { AsyncLocalStorage } from 'node:async_hooks';
import type { CapabilityScope } from 'harnesys';

const storage = new AsyncLocalStorage<CapabilityScope>();

export function runInHostToolScope<T>(scope: CapabilityScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export function getHostToolScope(): CapabilityScope | undefined {
  return storage.getStore();
}

export function requireHostToolScope(): CapabilityScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new Error('host tool scope missing');
  }
  return scope;
}
