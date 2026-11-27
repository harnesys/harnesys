import type { JsonObject, TriggerDescriptor } from '@harnesys/sdk';
import { TriggerDescriptorSchema } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';

export interface AddonManifestLike {
  contributions: Array<{ family: string; descriptor: JsonObject }>;
}

export function triggerDescriptorOf(
  manifest: AddonManifestLike,
  triggerId: string,
): TriggerDescriptor {
  for (const entry of manifest.contributions) {
    if (entry.family !== 'trigger' || !isTriggerKind(entry.descriptor, triggerId)) {
      continue;
    }
    const parsed = TriggerDescriptorSchema.safeParse(entry.descriptor);
    if (!parsed.success) {
      throw new AddonException(
        'invalid_params',
        422,
        `Trigger descriptor for ${triggerId} is malformed: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    return parsed.data;
  }
  throw new AddonException('not_found', 404, `Trigger kind is not declared: ${triggerId}`);
}

export function parseTriggerConfigJson(configJson: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(configJson);
  } catch {
    throw new AddonException('invalid_params', 422, 'trigger config must be valid JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AddonException('invalid_params', 422, 'trigger config must be an object');
  }
  return value as Record<string, unknown>;
}

function isTriggerKind(descriptor: JsonObject, triggerId: string): boolean {
  return typeof descriptor.kind === 'string' && descriptor.kind === triggerId;
}
