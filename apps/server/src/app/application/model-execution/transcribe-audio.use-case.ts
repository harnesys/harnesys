import { Injectable } from '@harnesys/brix';
import { driverMechanism } from 'harnesys';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type {
  TranscriptionInput,
  TranscriptionResult,
} from '../../domain/model-execution/transcription.port.ts';
import { TranscriptionPort } from '../../domain/model-execution/transcription.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { createOrgModelsPort } from '../../infra/runtime/org-models.port.ts';

export interface TranscribeAudioRequest extends TranscriptionInput {
  orgId: string;
  provider: string;
  model: string;
}

@Injectable()
export class TranscribeAudioUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly transcription: TranscriptionPort,
  ) {}

  async execute(request: TranscribeAudioRequest): Promise<TranscriptionResult> {
    const binding = await createOrgModelsPort(
      request.orgId,
      this.providers,
      this.models,
      this.secrets,
    ).get(request.provider, request.model);
    if (driverMechanism(binding.driver, 'transcription') === 'none') {
      throw new UnsupportedCapabilityException('transcription', binding.driver);
    }
    return this.transcription.transcribe(binding, {
      audioBase64: request.audioBase64,
      mimeType: request.mimeType,
    });
  }
}
