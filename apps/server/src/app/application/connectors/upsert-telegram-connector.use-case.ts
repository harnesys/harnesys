import { Injectable, Logger } from '@harnesys/brix';
import type { UpsertTelegramConnectorResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { BOT_COMMANDS } from '../../domain/connector/bot-commands.ts';
import { telegramCapabilities } from '../../domain/connector/channel-capabilities.ts';
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
  type TelegramBotIdentity,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { connectorSecretKey, pairExpiresAtIso, pairUrlFor } from './connector.helpers.ts';
import { connectorView } from './connector-view.ts';

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
    private readonly agents: AgentRegistryPort,
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

    let me: TelegramBotIdentity;
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
      throw new ConnectorConflictException('This bot is already connected to this workspace');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const pair = createPairCode();
    const capabilities = telegramCapabilities({
      canReadAllGroupMessages: me.canReadAllGroupMessages,
      canEditMessages: true,
      streaming: true,
    });

    let connector: ConnectorRecord;

    if (existing) {
      const secretRef = connectorSecretKey(existing.id);
      await this.secrets.set(request.orgId, secretRef, token);
      const paired = this.connectors.listBindings(request.orgId, existing.id).length > 0;
      connector = this.connectors.update(request.orgId, existing.id, {
        secretRef,
        botUserId: me.id,
        botUsername: me.username,
        pairCodeHash: pair.code,
        pairCodeExpiresAt: pairExpiresAtIso(nowMs),
        capabilities,
        status: paired || existing.status === 'active' ? 'active' : 'awaiting_pair',
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        updatedAt: now,
      });
      this.connectors.ensureAgent(request.orgId, connector.id, request.agentId);
    } else {
      const connectorId = crypto.randomUUID();
      const secretRef = connectorSecretKey(connectorId);
      await this.secrets.set(request.orgId, secretRef, token);
      connector = this.connectors.insert({
        id: connectorId,
        orgId: request.orgId,
        provider: 'telegram',
        secretRef,
        status: 'awaiting_pair',
        botUserId: me.id,
        botUsername: me.username,
        pairCodeHash: pair.code,
        pairCodeExpiresAt: pairExpiresAtIso(nowMs),
        leaseOwner: null,
        leaseUntil: null,
        streamMode: null,
        capabilities,
        policy: DEFAULT_MIRROR_POLICY,
        modeOverride: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
      this.connectors.ensureAgent(request.orgId, connector.id, request.agentId);
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

    const view = connectorView({ connectors: this.connectors, agents: this.agents }, connector);
    return {
      connector: view,
      pairCode: pair.code,
      pairUrl: pairUrlFor(connector.botUsername, pair.code),
      threadId: view.threadId,
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
