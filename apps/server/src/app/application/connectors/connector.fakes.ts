import type {
  ConnectorBindingRecord,
  ConnectorDeliveryInsert,
  ConnectorDeliveryRecord,
  ConnectorInboxInsert,
  ConnectorInboxRecord,
  ConnectorInboxStatus,
  ConnectorInsert,
  ConnectorPatch,
  ConnectorRecord,
  InsertInboxResult,
} from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';

export function memoryConnector(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'conn-1',
    orgId: 'org-1',
    provider: 'telegram',
    secretRef: 'connector.conn-1.token',
    status: 'active',
    botUserId: 'bot-1',
    botUsername: 'coder_bot',
    pairCodeHash: null,
    pairCodeExpiresAt: null,
    leaseOwner: null,
    leaseUntil: null,
    capabilities: {
      canReadUnmentioned: true,
      supportsTopics: true,
      supportsReplyTargets: true,
      canEditMessages: true,
      maxMessageLength: 4096,
      streaming: true,
    },
    policy: {
      text: true,
      ask: true,
      failures: true,
      files: true,
      appUserEcho: true,
      tool: false,
      spawn: false,
      reasoning: false,
      coalesceMs: 250,
    },
    modeOverride: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function memoryBinding(
  overrides: Partial<ConnectorBindingRecord> & Pick<ConnectorBindingRecord, 'id'>,
): ConnectorBindingRecord {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    connectorId: 'conn-1',
    orgId: 'org-1',
    externalChatId: `chat-${overrides.id}`,
    externalTopicId: null,
    chatType: 'private',
    title: null,
    threadId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export class MemoryConnectors extends ConnectorRepositoryPort {
  readonly replaced: Array<{ connectorId: string; agentIds: string[] }> = [];

  constructor(
    readonly connector?: ConnectorRecord,
    readonly bindings: ConnectorBindingRecord[] = [],
  ) {
    super();
  }

  listByOrg(orgId: string): ConnectorRecord[] {
    return this.connector && this.connector.orgId === orgId ? [this.connector] : [];
  }

  findById(orgId: string, id: string): ConnectorRecord | undefined {
    return this.connector && this.connector.orgId === orgId && this.connector.id === id
      ? this.connector
      : undefined;
  }

  findByAgentProvider(): ConnectorRecord | undefined {
    return undefined;
  }

  findByBotUser(): ConnectorRecord | undefined {
    return undefined;
  }

  insert(rec: ConnectorInsert): ConnectorRecord {
    return rec;
  }

  update(_orgId: string, _id: string, _patch: ConnectorPatch): ConnectorRecord {
    return this.connector ?? memoryConnector();
  }

  delete(): void {}

  listAgentIds(): string[] {
    return [];
  }

  ensureAgent(): void {}

  removeAgent(): void {}

  replaceAgents(_orgId: string, connectorId: string, agentIds: string[]): void {
    this.replaced.push({ connectorId, agentIds: [...agentIds] });
  }

  insertBinding(rec: ConnectorBindingRecord): ConnectorBindingRecord {
    this.bindings.push(rec);
    return rec;
  }

  findActiveBinding(): ConnectorBindingRecord | undefined {
    return this.bindings[0];
  }

  findBinding(_orgId: string, _connectorId: string, id: string): ConnectorBindingRecord {
    const row = this.bindings.find((binding) => binding.id === id);
    if (!row) {
      throw new Error(`binding not found: ${id}`);
    }
    return row;
  }

  findBindingByChat(
    _orgId: string,
    _connectorId: string,
    externalChatId: string,
    externalTopicId: string | null,
  ): ConnectorBindingRecord | undefined {
    return this.bindings.find(
      (binding) =>
        binding.externalChatId === externalChatId && binding.externalTopicId === externalTopicId,
    );
  }

  findBindingForThread(
    _orgId: string,
    _connectorId: string,
    threadId: string,
  ): ConnectorBindingRecord | undefined {
    return this.bindings.find((binding) => binding.threadId === threadId);
  }

  listBindings(): ConnectorBindingRecord[] {
    return this.bindings;
  }

  listBindingsByThread(_orgId: string, threadId: string): ConnectorBindingRecord[] {
    return this.bindings.filter((row) => row.threadId === threadId);
  }

  updateBindingTitle(_orgId: string, bindingId: string, title: string, updatedAt: string): void {
    const row = this.bindings.find((binding) => binding.id === bindingId);
    if (row) {
      row.title = title;
      row.updatedAt = updatedAt;
    }
  }

  deleteBinding(_orgId: string, bindingId: string): void {
    const index = this.bindings.findIndex((binding) => binding.id === bindingId);
    if (index >= 0) {
      this.bindings.splice(index, 1);
    }
  }

  attachBindingThread(
    _orgId: string,
    bindingId: string,
    threadId: string,
    updatedAt: string,
  ): ConnectorBindingRecord {
    const row = this.findBinding('', '', bindingId);
    row.threadId = threadId;
    row.updatedAt = updatedAt;
    return row;
  }

  detachBinding(_orgId: string, bindingId: string, updatedAt: string): void {
    const row = this.bindings.find((binding) => binding.id === bindingId);
    if (row) {
      row.threadId = null;
      row.status = 'unpaired';
      row.updatedAt = updatedAt;
    }
  }

  clearBindings(_orgId: string, connectorId: string): void {
    for (let index = this.bindings.length - 1; index >= 0; index -= 1) {
      if (this.bindings[index]?.connectorId === connectorId) {
        this.bindings.splice(index, 1);
      }
    }
  }

  insertInbox(_orgId: string, _rec: ConnectorInboxInsert): InsertInboxResult {
    return 'inserted';
  }

  markInbox(_orgId: string, _id: string, _status: ConnectorInboxStatus): void {}

  listRecentInbox(): ConnectorInboxRecord[] {
    return [];
  }

  upsertDelivery(_orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord {
    return rec;
  }

  findDelivery(): ConnectorDeliveryRecord | undefined {
    return undefined;
  }

  findDeliveryByMessage(): ConnectorDeliveryRecord | undefined {
    return undefined;
  }

  listStreaming(): ConnectorDeliveryRecord[] {
    return [];
  }
}

export { FakeSecrets, FakeTelegram } from './telegram.fakes.ts';
