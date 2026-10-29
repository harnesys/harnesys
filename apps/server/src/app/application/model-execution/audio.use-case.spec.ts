import { describe, expect, test } from 'bun:test';
import type { ModelBinding } from 'harnesys';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type { SpeechSynthesisResult } from '../../domain/model-execution/speech.port.ts';
import { SpeechPort } from '../../domain/model-execution/speech.port.ts';
import type {
  TranscriptionInput,
  TranscriptionResult,
} from '../../domain/model-execution/transcription.port.ts';
import { TranscriptionPort } from '../../domain/model-execution/transcription.port.ts';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { SynthesizeSpeechUseCase } from './synthesize-speech.use-case.ts';
import { TranscribeAudioUseCase } from './transcribe-audio.use-case.ts';

const ORG = 'org-1';
const CREATED_AT = '2026-01-01T00:00:00.000Z';
const MODEL: LlmModel = {
  id: 'model-1',
  providerId: 'provider-1',
  name: 'audio-model',
  kind: 'speech',
  metadata: {},
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

class FakeProviders extends LlmProviderPort {
  constructor(private readonly driver: string) {
    super();
  }

  list(): LlmProvider[] {
    return [this.provider()];
  }

  findById(): LlmProvider {
    return this.provider();
  }

  findByName(): LlmProvider {
    return this.provider();
  }

  insert(): LlmProvider {
    return this.provider();
  }

  update(): LlmProvider {
    return this.provider();
  }

  delete(): void {}

  private provider(): LlmProvider {
    return {
      id: 'provider-1',
      orgId: ORG,
      name: 'audio-provider',
      driver: this.driver,
      apiUrl: 'https://api.example.com/v1',
      apiKey: null,
      headers: {},
      enabled: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }
}

class FakeModels extends LlmModelPort {
  listByProvider(): LlmModel[] {
    return [MODEL];
  }

  findById(): LlmModel {
    return MODEL;
  }

  findByProviderAndName(): LlmModel {
    return MODEL;
  }

  insert(_orgId: string, rec: LlmModel): LlmModel {
    return rec;
  }

  update(_orgId: string, _id: string, patch: Partial<LlmModel>): LlmModel {
    return { ...MODEL, ...patch };
  }

  delete(): void {}
}

class FakeSecrets extends SecretStorePort {
  get(): Promise<string | null> {
    return Promise.resolve(null);
  }

  set(): Promise<void> {
    return Promise.resolve();
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  listKeys(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

class FailingSpeechPort extends SpeechPort {
  synthesize(): Promise<SpeechSynthesisResult> {
    return Promise.reject(new Error('speech port must not be called'));
  }
}

class FakeTranscriptionPort extends TranscriptionPort {
  transcribe(_binding: ModelBinding, _input: TranscriptionInput): Promise<TranscriptionResult> {
    return Promise.resolve({ text: 'hi', durationInSeconds: 1 });
  }
}

describe('SynthesizeSpeechUseCase', () => {
  test('rejects speech synthesis when driver has no speech mechanism', async () => {
    const useCase = new SynthesizeSpeechUseCase(
      new FakeProviders('anthropic'),
      new FakeModels(),
      new FakeSecrets(),
      new FailingSpeechPort(),
    );
    await expect(
      useCase.execute({
        orgId: ORG,
        provider: 'audio-provider',
        model: 'audio-model',
        text: 'hello',
      }),
    ).rejects.toThrow(UnsupportedCapabilityException);
  });
});

describe('TranscribeAudioUseCase', () => {
  test('rejects transcription when driver has no transcription mechanism', async () => {
    const useCase = new TranscribeAudioUseCase(
      new FakeProviders('cerebras'),
      new FakeModels(),
      new FakeSecrets(),
      new FakeTranscriptionPort(),
    );
    await expect(
      useCase.execute({
        orgId: ORG,
        provider: 'audio-provider',
        model: 'audio-model',
        audioBase64: 'aGVsbG8=',
      }),
    ).rejects.toThrow(UnsupportedCapabilityException);
  });

  test('returns the transcription port result', async () => {
    const useCase = new TranscribeAudioUseCase(
      new FakeProviders('openai'),
      new FakeModels(),
      new FakeSecrets(),
      new FakeTranscriptionPort(),
    );
    const result = await useCase.execute({
      orgId: ORG,
      provider: 'audio-provider',
      model: 'audio-model',
      audioBase64: 'aGVsbG8=',
    });
    expect(result.text).toBe('hi');
    expect(result.durationInSeconds).toBe(1);
  });
});
