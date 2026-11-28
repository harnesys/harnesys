import { attachmentToolResultOf } from '../../application/attachment-result.ts';
import type { ImageParameterCapabilities } from '../../domain/driver-capabilities.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ImageGenerationPort, ImageGenerationRequest } from '../../ports/image-generation.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type ImageModelSelection = Pick<ImageGenerationRequest, 'provider' | 'model'>;

export interface CreateImageToolsParams {
  image: ImageGenerationPort;
  resolveScope: () => CapabilityScope;
  modelSelection?: ImageModelSelection;
}

interface ParsedImageInput {
  prompt: string;
  size?: string;
  negativePrompt?: string;
  seed?: number;
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

function parseInput(input: unknown): ParsedImageInput {
  const rec = (input ?? {}) as Record<string, unknown>;
  if (typeof rec.prompt !== 'string' || rec.prompt.trim().length === 0) {
    throw new Error('prompt is required');
  }
  const size = rec.size;
  if (size !== undefined && typeof size !== 'string') {
    throw new Error('size must be a string');
  }
  const negativePrompt = rec.negativePrompt;
  if (negativePrompt !== undefined && typeof negativePrompt !== 'string') {
    throw new Error('negativePrompt must be a string');
  }
  const seed = rec.seed;
  if (seed !== undefined && (typeof seed !== 'number' || !Number.isInteger(seed))) {
    throw new Error('seed must be an integer');
  }
  return {
    prompt: rec.prompt,
    ...(size === undefined ? {} : { size }),
    ...(negativePrompt === undefined ? {} : { negativePrompt }),
    ...(seed === undefined ? {} : { seed }),
  };
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

function sizeErrorHint(
  err: string,
  size: string | undefined,
  supportedSizes: readonly string[],
): string {
  if (size === undefined || !/\bsize\b/i.test(err)) {
    return err;
  }
  const known = supportedSizes.length > 0;
  return `${err}; size "${size}" was rejected by the provider${
    known ? `; supported sizes: ${supportedSizes.join(' | ')}` : ''
  } — omit size entirely to use the model default`;
}

function endpointErrorHint(err: string): string {
  if (!/no endpoint|not found for model|unsupported model|404/i.test(err)) {
    return err;
  }
  return `${err} — the configured image model cannot serve image requests; switch the Image model in this agent's Image pack settings, or attach a provider model of kind Image on the Models page, then retry`;
}

export function createImageTools(deps: CreateImageToolsParams): ToolDefinition[] {
  const capabilities: ImageParameterCapabilities = deps.image.capabilities(
    deps.resolveScope(),
    selectionOf(deps.modelSelection),
  );
  const known = capabilities.sizes.length > 0;
  const sizeDescription = known
    ? `Optional size, one of: ${capabilities.sizes.join(' | ')}`
    : 'Optional size as WIDTHxHEIGHT, e.g. 1024x1024 (provider-dependent; an unsupported size fails with the provider error — omit it to use the model default)';
  return [
    tool('image_generate', {
      group: 'image',
      description:
        'Generate an image from a text prompt. Write a DETAILED ENGLISH prompt: subject, style, composition, lighting, mood. Returns the absolute path of the saved image artifact, which is also attached to the chat for the user.',
      input: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed English image prompt' },
          size: {
            type: 'string',
            ...(known ? { enum: [...capabilities.sizes] } : {}),
            description: sizeDescription,
          },
          ...(capabilities.negativePrompt
            ? {
                negativePrompt: {
                  type: 'string',
                  description: 'Optional negative prompt: content to avoid in the image',
                },
              }
            : {}),
          ...(capabilities.seed
            ? {
                seed: {
                  type: 'integer',
                  description: 'Optional random seed (0..2147483647) for reproducible results',
                },
              }
            : {}),
        },
        required: ['prompt'],
      },
      sideEffect: 'write',
      execute: (input, ctx) =>
        runGuard(async () => {
          const parsed = parseInput(input);
          const scope = deps.resolveScope();
          const generated = await deps.image
            .generate(scope, { ...parsed, ...selectionOf(deps.modelSelection) })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(
                endpointErrorHint(sizeErrorHint(message, parsed.size, capabilities.sizes)),
              );
            });
          return attachmentToolResultOf(generated, {
            threadDir: ctx.paths.threadDir,
            runRoot: ctx.cwd,
          });
        }),
    }),
  ];
}
