import { EntityNotFoundException, Injectable } from '@harnesys/brix';
import type {
  MemoryRecord,
  MemoryScopeId,
  PinRecord,
  PinUpsertInput,
  SemanticListQuery,
  SemanticUpdateInput,
  SemanticUpsertInput,
} from 'harnesys';
import type {
  PromotionDecision,
  PromotionFactRow,
  PromotionPendingInput,
} from '../../domain/agent/agent-memory.port.ts';
import {
  AgentPinStorePort,
  AgentPromotionStorePort,
  AgentSemanticStorePort,
  type MemoryCrawlInfo,
  OrgMemorySettingsPort,
} from '../../domain/agent/agent-memory.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { resolveProviderApiKey } from '../../domain/secret/provider-api-key.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { type EmbeddingModelRef, StudioEmbeddings } from '../knowledge/embeddings.ts';
import { OrgMemoryPromotionStore } from '../memory/org-memory-promotion.store.ts';
import {
  decisionModelIdOf,
  embedModelIdOf,
  memoryCrawlRecord,
  saveDecisionModelId,
  saveEmbedModelId,
  saveMemoryCrawlRecord,
} from '../memory/org-memory-settings.store.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { OrgPinPort } from '../runtime/packs/org-pin.port.ts';
import { OrgSemanticPort } from '../runtime/packs/org-semantic.port.ts';

export class AgentMemoryNotFoundException extends EntityNotFoundException {
  constructor(memoryId: string) {
    super(`Memory fact not found: ${memoryId}`, { memoryId });
  }
}

@Injectable()
export class AgentMemoryAdapter extends AgentPinStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(scope: MemoryScopeId): Promise<PinRecord[]> {
    return Promise.resolve(
      withOrgSqlite(this.layout, scope.orgId, (db) => new OrgPinPort(db).list(scope)),
    );
  }

  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord> {
    return Promise.resolve(
      withOrgSqlite(this.layout, scope.orgId, (db) => new OrgPinPort(db).upsert(scope, input)),
    );
  }

  remove(scope: MemoryScopeId, key: string): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, scope.orgId, (db) => new OrgPinPort(db).remove(scope, key)),
    );
  }
}

@Injectable()
export class AgentSemanticAdapter extends AgentSemanticStorePort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
  ) {
    super();
  }

  list(scope: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]> {
    return Promise.resolve(
      withOrgSqlite(this.layout, scope.orgId, (db) =>
        this.semanticOf(scope, db).list(scope, query),
      ),
    );
  }

  upsert(scope: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord> {
    return withOrgSqlite(this.layout, scope.orgId, (db) =>
      this.semanticOf(scope, db).upsert(scope, input),
    );
  }

  update(scope: MemoryScopeId, input: SemanticUpdateInput): Promise<MemoryRecord> {
    return withOrgSqlite(this.layout, scope.orgId, async (db) => {
      try {
        return await this.semanticOf(scope, db).update(scope, input);
      } catch {
        throw new AgentMemoryNotFoundException(input.id);
      }
    });
  }

  remove(scope: MemoryScopeId, id: string): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, scope.orgId, (db) => this.semanticOf(scope, db).remove(scope, id)),
    );
  }

  private semanticOf(scope: MemoryScopeId, db: OrgSqliteDb): OrgSemanticPort {
    const embeddings = new StudioEmbeddings({
      providers: this.providers,
      models: this.models,
      orgId: scope.orgId,
      modelRef: this.pinnedEmbeddingRef(db, scope.orgId),
      resolveApiKey: (provider) =>
        resolveProviderApiKey(this.secrets, scope.orgId, provider.id, provider.apiKey),
    });
    return new OrgSemanticPort(db, embeddings);
  }

  private pinnedEmbeddingRef(db: OrgSqliteDb, orgId: string): EmbeddingModelRef | undefined {
    const modelId = embedModelIdOf(db, orgId);
    if (!modelId) {
      return undefined;
    }
    const model = this.models.findById(orgId, modelId);
    const provider = model ? this.providers.findById(orgId, model.providerId) : undefined;
    return model && provider ? { provider: provider.name, model: model.name } : undefined;
  }
}

@Injectable()
export class AgentPromotionAdapter extends AgentPromotionStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  pending(orgId: string, agentName: string): Promise<PromotionFactRow[]> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) =>
        new OrgMemoryPromotionStore(db).pendingOf(orgId, agentName),
      ),
    );
  }

  insertPending(input: PromotionPendingInput): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, input.orgId, (db) =>
        new OrgMemoryPromotionStore(db).insertPending(input),
      ),
    );
  }

  deletePendingByFact(orgId: string, agentName: string, factId: string): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) =>
        new OrgMemoryPromotionStore(db).deletePendingByFact(orgId, agentName, factId),
      ),
    );
  }

  appendInstructionBlock(orgId: string, agentName: string, block: string): Promise<boolean> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) =>
        new OrgMemoryPromotionStore(db).appendInstructionBlock(orgId, agentName, block),
      ),
    );
  }

  setStatus(
    orgId: string,
    id: string,
    status: PromotionDecision,
    decidedAt: string,
    decidedBy: string,
  ): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) =>
        new OrgMemoryPromotionStore(db).setStatus(orgId, id, status, decidedAt, decidedBy),
      ),
    );
  }
}

@Injectable()
export class OrgMemorySettingsAdapter extends OrgMemorySettingsPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  embedModelId(orgId: string): Promise<string | undefined> {
    return Promise.resolve(withOrgSqlite(this.layout, orgId, (db) => embedModelIdOf(db, orgId)));
  }

  setEmbedModelId(orgId: string, modelId: string | null): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => saveEmbedModelId(db, orgId, modelId ?? undefined)),
    );
  }

  decisionModelId(orgId: string): Promise<string | undefined> {
    return Promise.resolve(withOrgSqlite(this.layout, orgId, (db) => decisionModelIdOf(db, orgId)));
  }

  setDecisionModelId(orgId: string, modelId: string | null): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) =>
        saveDecisionModelId(db, orgId, modelId ?? undefined),
      ),
    );
  }

  crawlInfo(orgId: string): Promise<MemoryCrawlInfo | undefined> {
    return Promise.resolve(withOrgSqlite(this.layout, orgId, (db) => memoryCrawlRecord(db, orgId)));
  }

  saveCrawlInfo(orgId: string, info: MemoryCrawlInfo): Promise<void> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => saveMemoryCrawlRecord(db, orgId, info)),
    );
  }
}
