import { Injectable, Logger } from '@harnesys/brix';
import type { UpsertTelegramConnectorResponse } from '@harnesys/contracts';
import { BOT_COMMANDS } from '../../domain/connector/bot-commands.ts';
import {
  ConnectorConflictException,
  ConnectorValidationException,
} from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { DEFAULT_MIRROR_POLICY } from '../../domain/connector/constants.ts';
import { createPairCode } from '../../domain/connector/pair-code.ts';
import {
  TelegramApiPort,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
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

export interface UpsertTelegramConnectorRequest {
  orgId: string;
  agentId: string;
  token: string;
}

@Injectable()
export class UpsertTelegramConnectorUseCase {
  private readonly log: Logger;

  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly threads: ThreadRepositoryPort,
    private readonly telegram: TelegramApiPort,
    private readonly poller: TelegramPollerSyncPort,
    logger: Logger,
  ) {
    this.log = logger.child('upsert-telegram-connector');
  }

  async execute(request: UpsertTelegramConnectorRequest): Promise<UpsertTelegramConnectorResponse> {
    const token = request.token.trim();
    const existing = this.connectors.findByAgentProvider(
      request.orgId,
      request.agentId,
      'telegram',
    );

    let me: { id: string; username: string };
    try {
      me = await this.telegram.getMe(token);
    } catch (err) {
      if (err instanceof TelegramUnauthorizedError || isUnauthorized(err)) {
        throw new ConnectorValidationException('Telegram rejected the bot token');
      }
      throw err;
    }

    const other = this.connectors.findByBotUser(request.orgId, me.id);
    if (other && other.id !== existing?.id) {
      throw new ConnectorConflictException('This bot is already connected to another agent');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const pair = createPairCode();
    const expiresAt = pairExpiresAtIso(nowMs);

    let connector: ConnectorRecord;
    let threadId: string;

    if (existing) {
      const secretRef = connectorSecretKey(existing.id);
      await this.secrets.set(request.orgId, secretRef, token);
      connector = this.connectors.update(request.orgId, existing.id, {
        secretRef,
        botUserId: me.id,
        botUsername: me.username,
        pairCodeHash: pair.hash,
        pairCodeExpiresAt: expiresAt,
        status: 'awaiting_pair',
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        updatedAt: now,
      });
      const thread = findConnectorThread(this.threads, request.orgId, existing.id);
      if (!thread) {
        throw new ConnectorValidationException('Connector thread is missing');
      }
      threadId = thread.id;
    } else {
      const connectorId = crypto.randomUUID();
      const secretRef = connectorSecretKey(connectorId);
      await this.secrets.set(request.orgId, secretRef, token);
      const thread = this.threads.insert({
        id: crypto.randomUUID(),
        orgId: request.orgId,
        agentId: request.agentId,
        originAgentId: request.agentId,
        title: 'Telegram',
        kind: 'connector',
        parentThreadId: null,
        forkAt: null,
        inheritedEventCount: 0,
        metadata: { connectorId, provider: 'telegram' },
        runProfileId: null,
        runDirectory: null,
        createdAt: now,
        updatedAt: now,
        lastReadAt: now,
      });
      threadId = thread.id;
      connector = this.connectors.insert({
        id: connectorId,
        orgId: request.orgId,
        agentId: request.agentId,
        provider: 'telegram',
        secretRef,
        status: 'awaiting_pair',
        botUserId: me.id,
        botUsername: me.username,
        pairCodeHash: pair.hash,
        pairCodeExpiresAt: expiresAt,
        leaseOwner: null,
        leaseUntil: null,
        streamMode: null,
        policy: DEFAULT_MIRROR_POLICY,
        modeOverride: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    this.poller.sync(request.orgId, connector.id);

    try {
      await this.telegram.setMyCommands(token, [...BOT_COMMANDS]);
    } catch (error) {
      this.log.warn(
        { err: error instanceof Error ? error.message : String(error), connectorId: connector.id },
        'setMyCommands failed',
      );
    }

    return {
      connector: toConnectorPublic(connector, threadId),
      pairCode: pair.code,
      pairUrl: pairUrlFor(connector.botUsername, pair.code),
      threadId,
    };
  }
}

function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: unknown }).statusCode === 401
  );
}
