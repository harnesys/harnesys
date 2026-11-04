import { Injectable } from '@harnesys/brix';
import type {
  ConnectConnectorBindingBody,
  TelegramConnectorActionResponse,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { isGroupChat } from '../../domain/connector/channel-capabilities.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorView, requireTelegramConnector } from './connector-view.ts';
import { openConnectorThread } from './open-connector-thread.ts';

export interface ConnectConnectorBindingRequest {
  orgId: string;
  agentId: string;
  bindingId: string;
  body: ConnectConnectorBindingBody;
}

const ADMIN_STATUSES = new Set(['administrator', 'creator']);

@Injectable()
export class ConnectConnectorBindingUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly telegram: TelegramApiPort,
  ) {}

  async execute(request: ConnectConnectorBindingRequest): Promise<TelegramConnectorActionResponse> {
    const connector = requireTelegramConnector(this.connectors, request);
    const binding = this.connectors.findBinding(request.orgId, connector.id, request.bindingId);
    if (binding.threadId === null) {
      const agentIds = this.connectors.listAgentIds(request.orgId, connector.id);
      if (agentIds.length === 0) {
        throw new ConnectorValidationException('Assign at least one agent to this bot first');
      }
      const autoReplyAgentId =
        request.body.autoReplyAgentId !== undefined
          ? request.body.autoReplyAgentId
          : (agentIds[0] ?? null);
      if (autoReplyAgentId !== null && !agentIds.includes(autoReplyAgentId)) {
        throw new ConnectorValidationException('The auto-reply agent must serve this bot');
      }
      if (isGroupChat(binding.chatType) && autoReplyAgentId !== null) {
        await this.assertBotIsAdmin(connector, binding.externalChatId);
      }
      openConnectorThread(
        {
          connectors: this.connectors,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        {
          orgId: request.orgId,
          connector,
          binding,
          autoReplyAgentId,
          ...(request.body.title ? { title: request.body.title } : {}),
        },
      );
    }
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, connector),
    };
  }

  private async assertBotIsAdmin(connector: ConnectorRecord, chatId: string): Promise<void> {
    const token = await this.secrets.get(connector.orgId, connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    const member = await this.telegram.getChatMember(token, chatId, connector.botUserId);
    if (!member || !ADMIN_STATUSES.has(member.status)) {
      throw new ConnectorValidationException(
        'Make this bot a group admin so it can read every message, or connect without auto-reply',
      );
    }
  }
}
