import { Injectable } from '@harnesys/brix';
import { driverMechanism } from 'harnesys';
import type { ImageGenerationResult } from '../../domain/model-execution/image.port.ts';
import { ImagePort } from '../../domain/model-execution/image.port.ts';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { createOrgModelsPort } from '../../infra/runtime/org-models.port.ts';

export interface GenerateImageInput {
  orgId: string;
  provider: string;
  model: string;
  prompt: string;
  size?: string;
}

@Injectable()
export class GenerateImageUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly image: ImagePort,
  ) {}

  async execute(input: GenerateImageInput): Promise<ImageGenerationResult> {
    const binding = await createOrgModelsPort(
      input.orgId,
      this.providers,
      this.models,
      this.secrets,
    ).get(input.provider, input.model);
    if (driverMechanism(binding.driver, 'image') === 'none') {
      throw new UnsupportedCapabilityException('image', binding.driver);
    }
    return this.image.generate(binding, { prompt: input.prompt, size: input.size });
  }
}
