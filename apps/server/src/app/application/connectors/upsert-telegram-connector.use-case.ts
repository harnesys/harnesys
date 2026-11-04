import { Injectable, Logger } from '@harnesys/brix';
import type { UpsertTelegramConnectorResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { BOT_COMMANDS } from '../../domain/connector/bot-commands.ts';
import {
  type ChannelCapabilities,
  telegramCapabilities,
} from '../../domain/connector/channel-capabilities.ts';
import {
  ConnectorConflictException,
  ConnectorNotFoundException,
  ConnectorValidationException,
} from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord, ConnectorStatus } from '../../domain/connector/connector.ts';
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
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorSecretKey, pairExpiresAtIso, pairUrlFor } from './connector.helpers.ts';
import { connectorView } from './connector-view.ts';

export interface UpsertTelegramConnectorRequest {
  orgId: string;
  connectorId?: string;
  token: string;
}

type PairCode = ReturnType<typeof createPairCode>;

@Injectable()
export class UpsertTelegramConnectorUseCase {
  private readonly log: Logger;

  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly telegram: TelegramApiPort,
    private readonly poller: TelegramPollerSyncPort,
    logger: Logger,
  ) {
    this.log = logger.child('upsert-telegram-connector');
  }

  async execute(request: UpsertTelegramConnectorRequest): Promise<UpsertTelegramConnectorResponse> {
    const token = request.token.trim();
    const existing = request.connectorId
      ? this.requireExisting(request.orgId, request.connectorId)
      : undefined;
    const me = await this.identify(token);

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
    const connector = await this.persist({
      request,
      existing,
      me,
      pair,
      capabilities,
      nowMs,
      now,
      token,
    });

    await this.secrets.set(request.orgId, connector.secretRef, token);
    this.poller.sync(request.orgId, connector.id);
    await this.registerCommands(token, connector.id);

    const view = connectorView(
      {
        connectors: this.connectors,
        agents: this.agents,
        threads: this.threads,
        threadAgents: this.threadAgents,
      },
      connector,
    );
    return {
      connector: view,
      pairCode: pair.code,
      pairUrl: pairUrlFor(connector.botUsername, pair.code),
    };
  }

  private async identify(token: string): Promise<TelegramBotIdentity> {
    try {
      return await this.telegram.getMe(token);
    } catch (err) {
      if (err instanceof TelegramUnauthorizedError || isUnauthorized(err)) {
        throw new ConnectorValidationException('Telegram rejected the bot token');
      }
      throw err;
    }
  }

  private async persist(input: {
    request: UpsertTelegramConnectorRequest;
    existing: ConnectorRecord | undefined;
    me: TelegramBotIdentity;
    pair: PairCode;
    capabilities: ChannelCapabilities;
    nowMs: number;
    now: string;
    token: string;
  }): Promise<ConnectorRecord> {
    const { request, existing, me, pair, capabilities, nowMs, now, token } = input;
    if (existing) {
      const bindings = this.connectors.listBindings(request.orgId, existing.id);
      return this.connectors.update(request.orgId, existing.id, {
        secretRef: existing.secretRef,
        botUserId: me.id,
        botUsername: me.username,
        pairCodeHash: pair.hash,
        pairCodeExpiresAt: pairExpiresAtIso(nowMs),
        capabilities,
        status: connectorStatus(existing.status, bindings.length),
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        updatedAt: now,
      });
    }
    const connectorId = crypto.randomUUID();
    const secretRef = connectorSecretKey(connectorId);
    await this.secrets.set(request.orgId, secretRef, token);
    return this.connectors.insert({
      id: connectorId,
      orgId: request.orgId,
      provider: 'telegram',
      secretRef,
      status: 'awaiting_pair',
      botUserId: me.id,
      botUsername: me.username,
      pairCodeHash: pair.hash,
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
  }

  private async registerCommands(token: string, connectorId: string): Promise<void> {
    try {
      await this.telegram.setMyCommands(token, [...BOT_COMMANDS]);
    } catch (error) {
      this.log.warn(
        { err: error instanceof Error ? error.message : String(error), connectorId },
        'setMyCommands failed',
      );
    }
  }

  private requireExisting(orgId: string, connectorId: string): ConnectorRecord {
    const found = this.connectors.findById(orgId, connectorId);
    if (found?.provider !== 'telegram') {
      throw new ConnectorNotFoundException(connectorId);
    }
    return found;
  }
}

function connectorStatus(status: ConnectorStatus, bindingCount: number): ConnectorStatus {
  if (status === 'paused') {
    return 'paused';
  }
  return bindingCount > 0 ? 'active' : 'awaiting_pair';
}

function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: unknown }).statusCode === 401
  );
}
