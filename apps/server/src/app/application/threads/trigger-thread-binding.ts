import type { TriggerInstanceRow } from '../../domain/addons/ports/trigger-instance-repository.port.ts';

export function occupiedTriggerInstanceThreadId(
  instances: TriggerInstanceRow[],
  threadId: string,
  exceptInstanceId?: string,
): string | undefined {
  for (const instance of instances) {
    if (instance.id === exceptInstanceId) {
      continue;
    }
    if (triggerInstanceThreadId(instance) === threadId) {
      return instance.id;
    }
  }
  return undefined;
}

export function triggerInstanceThreadId(instance: TriggerInstanceRow): string | undefined {
  try {
    const parsed: unknown = JSON.parse(instance.targetJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const threadId = (parsed as Record<string, unknown>).threadId;
      return typeof threadId === 'string' && threadId ? threadId : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
