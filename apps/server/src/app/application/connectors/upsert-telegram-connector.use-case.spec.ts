import { describe, expect, test } from 'bun:test';
import { ConnectorConflictException } from '../../domain/connector/connector.error.ts';
import type {
  ConnectorBindingInsert,
  ConnectorBindingRecord,
  ConnectorDeliveryInsert,
  ConnectorInboxInsert,
  ConnectorInsert,
  ConnectorPatch,
  ConnectorProvider,
  ConnectorRecord,
  ConnectorRouteInsert,
} from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  TelegramApiPort,
  type TelegramBotCommand,
  type TelegramBotIdentity,
  type TelegramFileRef,
  type TelegramSentMessage,
} from '../../domain/connector/telegram-api.port.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { ThreadInsert, ThreadPatch, ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorSecretKey } from './connector.helpers.ts';
import { UpsertTelegramConnectorUseCase } from './upsert-telegram-connector.use-case.ts';

class FakePoller extends TelegramPollerSyncPort {
  sync(): void {}
}

class FakeSecretStore extends SecretStorePort {
  readonly values = new Map<string, string>();

  get(_orgId: string, key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(_orgId: string, key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  delete(_orgId: string, key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  listKeys(_orgId: string): Promise<string[]> {
    return Promise.resolve([...this.values.keys()]);
  }
}

class FakeThreadRepo extends ThreadRepositoryPort {
  readonly rows: ThreadRecord[] = [];

  listByOrg(orgId: string): ThreadRecord[] {
    return this.rows.filter((r) => r.orgId === orgId);
  }

  listActiveRuns() {
    return [];
  }

  findActiveRun() {
    return undefined;
  }

  findById(orgId: string, id: string): ThreadRecord | undefined {
    return this.rows.find((r) => r.orgId === orgId && r.id === id);
  }

  insert(rec: ThreadInsert): ThreadRecord {
    this.rows.push(rec);
    return rec;
  }

  patch(orgId: string, id: string, patch: ThreadPatch): ThreadRecord {
    const row = this.findById(orgId, id);
    if (!row) {
      throw new Error('missing thread');
    }
    Object.assign(row, patch);
    return row;
  }

  markRead(orgId: string, id: string, at: string): ThreadRecord {
    return this.patch(orgId, id, { lastReadAt: at });
  }

  updateTitle(orgId: string, id: string, title: string): ThreadRecord {
    return this.patch(orgId, id, { title });
  }

  touch() {}

  delete(orgId: string, id: string): void {
    const i = this.rows.findIndex((r) => r.orgId === orgId && r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  deleteByAgent(orgId: string, agentId: string): void {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i];
      if (row?.orgId === orgId && row.agentId === agentId) {
        this.rows.splice(i, 1);
      }
    }
  }

  listByIssue() {
    return [];
  }

  findByIssueAndAgent() {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
}

class FakeConnectorRepo extends ConnectorRepositoryPort {
  readonly rows: ConnectorRecord[] = [];
  readonly bindings: ConnectorBindingRecord[] = [];

  listByOrg(orgId: string): ConnectorRecord[] {
    return this.rows.filter((r) => r.orgId === orgId);
  }

  findByAgentProvider(
    orgId: string,
    agentId: string,
    provider: ConnectorProvider,
  ): ConnectorRecord | undefined {
    return this.rows.find(
      (r) => r.orgId === orgId && r.agentId === agentId && r.provider === provider,
    );
  }

  findByBotUser(orgId: string, botUserId: string): ConnectorRecord | undefined {
    return this.rows.find((r) => r.orgId === orgId && r.botUserId === botUserId);
  }

  insert(rec: ConnectorInsert): ConnectorRecord {
    this.rows.push(rec);
    return rec;
  }

  update(orgId: string, id: string, patch: ConnectorPatch): ConnectorRecord {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (!row) {
      throw new Error('missing connector');
    }
    Object.assign(row, patch);
    return row;
  }

  delete(orgId: string, id: string): void {
    const i = this.rows.findIndex((r) => r.orgId === orgId && r.id === id);
    if (i >= 0) {
      this.rows.splice(i, 1);
    }
  }

  insertBinding(rec: ConnectorBindingInsert): ConnectorBindingRecord {
    this.bindings.push(rec);
    return rec;
  }

  findActiveBinding(orgId: string, connectorId: string): ConnectorBindingRecord | undefined {
    return this.bindings.find(
      (b) => b.orgId === orgId && b.connectorId === connectorId && b.status === 'active',
    );
  }

  clearBinding(orgId: string, connectorId: string, updatedAt: string): void {
    for (const b of this.bindings) {
      if (b.orgId === orgId && b.connectorId === connectorId) {
        b.status = 'unpaired';
        b.externalChatId = '';
        b.externalTopicId = null;
        b.participantPolicy = null;
        b.updatedAt = updatedAt;
      }
    }
  }

  insertRoute(_orgId: string, rec: ConnectorRouteInsert) {
    return rec;
  }

  deleteRoutesForConnector() {}

  insertInbox(_orgId: string, _rec: ConnectorInboxInsert) {
    return 'inserted' as const;
  }

  listPending() {
    return [];
  }

  markInbox() {}

  updateInbox() {}

  upsertDelivery(_orgId: string, rec: ConnectorDeliveryInsert) {
    return rec;
  }

  findDelivery() {
    return undefined;
  }

  listStreaming() {
    return [];
  }
}

class FakeTelegramApi extends TelegramApiPort {
  identity: TelegramBotIdentity = { id: '42', username: 'test_bot' };

  getMe(_token: string): Promise<TelegramBotIdentity> {
    return Promise.resolve(this.identity);
  }

  getUpdates(): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  sendMessage(): Promise<TelegramSentMessage> {
    return Promise.resolve({ messageId: '1' });
  }

  sendMessageDraft(): Promise<TelegramSentMessage> {
    return Promise.resolve({ messageId: '1' });
  }

  editMessageText(): Promise<TelegramSentMessage> {
    return Promise.resolve({ messageId: '1' });
  }

  sendChatAction(): Promise<void> {
    return Promise.resolve();
  }

  sendPhoto(): Promise<TelegramSentMessage> {
    return Promise.resolve({ messageId: '1' });
  }

  sendDocument(): Promise<TelegramSentMessage> {
    return Promise.resolve({ messageId: '1' });
  }

  answerCallbackQuery(): Promise<void> {
    return Promise.resolve();
  }

  getFile(): Promise<TelegramFileRef & { bytes: Uint8Array }> {
    return Promise.resolve({ filePath: 'x', fileSize: 0, bytes: new Uint8Array() });
  }

  setMyCommands(_token: string, _commands: TelegramBotCommand[]): Promise<void> {
    return Promise.resolve();
  }
}

describe('UpsertTelegramConnectorUseCase', () => {
  test('stores token, returns pair code without token, creates connector thread, rejects shared bot', async () => {
    const connectors = new FakeConnectorRepo();
    const secrets = new FakeSecretStore();
    const threads = new FakeThreadRepo();
    const telegram = new FakeTelegramApi();
    const useCase = new UpsertTelegramConnectorUseCase(
      connectors,
      secrets,
      threads,
      telegram,
      new FakePoller(),
      { child: () => ({ warn: () => undefined }) } as never,
    );

    const orgId = crypto.randomUUID();
    const agentA = crypto.randomUUID();
    const agentB = crypto.randomUUID();
    const token = '123:ABC';

    const result = await useCase.execute({ orgId, agentId: agentA, token });

    expect(result.pairCode.length).toBe(8);
    expect(result.pairUrl).toBe(`https://t.me/test_bot?start=${result.pairCode}`);
    expect(result).not.toHaveProperty('token');
    expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty('token');
    expect(await secrets.get(orgId, connectorSecretKey(result.connector.id))).toBe(token);

    const thread = threads.findById(orgId, result.threadId);
    expect(thread?.kind).toBe('connector');
    expect(thread?.metadata).toEqual({
      connectorId: result.connector.id,
      provider: 'telegram',
    });

    await expect(useCase.execute({ orgId, agentId: agentB, token })).rejects.toBeInstanceOf(
      ConnectorConflictException,
    );
  });
});
