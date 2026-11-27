import type { AddonManifest } from '../manifest/manifest.ts';

export interface ToolSchemaDescriptor {
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toolSchemaDescriptor(
  manifest: AddonManifest,
  tool: string,
): ToolSchemaDescriptor | null {
  for (const contribution of manifest.contributions) {
    if (contribution.family !== 'tool-pack') {
      continue;
    }
    const entry = toolEntry(contribution.descriptor, tool);
    if (entry) {
      return {
        ...(isPlainObject(entry.inputSchema) ? { inputSchema: entry.inputSchema } : {}),
        ...(isPlainObject(entry.outputSchema) ? { outputSchema: entry.outputSchema } : {}),
      };
    }
  }
  return null;
}

function toolEntry(
  descriptor: Record<string, unknown>,
  tool: string,
): Record<string, unknown> | null {
  const tools = descriptor.tools;
  if (!Array.isArray(tools)) {
    return null;
  }
  return (
    tools.find(
      (candidate): candidate is Record<string, unknown> =>
        isPlainObject(candidate) && candidate.name === tool,
    ) ?? null
  );
}
