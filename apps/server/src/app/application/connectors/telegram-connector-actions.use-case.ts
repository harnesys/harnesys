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
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorSecretKey, pairExpiresAtIso, pairUrlFor } from './connector.helpers.ts';
import { connectorView, requireConnector } from './connector-view.ts';
import { syncConnectorAgents } from './sync-connector-agents.ts';

export interface TelegramConnectorRequest {
  orgId: string;
  connectorId: string;
}

interface ViewDeps {
  agents: AgentRegistryPort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
}

@Injectable()
export class IssuePairCodeUseCase {
  constructor(private readonly connectors: ConnectorRepositoryPort) {}

  execute(request: TelegramConnectorRequest): IssuePairCodeResponse {
    const connector = requireConnector(this.connectors, request);
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
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorRequest): TelegramConnectorActionResponse {
    const connector = requireConnector(this.connectors, request);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: 'paused',
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
    this.poller.sync(request.orgId, connector.id);
    return { connector: this.view(updated) };
  }

  private view(connector: Parameters<typeof connectorView>[1]) {
    return connectorView(
      {
        connectors: this.connectors,
        agents: this.agents,
        threads: this.threads,
        threadAgents: this.threadAgents,
      },
      connector,
    );
  }
}

@Injectable()
export class ResumeTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorRequest): TelegramConnectorActionResponse {
    const connector = requireConnector(this.connectors, request);
    const bindings = this.connectors.listBindings(request.orgId, connector.id);
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: bindings.length > 0 ? 'active' : 'awaiting_pair',
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        updated,
      ),
    };
  }
}

@Injectable()
export class UnpairTelegramConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  execute(request: TelegramConnectorRequest): UnpairTelegramConnectorResponse {
    const connector = requireConnector(this.connectors, request);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const pair = createPairCode();
    const bindings = this.connectors.listBindings(request.orgId, connector.id);
    const privateBindings = bindings.filter((binding) => binding.chatType === 'private');
    for (const binding of privateBindings) {
      this.connectors.detachBinding(request.orgId, binding.id, now);
    }
    syncConnectorAgents(
      { connectors: this.connectors, threadAgents: this.threadAgents },
      request.orgId,
      connector.id,
    );
    const hasGroupBindings = bindings.some((binding) => binding.chatType !== 'private');
    const updated = this.connectors.update(request.orgId, connector.id, {
      status: hasGroupBindings ? 'active' : 'awaiting_pair',
      pairCodeHash: pair.hash,
      pairCodeExpiresAt: pairExpiresAtIso(nowMs),
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: now,
    });
    this.poller.sync(request.orgId, connector.id);
    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        updated,
      ),
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
    private readonly poller: TelegramPollerSyncPort,
  ) {}

  async execute(request: TelegramConnectorRequest): Promise<void> {
    const connector = requireConnector(this.connectors, request);
    await this.secrets.delete(request.orgId, connectorSecretKey(connector.id));
    this.connectors.delete(request.orgId, connector.id);
    this.poller.sync(request.orgId, connector.id);
  }
}

@Injectable()
export class PatchTelegramPolicyUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  execute(
    request: TelegramConnectorRequest & { body: PatchTelegramPolicyBody },
  ): TelegramConnectorActionResponse {
    const connector = requireConnector(this.connectors, request);
    const updated = this.connectors.update(request.orgId, connector.id, {
      policy: parseMirrorPatch(request.body),
      updatedAt: new Date().toISOString(),
    });
    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        updated,
      ),
    };
  }
}

export type { ViewDeps };
