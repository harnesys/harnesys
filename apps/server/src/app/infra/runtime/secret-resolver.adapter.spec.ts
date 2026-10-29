import { describe, expect, test } from 'bun:test';
import type { SecretResolveScope } from 'harnesys';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { agentRecord } from './prepare-org-target.fixtures.ts';
import { createSecretResolver } from './secret-resolver.adapter.ts';

const ORG = 'org-1';
const SCOPE: SecretResolveScope = { runId: 'run-1', agentId: 'agent-1' };

class FakeSecrets extends SecretStorePort {
  get(_orgId: string, key: string): Promise<string | null> {
    return Promise.resolve(key.endsWith('KEY_A') ? 'secret-a' : null);
  }

  set(): Promise<void> {
    throw new Error('not used');
  }

  delete(): Promise<void> {
    throw new Error('not used');
  }

  listKeys(): Promise<string[]> {
    throw new Error('not used');
  }
}

class FakeProviders extends LlmProviderPort {
  list(): [] {
    return [];
  }

  findById(): undefined {
    return undefined;
  }

  findByName(): undefined {
    return undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {
    throw new Error('not used');
  }
}

class FakeModels extends LlmModelPort {
  listByProvider(): [] {
    return [];
  }

  findById(): undefined {
    return undefined;
  }

  findByProviderAndName(): undefined {
    return undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {
    throw new Error('not used');
  }
}

function resolverWithSecretNames(secretNames: string[]) {
  return createSecretResolver({
    orgId: ORG,
    agent: { ...agentRecord(), secretNames },
    secrets: new FakeSecrets(),
    providers: new FakeProviders(),
    models: new FakeModels(),
  });
}

describe('createSecretResolver agent allowlist', () => {
  test('resolves only names declared on the agent', async () => {
    const resolver = resolverWithSecretNames(['KEY_A']);
    const out = await resolver.resolve(['KEY_A', 'KEY_B'], SCOPE);
    expect(out).toEqual({ KEY_A: 'secret-a' });
  });

  test('agent without secretNames resolves nothing', async () => {
    const resolver = resolverWithSecretNames([]);
    const out = await resolver.resolve(['KEY_A'], SCOPE);
    expect(out).toEqual({});
  });
});
