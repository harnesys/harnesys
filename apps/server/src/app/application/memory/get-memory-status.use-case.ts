import { Injectable } from '@harnesys/brix';
import {
  type MemoryCrawlInfo,
  type MemoryEmbeddingPin,
  OrgMemorySettingsPort,
} from '../../domain/agent/agent-memory.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { StudioEmbeddings } from '../../infra/knowledge/embeddings.ts';
import { findDecisionModelCoords } from '../use-cases/memory/promote-triage.ts';

export interface MemoryEmbeddingStatus {
  provider: string;
  model: string;
}

export interface MemoryLastPassStatus {
  at: string;
  summary: string;
}

export interface MemoryEmbeddingsStatus {
  embeddingsAvailable: boolean;
  embedding: MemoryEmbeddingStatus | null;
  embedPinned: boolean;
  decision: MemoryEmbeddingStatus | null;
  decisionPinned: boolean;
  lastPass: MemoryLastPassStatus | null;
}

@Injectable()
export class GetMemoryStatusUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly settings: OrgMemorySettingsPort,
  ) {}

  async execute(orgId: string): Promise<MemoryEmbeddingsStatus> {
    const embedId = await this.settings.embedModelId(orgId);
    const decisionId = await this.settings.decisionModelId(orgId);
    const crawl = await this.settings.crawlInfo(orgId);
    const embedPin = this.coordsOf(orgId, embedId);
    const embeddings = new StudioEmbeddings({
      providers: this.providers,
      models: this.models,
      orgId,
      ...(embedPin === undefined ? {} : { modelRef: embedPin }),
    });
    const resolved = embeddings.resolvedModel();
    const pinnedDecision = this.coordsOf(orgId, decisionId, 'decision');
    const decision =
      pinnedDecision ??
      findDecisionModelCoords({ orgId, providers: this.providers, models: this.models });
    return {
      embeddingsAvailable: embeddings.available(),
      embedding: resolved ? toStatus(resolved) : null,
      embedPinned: embedPin !== undefined,
      decision: decision ? toStatus(decision) : null,
      decisionPinned: pinnedDecision !== undefined,
      lastPass: toLastPass(crawl),
    };
  }

  private coordsOf(
    orgId: string,
    modelId: string | undefined,
    kind?: string,
  ): MemoryEmbeddingPin | undefined {
    if (!modelId) {
      return undefined;
    }
    const model = this.models.findById(orgId, modelId);
    if (!model || (kind !== undefined && model.kind !== kind)) {
      return undefined;
    }
    const provider = this.providers.findById(orgId, model.providerId);
    return provider ? { provider: provider.name, model: model.name } : undefined;
  }
}

function toStatus(coords: MemoryEmbeddingPin): MemoryEmbeddingStatus {
  return { provider: coords.provider, model: coords.model };
}

function toLastPass(info: MemoryCrawlInfo | undefined): MemoryLastPassStatus | null {
  if (info?.lastCrawlAt === undefined || info.lastCrawlAt === null) {
    return null;
  }
  return { at: info.lastCrawlAt, summary: info.lastCrawlSummary ?? '' };
}
