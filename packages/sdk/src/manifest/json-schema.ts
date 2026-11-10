import { z } from 'zod';
import { familyRegistry } from '../families/registry.ts';
import { AddonManifestSchema } from './manifest.ts';

export function manifestJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AddonManifestSchema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
}

export function contributionDescriptorJsonSchema(
  family: string,
  v?: number,
): Record<string, unknown> | null {
  const module = familyRegistry[family];
  if (!module) {
    return null;
  }
  return z.toJSONSchema(module.schema(v ?? 1), { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
}
