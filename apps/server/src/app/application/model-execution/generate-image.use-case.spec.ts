import { describe, expect, test } from 'bun:test';
import type { ModelBinding } from 'harnesys';
import { generateImageBody } from '../../api/rest/model-image.schema.ts';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from '../../domain/model-execution/image.port.ts';
import { ImagePort } from '../../domain/model-execution/image.port.ts';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { GenerateImageUseCase } from './generate-image.use-case.ts';

const ORG = 'org-1';
const RESULT: ImageGenerationResult = { base64: 'abc', mimeType: 'image/png' };

function providerWith(driver: string): LlmProvider {
  return {
    id: 'provider-1',
    orgId: ORG,
    name: 'image-host',
    driver,
    apiUrl: 'https://image.example.com/v1',
    apiKey: null,
    headers: {},
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const MODEL: LlmModel = {
  id: 'model-1',
  providerId: 'provider-1',
  name: 'gpt-image-1',
  kind: 'image',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

class FakeProviders extends LlmProviderPort {
  constructor(private readonly provider: LlmProvider) {
    super();
  }

  list(): LlmProvider[] {
    return [this.provider];
  }

  findById(): LlmProvider {
    return this.provider;
  }

  findByName(): LlmProvider {
    return this.provider;
  }

  insert(): LlmProvider {
    return this.provider;
  }

  update(): LlmProvider {
    return this.provider;
  }

  delete(): void {}
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

class FakeImagePort extends ImagePort {
  lastInput: ImageGenerationInput | undefined;

  async generate(
    _binding: ModelBinding,
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    this.lastInput = input;
    return RESULT;
  }
}

function buildUseCase(driver: string) {
  const image = new FakeImagePort();
  const useCase = new GenerateImageUseCase(
    new FakeProviders(providerWith(driver)),
    new FakeModels(),
    new FakeSecrets(),
    image,
  );
  return { image, useCase };
}

describe('GenerateImageUseCase', () => {
  test('rejects a driver without image capability', async () => {
    const { image, useCase } = buildUseCase('anthropic');
    await expect(
      useCase.execute({
        orgId: ORG,
        provider: 'image-host',
        model: 'gpt-image-1',
        prompt: 'a cat',
      }),
    ).rejects.toThrow(UnsupportedCapabilityException);
    expect(image.lastInput).toBeUndefined();
  });

  test('generates an image through the image port', async () => {
    const { image, useCase } = buildUseCase('openai');
    const result = await useCase.execute({
      orgId: ORG,
      provider: 'image-host',
      model: 'gpt-image-1',
      prompt: 'a cat',
      size: '1024x1024',
    });
    expect(result).toEqual(RESULT);
    expect(image.lastInput?.prompt).toBe('a cat');
    expect(image.lastInput?.size).toBe('1024x1024');
  });

  test('body schema requires prompt', () => {
    const parsed = generateImageBody.safeParse({ provider: 'image-host', model: 'gpt-image-1' });
    expect(parsed.success).toBe(false);
  });
});
