import type { CapabilityScope } from '../domain/pack.ts';
import type { ThreadAttachmentRecord } from './thread-attachments.ts';

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  provider?: string;
  model?: string;
}

export type GeneratedImageArtifact = ThreadAttachmentRecord;

export abstract class ImageGenerationPort {
  abstract generate(
    scope: CapabilityScope,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImageArtifact>;
}
