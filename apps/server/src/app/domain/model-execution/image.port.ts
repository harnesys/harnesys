import type { ImageParameterCapabilities, ModelBinding } from 'harnesys';

export interface ImageGenerationInput {
  prompt: string;
  size?: string;
  negativePrompt?: string;
  seed?: number;
}

export interface ImageGenerationResult {
  base64: string;
  mimeType: string;
}

export function assertImageInputSupported(
  model: string,
  capabilities: ImageParameterCapabilities,
  input: ImageGenerationInput,
): void {
  if (
    input.size !== undefined &&
    capabilities.sizes.length > 0 &&
    !capabilities.sizes.includes(input.size)
  ) {
    throw new Error(
      `image model ${model} does not support size "${input.size}", supported sizes: ${capabilities.sizes.join(' | ')}`,
    );
  }
  if (input.negativePrompt !== undefined && !capabilities.negativePrompt) {
    throw new Error(`image model ${model} does not support negativePrompt`);
  }
  if (input.seed !== undefined && !capabilities.seed) {
    throw new Error(`image model ${model} does not support seed`);
  }
}

export abstract class ImagePort {
  abstract generate(
    binding: ModelBinding,
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult>;
}
