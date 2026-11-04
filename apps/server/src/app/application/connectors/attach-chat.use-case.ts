import { Injectable } from '@harnesys/brix';
import type { AttachChatBody, AttachChatResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  TelegramApiPort,
  type TelegramChatInfo,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { bindingWithThread, connectorView, requireConnector } from './connector-view.ts';

export interface AttachChatRequest {
  orgId: string;
  connectorId: string;
  body: AttachChatBody;
}

@Injectable()
export class AttachChatUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly telegram: TelegramApiPort,
  ) {}

  async execute(request: AttachChatRequest): Promise<AttachChatResponse> {
    const connector = requireConnector(this.connectors, request);
    const token = await this.secrets.get(request.orgId, connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    const topicId = request.body.topicId ?? null;
    let info: TelegramChatInfo;
    try {
      info = await this.telegram.getChat(token, request.body.chatId);
    } catch (error) {
      if (error instanceof TelegramUnauthorizedError) {
        throw new ConnectorValidationException('Telegram rejected the bot token');
      }
      throw new ConnectorValidationException(
        'Telegram could not find that chat. Use a numeric id for private chats and groups, or @username for a public one.',
      );
    }

    let binding = this.connectors.findBindingByChat(request.orgId, connector.id, info.id, topicId);
    if (!binding) {
      const now = new Date().toISOString();
      binding = this.connectors.insertBinding({
        id: crypto.randomUUID(),
        connectorId: connector.id,
        orgId: request.orgId,
        externalChatId: info.id,
        externalTopicId: topicId,
        chatType: info.type,
        title:
          request.body.title ??
          (topicId ? `Topic ${topicId}` : (info.title ?? info.username ?? info.id)),
        threadId: null,
        status: 'unpaired',
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        connector,
      ),
      binding: bindingWithThread(
        { threads: this.threads, threadAgents: this.threadAgents },
        connector,
        binding,
      ),
    };
  }
}
