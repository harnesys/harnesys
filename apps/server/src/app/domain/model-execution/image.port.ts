import type { ModelBinding } from 'harnesys';

export interface ImageGenerationInput {
  prompt: string;
  size?: string;
}

export interface ImageGenerationResult {
  base64: string;
  mimeType: string;
}

export abstract class ImagePort {
  abstract generate(
    binding: ModelBinding,
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult>;
}
