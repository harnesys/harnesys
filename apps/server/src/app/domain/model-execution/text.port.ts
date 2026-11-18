import type { ModelBinding } from 'harnesys';

export interface TextGenerationInput {
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface TextGenerationResult {
  text: string;
}

export abstract class TextGenerationPort {
  abstract generate(
    binding: ModelBinding,
    input: TextGenerationInput,
  ): Promise<TextGenerationResult>;
}
