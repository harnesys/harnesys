import { isDriver } from 'harnesys';
import { EMBEDDING_ERROR_PREVIEW_CHARS, OLLAMA_EMBED_KEEP_ALIVE } from '../../../const.ts';
import { KnowledgeValidationException } from '../../domain/knowledge/knowledge.error.ts';
import type {
  LlmModel,
  LlmModelPort,
  LlmProvider,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import { parseVaultRef } from '../../domain/secret/vault-keys.ts';

export interface EmbeddingModelRef {
  provider: string;
  model: string;
}

export interface EmbeddingsPort {
  available(): boolean;
  resolvedModel?(): EmbeddingModelRef | undefined;
  embed(
    texts: string[],
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<number[][]>;
}

export interface StudioEmbeddingsDeps {
  providers: LlmProviderPort;
  models: LlmModelPort;
  orgId: string;
  modelRef?: EmbeddingModelRef;
  resolveApiKey?: (provider: LlmProvider) => Promise<string | undefined>;
}

interface ResolvedEmbedTarget {
  apiUrl: string;
  apiKey: string | undefined;
  headers: Record<string, string>;
  modelName: string;
}

export class StudioEmbeddings implements EmbeddingsPort {
  private modelRef: EmbeddingModelRef | undefined;

  constructor(private readonly deps: StudioEmbeddingsDeps) {
    this.modelRef = deps.modelRef;
  }

  setModelRef(modelRef: EmbeddingModelRef | undefined): void {
    this.modelRef = modelRef;
  }

  available(): boolean {
    return findEmbedProvider(this.deps, this.modelRef) !== undefined;
  }

  resolvedModel(): EmbeddingModelRef | undefined {
    const found = findEmbedProvider(this.deps, this.modelRef);
    if (!found) {
      return undefined;
    }
    return { provider: found.provider.name, model: found.model.name };
  }

  async embed(
    texts: string[],
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const target = await resolveEmbedTarget({ ...this.deps, modelRef: this.modelRef });
    if (!target) {
      throw new KnowledgeValidationException(
        'vector memory requires an embeddings model; add a model with kind "embed" or set embedding model ref',
      );
    }
    const url = `${trimTrailingSlash(target.apiUrl)}/embeddings`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...target.headers,
    };
    if (target.apiKey) {
      headers.authorization = `Bearer ${target.apiKey}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: target.modelName,
        input: texts,
        keep_alive: OLLAMA_EMBED_KEEP_ALIVE,
      }),
      signal: options?.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new KnowledgeValidationException(
        `embeddings request failed (${response.status}): ${detail.slice(0, EMBEDDING_ERROR_PREVIEW_CHARS) || response.statusText}`,
      );
    }
    const body = (await response.json()) as {
      data?: Array<{
        embedding?: number[];
        index?: number;
      }>;
    };
    const rows = body.data ?? [];
    if (rows.length !== texts.length) {
      throw new KnowledgeValidationException('embeddings response length mismatch');
    }
    const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((row, i) => {
      if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
        throw new KnowledgeValidationException(`missing embedding for input ${i}`);
      }
      return row.embedding;
    });
  }
}

function findEmbedProvider(
  deps: StudioEmbeddingsDeps,
  modelRef: EmbeddingModelRef | undefined,
): { provider: LlmProvider; model: LlmModel } | undefined {
  if (modelRef) {
    const provider = deps.providers.findByName(deps.orgId, modelRef.provider);
    if (!provider?.enabled || !isDriver(provider.driver)) {
      return undefined;
    }
    const model = deps.models.findByProviderAndName(deps.orgId, provider.id, modelRef.model);
    if (model?.kind !== 'embed') {
      return undefined;
    }
    return { provider, model };
  }
  for (const provider of deps.providers.list(deps.orgId)) {
    if (!provider.enabled || !isDriver(provider.driver)) {
      continue;
    }
    const embedModel = deps.models
      .listByProvider(deps.orgId, provider.id)
      .find((m) => m.kind === 'embed');
    if (!embedModel) {
      continue;
    }
    return { provider, model: embedModel };
  }
  return undefined;
}

async function resolveEmbedTarget(
  deps: StudioEmbeddingsDeps,
): Promise<ResolvedEmbedTarget | undefined> {
  const found = findEmbedProvider(deps, deps.modelRef);
  if (!found) {
    return undefined;
  }
  const apiKey = await resolveProviderApiKey(deps, found.provider);
  return toTarget({
    driver: found.provider.driver,
    apiUrl: found.provider.apiUrl,
    apiKey,
    headers: found.provider.headers,
    model: found.model,
  });
}

async function resolveProviderApiKey(
  deps: StudioEmbeddingsDeps,
  provider: LlmProvider,
): Promise<string | null> {
  if (deps.resolveApiKey) {
    return (await deps.resolveApiKey(provider)) ?? null;
  }
  const raw = provider.apiKey;
  if (!raw) {
    return null;
  }
  if (parseVaultRef(raw)) {
    return null;
  }
  return raw;
}

interface ToTargetInput {
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  model: LlmModel;
}

function toTarget(input: ToTargetInput): ResolvedEmbedTarget {
  const base = input.apiUrl ?? 'https://api.openai.com/v1';
  return {
    apiUrl: normalizeEmbedBase(input.driver, base),
    apiKey: input.apiKey ?? undefined,
    headers: input.headers,
    modelName: input.model.name,
  };
}

function normalizeEmbedBase(driver: string, apiUrl: string): string {
  const trimmed = trimTrailingSlash(apiUrl);
  if (driver === 'ollama' && !trimmed.endsWith('/v1')) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
