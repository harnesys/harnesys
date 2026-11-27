import { attachmentToolResultOf } from '../../application/attachment-result.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ImageGenerationPort, ImageGenerationRequest } from '../../ports/image-generation.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type ImageModelSelection = Pick<ImageGenerationRequest, 'provider' | 'model'>;

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
  const supportedSizes = deps.image.supportedSizes(
    deps.resolveScope(),
    selectionOf(deps.modelSelection),
  );
  const sizeDescription =
    supportedSizes === undefined || supportedSizes.length === 0
      ? 'Optional size as WIDTHxHEIGHT, e.g. 1024x1024 (provider-dependent; the error lists supported values)'
      : `Optional size, one of: ${supportedSizes.join(' | ')}`;
  return [
    tool('image_generate', {
      group: 'image',
      description:
        'Generate an image from a text prompt. Write a DETAILED ENGLISH prompt: subject, style, composition, lighting, mood. Returns the absolute path of the saved image artifact, which is also attached to the chat for the user.',
      input: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed English image prompt' },
          size: { type: 'string', description: sizeDescription },
        },
        required: ['prompt'],
      },
      sideEffect: 'write',
      execute: (input, ctx) =>
        runGuard(async () => {
          const parsed = parseInput(input);
          const scope = deps.resolveScope();
          return attachmentToolResultOf(
            await deps.image.generate(scope, { ...parsed, ...selectionOf(deps.modelSelection) }),
            { threadDir: ctx.paths.threadDir, runRoot: ctx.cwd },
          );
        }),
    }),
  ];
}
