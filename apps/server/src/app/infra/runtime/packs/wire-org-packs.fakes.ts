import { Database } from 'bun:sqlite';
import type {
  KnowledgeIndexState,
  KnowledgeSettings,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { AgentPatch, AgentRecord } from '../../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { KnowledgeSearchPort } from '../../../domain/knowledge/knowledge-search.port.ts';
import {
  KnowledgeStorePort,
  type UpsertKnowledgeRootInput,
} from '../../../domain/knowledge/knowledge-store.port.ts';
import type {
  LlmModel,
  LlmModelInsert,
  LlmModelPatch,
  LlmProvider,
  LlmProviderInsert,
  LlmProviderPatch,
} from '../../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import type {
  ScheduleFireRecord,
  SchedulePatch,
  ScheduleRecord,
} from '../../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import type { ThreadActiveRun, ThreadPatch, ThreadRecord } from '../../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import type { WebhookPatch, WebhookRecord } from '../../../domain/webhook/webhook.ts';
import { WebhookRepositoryPort } from '../../../domain/webhook/webhook-repository.port.ts';
import { CREATE_ORG_MEMORY_SETTINGS_SQL } from '../../org-sqlite/org-sql.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import * as schema from '../../org-sqlite/schema/index.ts';

export class MemoryAgents extends AgentRegistryPort {
  rows: AgentRecord[] = [];
  list(orgId: string): AgentRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): AgentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByName(orgId: string, name: string): AgentRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.name === name);
  }
  insert(rec: AgentRecord): AgentRecord {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: AgentPatch): AgentRecord {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error(`missing agent ${id}`);
    }
    return { ...current, ...patch };
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
}

export class MemoryProviders extends LlmProviderPort {
  rows: LlmProvider[] = [];
  list(orgId: string): LlmProvider[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): LlmProvider | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByName(orgId: string, name: string): LlmProvider | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.name === name);
  }
  insert(rec: LlmProviderInsert): LlmProvider {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: LlmProviderPatch): LlmProvider {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error(`missing provider ${id}`);
    }
    return { ...current, ...patch };
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
}

export class MemoryModels extends LlmModelPort {
  rows: LlmModel[] = [];
  listByProvider(_orgId: string, providerId: string): LlmModel[] {
    return this.rows.filter((row) => row.providerId === providerId);
  }
  findById(_orgId: string, id: string): LlmModel | undefined {
    return this.rows.find((row) => row.id === id);
  }
  findByProviderAndName(_orgId: string, providerId: string, name: string): LlmModel | undefined {
    return this.rows.find((row) => row.providerId === providerId && row.name === name);
  }
  insert(_orgId: string, rec: LlmModelInsert): LlmModel {
    this.rows.push(rec);
    return rec;
  }
  update(_orgId: string, id: string, patch: LlmModelPatch): LlmModel {
    const current = this.findById(_orgId, id);
    if (!current) {
      throw new Error(`missing model ${id}`);
    }
    return { ...current, ...patch };
  }
  delete(_orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

export class MemoryThreads extends ThreadRepositoryPort {
  rows: ThreadRecord[] = [];
  listByOrg(orgId: string): ThreadRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): ThreadRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }
  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }

  findByIssueAndAgent(
    _orgId: string,
    _issueId: string,
    _agentId: string,
  ): ThreadRecord | undefined {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
  listByIssue(orgId: string, issueId: string): ThreadRecord[] {
    return this.rows.filter((row) => row.orgId === orgId && row.issueId === issueId);
  }
  insert(rec: ThreadRecord): ThreadRecord {
    this.rows.push(rec);
    return rec;
  }
  markRead(orgId: string, id: string, at: string): ThreadRecord {
    const row = this.findById(orgId, id);
    if (!row) {
      throw new Error('thread not found');
    }
    return { ...row, lastReadAt: at > row.updatedAt ? at : row.updatedAt };
  }

  patch(orgId: string, id: string, patch: ThreadPatch): ThreadRecord {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error(`missing thread ${id}`);
    }
    return { ...current, ...patch };
  }
  updateTitle(orgId: string, id: string, title: string): ThreadRecord {
    return this.patch(orgId, id, { title });
  }
  touch(): void {}
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
  deleteByAgent(orgId: string, agentId: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.agentId === agentId));
  }
}

