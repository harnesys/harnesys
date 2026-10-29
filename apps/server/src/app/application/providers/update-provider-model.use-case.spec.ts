import { describe, expect, test } from 'bun:test';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { UpdateProviderModelUseCase } from './update-provider-model.use-case.ts';

const ORG = 'org-1';
const PROVIDER: LlmProvider = {
  id: 'provider-1',
  orgId: ORG,
  name: 'openrouter',
  driver: 'openrouter',
  apiUrl: null,
  apiKey: null,
  headers: {},
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const MODEL: LlmModel = {
  id: 'model-1',
  providerId: PROVIDER.id,
  name: 'vendor/model',
  kind: 'embed',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

class FakeProviders extends LlmProviderPort {
  list(): LlmProvider[] {
    return [PROVIDER];
  }

  findById(): LlmProvider {
    return PROVIDER;
  }

  findByName(): LlmProvider {
    return PROVIDER;
  }

  insert(): LlmProvider {
    return PROVIDER;
  }

  update(): LlmProvider {
    return PROVIDER;
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

describe('UpdateProviderModelUseCase', () => {
  test('rejects patching kind to an unsupported value', () => {
    const useCase = new UpdateProviderModelUseCase(new FakeProviders(), new FakeModels());
    expect(() =>
      useCase.execute({ orgId: ORG, providerId: PROVIDER.id, modelId: MODEL.id, kind: 'rerank' }),
    ).toThrow(ProviderValidationException);
  });

  test('patches kind between supported values', () => {
    const useCase = new UpdateProviderModelUseCase(new FakeProviders(), new FakeModels());
    const updated = useCase.execute({
      orgId: ORG,
      providerId: PROVIDER.id,
      modelId: MODEL.id,
      kind: 'decision',
    });
    expect(updated.kind).toBe('decision');
  });
});
