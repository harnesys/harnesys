import { Injectable } from '@harnesys/brix';
import type {
  IssuePairCodeResponse,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
} from '@harnesys/contracts';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { parseMirrorPatch } from '../../domain/connector/mirror-policy.ts';
import { createPairCode } from '../../domain/connector/pair-code.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  connectorSecretKey,
  findConnectorThread,
  pairExpiresAtIso,
  pairUrlFor,
  toConnectorPublic,
} from './connector.helpers.ts';

export interface TelegramConnectorAgentRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class IssuePairCodeUseCase {
  constructor(private readonly connectors: ConnectorRepositoryPort) {}

  execute(request: TelegramConnectorAgentRequest): IssuePairCodeResponse {
    const connector = requireTelegram(this.connectors, request);
    const nowMs = Date.now();
    const pair = createPairCode();
    const updated = this.connectors.update(request.orgId, connector.id, {
      pairCodeHash: pair.hash,
      pairCodeExpiresAt: pairExpiresAtIso(nowMs),
      updatedAt: new Date(nowMs).toISOString(),
    });
    return {
      pairCode: pair.code,
      pairUrl: pairUrlFor(updated.botUsername, pair.code),
    };
  }
}

@Injectable()
export class PauseTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegram(this.connectors, request);
    const now = new Date().toISOString();
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: 'paused',
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: now,
    });
    this.poller.sync(request.orgId, connector.id);
    return { connector: toConnectorPublic(updated, requireThreadId(this.threads, updated)) };
  }
}

@Injectable()
export class ResumeTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegram(this.connectors, request);
    const now = new Date().toISOString();
    const active = this.connectors.findActiveBinding(request.orgId, connector.id);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: active ? 'active' : 'awaiting_pair',
      lastError: null,
      updatedAt: now,
    });
    this.poller.sync(request.orgId, connector.id);
    return { connector: toConnectorPublic(updated, requireThreadId(this.threads, updated)) };
  }
}

@Injectable()
export class UnpairTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): UnpairTelegramConnectorResponse {
    const connector = requireTelegram(this.connectors, request);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const pair = createPairCode();
    this.connectors.clearBinding(request.orgId, connector.id, now);
    this.connectors.deleteRoutesForConnector(request.orgId, connector.id);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: 'awaiting_pair',
      pairCodeHash: pair.hash,
      pairCodeExpiresAt: pairExpiresAtIso(nowMs),
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: now,
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: toConnectorPublic(updated, requireThreadId(this.threads, updated)),
      pairCode: pair.code,
      pairUrl: pairUrlFor(updated.botUsername, pair.code),
    };
  }
}

@Injectable()
export class RemoveTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly threads: ThreadRepositoryPort,
  ) {}

  async execute(request: TelegramConnectorAgentRequest): Promise<void> {
    const connector = requireTelegram(this.connectors, request);
    const thread = findConnectorThread(this.threads, request.orgId, connector.id);
    await this.secrets.delete(request.orgId, connectorSecretKey(connector.id));
    this.connectors.delete(request.orgId, connector.id);
    if (thread?.kind === 'connector') {
      this.threads.patch(request.orgId, thread.id, { kind: 'chat' });
    }
  }
}

@Injectable()
export class PatchTelegramPolicyUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
  ) {}

  execute(
    request: TelegramConnectorAgentRequest & { body: PatchTelegramPolicyBody },
  ): TelegramConnectorActionResponse {
    const connector = requireTelegram(this.connectors, request);
    const policy = parseMirrorPatch(request.body);
    const updated = this.connectors.update(request.orgId, connector.id, {
      policy,
      updatedAt: new Date().toISOString(),
    });
    return { connector: toConnectorPublic(updated, requireThreadId(this.threads, updated)) };
  }
}

function requireTelegram(
  connectors: ConnectorRepositoryPort,
  request: TelegramConnectorAgentRequest,
): ConnectorRecord {
  const found = connectors.findByAgentProvider(request.orgId, request.agentId, 'telegram');
  if (!found) {
    throw new ConnectorNotFoundException(`telegram:${request.agentId}`);
  }
  return found;
}

function requireThreadId(threads: ThreadRepositoryPort, connector: ConnectorRecord): string {
  const thread = findConnectorThread(threads, connector.orgId, connector.id);
  if (!thread) {
    throw new ConnectorNotFoundException(connector.id);
  }
  return thread.id;
}
