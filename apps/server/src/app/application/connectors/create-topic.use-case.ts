import { Injectable } from '@harnesys/brix';
import type { CreateTopicBody, CreateTopicResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { isGroupChat } from '../../domain/connector/channel-capabilities.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  type TelegramApiPort,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { bindingWithThread, connectorView, requireConnector } from './connector-view.ts';

export interface CreateTopicRequest {
  orgId: string;
  connectorId: string;
  bindingId: string;
  body: CreateTopicBody;
}

const ADMIN_STATUSES = new Set(['administrator', 'creator']);

@Injectable()
export class CreateTopicUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly telegram: TelegramApiPort,
  ) {}

  async execute(request: CreateTopicRequest): Promise<CreateTopicResponse> {
    const connector = requireConnector(this.connectors, request);
    const binding = this.connectors.findBinding(request.orgId, connector.id, request.bindingId);
    if (!isGroupChat(binding.chatType) || binding.chatType === 'channel') {
      throw new ConnectorValidationException('Topics exist only in Telegram groups');
    }
    if (binding.externalTopicId !== null) {
      throw new ConnectorValidationException('Open the group, not a topic, to create a topic');
    }
    const token = await this.secrets.get(request.orgId, connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    await this.assertCanManageTopics(connector.botUserId, token, binding.externalChatId);
    try {
      const topic = await this.telegram.createForumTopic(
        token,
        binding.externalChatId,
        request.body.name,
      );
      const now = new Date().toISOString();
      const created = this.connectors.insertBinding({
        id: crypto.randomUUID(),
        connectorId: connector.id,
        orgId: request.orgId,
        externalChatId: binding.externalChatId,
        externalTopicId: topic.topicId,
        chatType: binding.chatType,
        title: request.body.name,
        threadId: null,
        status: 'unpaired',
        createdAt: now,
        updatedAt: now,
      });
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
          created,
        ),
      };
    } catch (error) {
      if (error instanceof TelegramUnauthorizedError) {
        throw new ConnectorValidationException('Telegram rejected the bot token');
      }
      throw new ConnectorValidationException(
        'Telegram could not create the topic. Enable Topics in the group and make the bot an admin with Manage Topics.',
      );
    }
  }

  private async assertCanManageTopics(
    botUserId: string,
    token: string,
    chatId: string,
  ): Promise<void> {
    const member = await this.telegram.getChatMember(token, chatId, botUserId);
    if (member && (member.canManageTopics || ADMIN_STATUSES.has(member.status))) {
      return;
    }
    throw new ConnectorValidationException(
      'Make the bot a group admin with Manage Topics to create topics',
    );
  }
}
