import { Injectable } from '@harnesys/brix';
import type {
  IssuePairCodeResponse,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { parseMirrorPatch } from '../../domain/connector/mirror-policy.ts';
import { createPairCode } from '../../domain/connector/pair-code.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { connectorSecretKey, pairExpiresAtIso, pairUrlFor } from './connector.helpers.ts';
import { connectorView, requireTelegramConnector } from './connector-view.ts';

export interface TelegramConnectorAgentRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class IssuePairCodeUseCase {
  constructor(private readonly connectors: ConnectorRepositoryPort) {}

  execute(request: TelegramConnectorAgentRequest): IssuePairCodeResponse {
    const connector = requireTelegramConnector(this.connectors, request);
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
    private readonly agents: AgentRegistryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: 'paused',
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, updated),
    };
  }
}

@Injectable()
export class ResumeTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const bindings = this.connectors.listBindings(request.orgId, connector.id);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: bindings.length > 0 ? 'active' : 'awaiting_pair',
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, updated),
    };
  }
}

@Injectable()
export class UnpairTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorAgentRequest): UnpairTelegramConnectorResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const nowMs = Date.now();
    const pair = createPairCode();
    this.connectors.clearBindings(request.orgId, connector.id);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: 'awaiting_pair',
      pairCodeHash: pair.hash,
      pairCodeExpiresAt: pairExpiresAtIso(nowMs),
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: new Date(nowMs).toISOString(),
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, updated),
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
  ) {}

  async execute(request: TelegramConnectorAgentRequest): Promise<void> {
    const connector = requireTelegramConnector(this.connectors, request);
    await this.secrets.delete(request.orgId, connectorSecretKey(connector.id));
    this.connectors.delete(request.orgId, connector.id);
  }
}

@Injectable()
export class PatchTelegramPolicyUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(
    request: TelegramConnectorAgentRequest & { body: PatchTelegramPolicyBody },
  ): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const updated = this.connectors.update(request.orgId, connector.id, {
      policy: parseMirrorPatch(request.body),
      updatedAt: new Date().toISOString(),
    });
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, updated),
    };
  }
}
