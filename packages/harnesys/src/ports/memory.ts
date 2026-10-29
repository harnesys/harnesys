export interface MemoryScopeId {
  orgId: string;
  agentName: string;
  threadId?: string;
}
export type PinSource = 'agent' | 'human';
export interface PinRecord {
  key: string;
  text: string;
  updatedAt: string;
  source: PinSource;
}
export interface PinUpsertInput {
  key: string;
  text: string;
  source: PinSource;
}
export interface PinPort {
  list(scope: MemoryScopeId): Promise<PinRecord[]>;
  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord>;
  remove(scope: MemoryScopeId, key: string): Promise<void>;
  projectForWindow(scope: MemoryScopeId, budgetTokens: number): Promise<string>;
}
export type SemanticScope = 'session' | 'long';
export type MemoryRecordSource = 'agent' | 'human' | 'compaction';
export interface MemoryRecord {
  id: string;
  scope: SemanticScope;
  text: string;
  key?: string;
  createdAt: string;
  updatedAt: string;
  source: MemoryRecordSource;
  threadId?: string;
  accessCount?: number;
  lastAccessedAt?: string | null;
}
export interface SemanticListQuery {
  scope?: SemanticScope;
  limit?: number;
}
export interface SemanticProjectInput {
  scopes: SemanticScope[];
  limit: number;
  budgetTokens: number;
}
export interface SemanticProjectQueryInput {
  query: string;
  scopes: SemanticScope[];
  topK: number;
  budgetTokens: number;
  clipChars: number;
  halfLifeDays: number;
}
export interface SemanticUpsertInput {
  scope: SemanticScope;
  text: string;
  key?: string;
  threadId?: string;
  source: MemoryRecordSource;
}
export interface SemanticUpdateInput {
  id: string;
  text: string;
}
export interface SemanticMemoryPort {
  list(scopeId: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]>;
  upsert(scopeId: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord>;
  update(scopeId: MemoryScopeId, input: SemanticUpdateInput): Promise<MemoryRecord>;
  remove(scopeId: MemoryScopeId, id: string): Promise<void>;
  projectForWindow?(scopeId: MemoryScopeId, input: SemanticProjectInput): Promise<string>;
  projectForQuery?(scopeId: MemoryScopeId, input: SemanticProjectQueryInput): Promise<string>;
}
export interface EpisodicHit {
  threadId: string;
  entryId?: string;
  seq?: number;
  text: string;
  score?: number;
}
export interface EpisodicIndexInput {
  orgId: string;
  threadId: string;
  fromSeq: number;
  toSeq: number;
  compactionEntryId?: string;
}
export interface EpisodicSearchInput {
  orgId: string;
  query: string;
  threadId?: string;
  agentId?: string;
  limit?: number;
}
export interface EpisodicPort {
  index?(input: EpisodicIndexInput): Promise<void>;
  search(input: EpisodicSearchInput): Promise<EpisodicHit[]>;
}
export interface KnowledgeHit {
  id: string;
  title?: string;
  text: string;
  uri?: string;
  score?: number;
}
export interface KnowledgeSearchInput {
  sourceId: string;
  query: string;
  limit?: number;
}
export interface KnowledgeReadInput {
  sourceId: string;
  id: string;
}
export interface KnowledgeReadResult {
  id: string;
  text: string;
  uri?: string;
}
export interface KnowledgeReindexInput {
  sourceId: string;
}
export interface KnowledgePort {
  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]>;
  read?(input: KnowledgeReadInput): Promise<KnowledgeReadResult>;
  reindex?(input: KnowledgeReindexInput): Promise<void>;
}
