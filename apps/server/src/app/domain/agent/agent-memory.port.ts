import type {
  MemoryRecord,
  MemoryScopeId,
  PinRecord,
  PinUpsertInput,
  SemanticListQuery,
  SemanticUpdateInput,
  SemanticUpsertInput,
} from 'harnesys';

export abstract class AgentPinStorePort {
  abstract list(scope: MemoryScopeId): Promise<PinRecord[]>;
  abstract upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord>;
  abstract remove(scope: MemoryScopeId, key: string): Promise<void>;
}

export abstract class AgentSemanticStorePort {
  abstract list(scope: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]>;
  abstract upsert(scope: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord>;
  abstract update(scope: MemoryScopeId, input: SemanticUpdateInput): Promise<MemoryRecord>;
  abstract remove(scope: MemoryScopeId, id: string): Promise<void>;
}

export type PromotionDecision = 'approved' | 'rejected';

export interface PromotionFactRow {
  id: string;
  factId: string;
  text: string;
  createdAt: string;
}

export interface PromotionPendingInput {
  id: string;
  orgId: string;
  agentName: string;
  factId: string;
  createdAt: string;
}

export abstract class AgentPromotionStorePort {
  abstract pending(orgId: string, agentName: string): Promise<PromotionFactRow[]>;
  abstract insertPending(input: PromotionPendingInput): Promise<void>;
  abstract deletePendingByFact(orgId: string, agentName: string, factId: string): Promise<void>;
  abstract appendInstructionBlock(
    orgId: string,
    agentName: string,
    block: string,
  ): Promise<boolean>;
  abstract setStatus(
    orgId: string,
    id: string,
    status: PromotionDecision,
    decidedAt: string,
    decidedBy: string,
  ): Promise<void>;
}

export interface MemoryEmbeddingPin {
  provider: string;
  model: string;
}

export interface MemoryCrawlInfo {
  lastCrawlAt: string | null;
  lastCrawlSummary: string | null;
}

export abstract class OrgMemorySettingsPort {
  abstract embedModelId(orgId: string): Promise<string | undefined>;
  abstract setEmbedModelId(orgId: string, modelId: string | null): Promise<void>;
  abstract decisionModelId(orgId: string): Promise<string | undefined>;
  abstract setDecisionModelId(orgId: string, modelId: string | null): Promise<void>;
  abstract crawlInfo(orgId: string): Promise<MemoryCrawlInfo | undefined>;
  abstract saveCrawlInfo(orgId: string, info: MemoryCrawlInfo): Promise<void>;
}
