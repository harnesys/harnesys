export interface ModuleInitHook {
  onModuleInit(): void | Promise<void>;
}

export interface ModuleDestroyHook {
  onModuleDestroy(): void | Promise<void>;
}

type LifecycleMethod = 'onModuleInit' | 'onModuleDestroy';

function implementsMethod(instance: unknown, method: LifecycleMethod): boolean {
  return (
    typeof instance === 'object' &&
    instance !== null &&
    typeof (instance as Record<string, unknown>)[method] === 'function'
  );
}

export function hasModuleInit(instance: unknown): instance is ModuleInitHook {
  return implementsMethod(instance, 'onModuleInit');
}

export function hasModuleDestroy(instance: unknown): instance is ModuleDestroyHook {
  return implementsMethod(instance, 'onModuleDestroy');
}

export async function runModuleInit(instances: unknown[]): Promise<void> {
  for (const instance of instances) {
    if (hasModuleInit(instance)) {
      await instance.onModuleInit();
    }
  }
}

export async function runModuleDestroy(instances: unknown[]): Promise<void> {
  const errors: unknown[] = [];
  for (const instance of [...instances].reverse()) {
    if (!hasModuleDestroy(instance)) {
      continue;
    }
    try {
      await instance.onModuleDestroy();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'onModuleDestroy hooks failed');
  }
}
