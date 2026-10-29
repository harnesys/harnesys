import { Injectable } from '@harnesys/brix';
import { driverMechanism } from 'harnesys';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type {
  SpeechSynthesisInput,
  SpeechSynthesisResult,
} from '../../domain/model-execution/speech.port.ts';
import { SpeechPort } from '../../domain/model-execution/speech.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { createOrgModelsPort } from '../../infra/runtime/org-models.port.ts';

export interface SynthesizeSpeechRequest extends SpeechSynthesisInput {
  orgId: string;
  provider: string;
  model: string;
}

@Injectable()
export class SynthesizeSpeechUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly speech: SpeechPort,
  ) {}

  async execute(request: SynthesizeSpeechRequest): Promise<SpeechSynthesisResult> {
    const binding = await createOrgModelsPort(
      request.orgId,
      this.providers,
      this.models,
      this.secrets,
    ).get(request.provider, request.model);
    if (driverMechanism(binding.driver, 'speech') === 'none') {
      throw new UnsupportedCapabilityException('speech', binding.driver);
    }
    return this.speech.synthesize(binding, { text: request.text, voice: request.voice });
  }
}
