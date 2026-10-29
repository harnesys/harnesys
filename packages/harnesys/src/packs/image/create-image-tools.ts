import { attachmentToolResultOf } from '../../application/attachment-result.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ImageGenerationPort } from '../../ports/image-generation.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export interface ImageModelSelection {
  provider?: string;
  model?: string;
}

export interface CreateImageToolsParams {
  image: ImageGenerationPort;
  resolveScope: () => CapabilityScope;
  modelSelection?: ImageModelSelection;
}

async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function parseInput(input: unknown): { prompt: string; size?: string } {
  const rec = (input ?? {}) as Record<string, unknown>;
  if (typeof rec.prompt !== 'string' || rec.prompt.trim().length === 0) {
    throw new Error('prompt is required');
  }
  const size = rec.size;
  if (size !== undefined && typeof size !== 'string') {
    throw new Error('size must be a string');
  }
  return size === undefined ? { prompt: rec.prompt } : { prompt: rec.prompt, size };
}

function selectionOf(selection: ImageModelSelection | undefined): ImageModelSelection {
  const { provider, model } = selection ?? {};
  return typeof provider === 'string' &&
    provider !== '' &&
    typeof model === 'string' &&
    model !== ''
    ? { provider, model }
    : {};
}

export function createImageTools(deps: CreateImageToolsParams): ToolDefinition[] {
  return [
    tool('image_generate', {
      group: 'image',
      description:
        'Generate an image from a text prompt. Write a DETAILED ENGLISH prompt: subject, style, composition, lighting, mood. Returns a `thread:` locator (relPath) for the saved image artifact, which is also attached to the chat for the user.',
      input: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed English image prompt' },
          size: { type: 'string', description: 'Optional size as WIDTHxHEIGHT, e.g. 1024x1024' },
        },
        required: ['prompt'],
      },
      sideEffect: 'write',
      execute: (input) =>
        runGuard(async () => {
          const parsed = parseInput(input);
          const scope = deps.resolveScope();
          return attachmentToolResultOf(
            await deps.image.generate(scope, { ...parsed, ...selectionOf(deps.modelSelection) }),
          );
        }),
    }),
  ];
}
