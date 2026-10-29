import type { ModelBinding } from 'harnesys';

export interface TranscriptionInput {
  audioBase64: string;
  mimeType?: string;
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

export abstract class TranscriptionPort {
  abstract transcribe(
    binding: ModelBinding,
    input: TranscriptionInput,
  ): Promise<TranscriptionResult>;
}