export class MemorySchedules extends ScheduleRepositoryPort {
  rows: ScheduleRecord[] = [];
  listByOrg(orgId: string): ScheduleRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  listDue(): ScheduleRecord[] {
    return [];
  }
  findById(orgId: string, id: string): ScheduleRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByThreadId(orgId: string, threadId: string): ScheduleRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.threadId === threadId);
  }
  listFiresBySchedule(): ScheduleFireRecord[] {
    return [];
  }
  insert(rec: ScheduleRecord): ScheduleRecord {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: SchedulePatch): ScheduleRecord {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error(`missing schedule ${id}`);
    }
    return { ...current, ...patch };
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
  claimFire(): boolean {
    return true;
  }
  recordFireRun(): void {}
  releaseFire(): void {}
}

export class MemoryWebhooks extends WebhookRepositoryPort {
  rows: WebhookRecord[] = [];
  listByOrg(orgId: string): WebhookRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  findById(orgId: string, id: string): WebhookRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }
  findByThreadId(orgId: string, threadId: string): WebhookRecord | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.threadId === threadId);
  }
  insert(rec: WebhookRecord): WebhookRecord {
    this.rows.push(rec);
    return rec;
  }
  update(orgId: string, id: string, patch: WebhookPatch): WebhookRecord {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error(`missing webhook ${id}`);
    }
    return { ...current, ...patch };
  }
  delete(orgId: string, id: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.id === id));
  }
}

export class FakeSources extends SourceRegistryPort {
  list(): never[] {
    return [];
  }
  findById(): null {
    return null;
  }
  findManagedWorkspace(): null {
    return null;
  }
  insert(): void {}
  updateVisibility(): void {}
  updateName(): void {}
  updateDistribution(): void {}
  updateVcs(): void {}
  updateAvailability(): void {}
  updateLspJson(): void {}
  remove(): void {}
}

export class FakeKnowledgeSearch extends KnowledgeSearchPort {
  search(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

export class FakeKnowledgeStore extends KnowledgeStorePort {
  listRoots(): never[] {
    return [];
  }
  upsertRoot(input: UpsertKnowledgeRootInput) {
    return { sourceId: input.sourceId, path: input.path, enabled: input.enabled ?? true };
  }
  deleteRoot(): void {}
  countChunks(): number {
    return 0;
  }
  countFilesByStatus() {
    return { pending: 0, indexed: 0, skipped: 0, error: 0 };
  }
  getSettings(_orgId: string, sourceId: string): KnowledgeSettings {
    return {
      sourceId,
      entireSource: false,
      backend: 'fts',
      embedProvider: null,
      embedModel: null,
      watchEnabled: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }
  putSettings(
    orgId: string,
    sourceId: string,
    patch: UpsertKnowledgeSettingsRequest,
  ): KnowledgeSettings {
    return { ...this.getSettings(orgId, sourceId), ...patch };
  }
  listFiles(): never[] {
    return [];
  }
  getIndexState(_orgId: string, sourceId: string): KnowledgeIndexState {
    return {
      sourceId,
      status: 'idle',
      phase: null,
      processed: 0,
      total: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    };
  }
  getStats() {
    return { chunkCount: 0, filesByStatus: { pending: 0, indexed: 0, skipped: 0, error: 0 } };
  }
  readChunk() {
    return { id: 'chunk-1', text: '' };
  }
  deleteForSource(): void {}
}

export function memoryDb(): OrgSqliteDb {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_ORG_MEMORY_SETTINGS_SQL);
  return drizzle(sqlite, { schema });
}
