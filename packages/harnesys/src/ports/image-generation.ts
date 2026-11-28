import type { ImageParameterCapabilities } from '../domain/driver-capabilities.ts';
import type { CapabilityScope } from '../domain/pack.ts';
import type { ThreadAttachmentRecord } from './thread-attachments.ts';

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  negativePrompt?: string;
  seed?: number;
  provider?: string;
  model?: string;
}

export type GeneratedImageArtifact = ThreadAttachmentRecord;

export abstract class ImageGenerationPort {
  abstract generate(
    scope: CapabilityScope,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImageArtifact>;

  abstract capabilities(
    scope: CapabilityScope,
    selection?: Pick<ImageGenerationRequest, 'provider' | 'model'>,
  ): ImageParameterCapabilities;
}
