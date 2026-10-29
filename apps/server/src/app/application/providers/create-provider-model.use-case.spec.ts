import { describe, expect, test } from 'bun:test';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { CreateProviderModelUseCase } from './create-provider-model.use-case.ts';

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
  inserted: LlmModel | undefined;

  listByProvider(): LlmModel[] {
    return [];
  }

  findById(): undefined {
    return undefined;
  }

  findByProviderAndName(): undefined {
    return undefined;
  }

  insert(_orgId: string, rec: LlmModel): LlmModel {
    this.inserted = rec;
    return rec;
  }

  update(_orgId: string, _id: string, patch: Partial<LlmModel>): LlmModel {
    return {
      id: 'model-1',
      providerId: PROVIDER.id,
      name: 'vendor/model',
      kind: 'chat',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...patch,
    };
  }

  delete(): void {}
}

describe('CreateProviderModelUseCase', () => {
  test('rejects attaching a model with an unsupported kind', () => {
    const useCase = new CreateProviderModelUseCase(new FakeProviders(), new FakeModels());
    for (const kind of ['audio', 'rerank', 'video']) {
      expect(() =>
        useCase.execute({ orgId: ORG, providerId: PROVIDER.id, name: 'm', kind }),
      ).toThrow(ProviderValidationException);
    }
  });

  test('attaches supported kinds and defaults to chat', () => {
    const models = new FakeModels();
    const useCase = new CreateProviderModelUseCase(new FakeProviders(), models);
    const embedded = useCase.execute({
      orgId: ORG,
      providerId: PROVIDER.id,
      name: 'vendor/embed',
      kind: 'embed',
    });
    expect(embedded.kind).toBe('embed');
    const decision = useCase.execute({
      orgId: ORG,
      providerId: PROVIDER.id,
      name: 'vendor/decision',
      kind: 'decision',
    });
    expect(decision.kind).toBe('decision');
    const chat = useCase.execute({ orgId: ORG, providerId: PROVIDER.id, name: 'vendor/chat' });
    expect(chat.kind).toBe('chat');
    expect(models.inserted?.kind).toBe('chat');
  });
});
