import type { ModelBinding } from 'harnesys';

export interface SpeechSynthesisInput {
  text: string;
  voice?: string;
}

export interface SpeechSynthesisResult {
  audio: Uint8Array;
  mimeType: string;
}

export abstract class SpeechPort {
  abstract synthesize(
    binding: ModelBinding,
    input: SpeechSynthesisInput,
  ): Promise<SpeechSynthesisResult>;
}
