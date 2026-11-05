import { Injectable } from '@harnesys/brix';
import type { ConnectChatBody, ConnectChatResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  ConnectorConflictException,
  ConnectorPromotionRequiredException,
  ConnectorValidationException,
} from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  TelegramApiPort,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { threadKindOfChat } from '../../domain/connector/thread-kind.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { bindingWithThread, connectorView, requireConnector } from './connector-view.ts';
import { createThreadForChat } from './create-thread-for-chat.ts';
import { assertUniqueMentionNames } from './mention-names.ts';
import { syncConnectorAgents } from './sync-connector-agents.ts';

export interface ConnectChatRequest {
  orgId: string;
  connectorId: string;
  bindingId: string;
  body: ConnectChatBody;
}

const ADMIN_STATUSES = new Set(['administrator', 'creator']);

@Injectable()
export class ConnectChatUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly telegram: TelegramApiPort,
  ) {}

  async execute(request: ConnectChatRequest): Promise<ConnectChatResponse> {
    const connector = requireConnector(this.connectors, request);
    const binding = this.connectors.findBinding(request.orgId, connector.id, request.bindingId);
    if (binding.threadId !== null) {
      throw new ConnectorConflictException('This chat is already connected. Disconnect it first.');
    }
    const targetKind = threadKindOfChat(binding.chatType);
    if (targetKind === 'group') {
      await this.assertBotCanPost(connector, binding.externalChatId, binding.chatType);
    }

    if (request.body.mode === 'existing') {
      this.attachExistingThread(connector, binding.id, targetKind, request.body);
    } else {
      this.createThread(connector, binding.id, targetKind, request.body);
    }
    const connected = this.markActive(connector);

    syncConnectorAgents(
      { connectors: this.connectors, threadAgents: this.threadAgents },
      request.orgId,
      connector.id,
    );

    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        connected,
      ),
      binding: bindingWithThread(
        { threads: this.threads, threadAgents: this.threadAgents },
        connector,
        this.connectors.findBinding(request.orgId, connector.id, binding.id),
      ),
    };
  }

  private markActive(connector: ConnectorRecord): ConnectorRecord {
    if (connector.status !== 'awaiting_pair') {
      return connector;
    }
    return this.connectors.update(connector.orgId, connector.id, {
      status: 'active',
      updatedAt: new Date().toISOString(),
    });
  }

  private attachExistingThread(
    connector: ConnectorRecord,
    bindingId: string,
    targetKind: 'chat' | 'group',
    body: Extract<ConnectChatBody, { mode: 'existing' }>,
  ): void {
    const thread = this.threads.findById(connector.orgId, body.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(body.threadId);
    }
    const agentIds = this.threadAgents
      .listByThread(connector.orgId, thread.id)
      .map((row) => row.agentId);
    assertUniqueMentionNames(this.agentNames(connector.orgId, agentIds));
    this.assertThreadMatchesKind(thread, targetKind, agentIds, body.allowPromote === true);
    const existing = this.connectors.findBindingForThread(connector.orgId, connector.id, thread.id);
    if (existing && existing.id !== bindingId) {
      throw new ConnectorConflictException(
        'This thread is already connected to another chat of this bot',
      );
    }
    this.connectors.attachBindingThread(
      connector.orgId,
      bindingId,
      thread.id,
      new Date().toISOString(),
    );
  }

  private createThread(
    connector: ConnectorRecord,
    bindingId: string,
    targetKind: 'chat' | 'group',
    body: Extract<ConnectChatBody, { mode: 'new' }>,
  ): void {
    const agentIds = [...new Set(body.agentIds)];
    const named = this.agentNames(connector.orgId, agentIds);
    if (
      named.some(
        (agent) => agent.name === agent.id && !this.agents.findById(connector.orgId, agent.id),
      )
    ) {
      throw new ConnectorValidationException('Agent not found');
    }
    assertUniqueMentionNames(named);
    if (targetKind === 'chat' && agentIds.length !== 1) {
      throw new ConnectorValidationException(
        'A direct message connects to a chat thread with exactly one agent',
      );
    }
    if (targetKind === 'group' && agentIds.length > 8) {
      throw new ConnectorValidationException('A thread can hold at most 8 agents');
    }
    const binding = this.connectors.findBinding(connector.orgId, connector.id, bindingId);
    if (binding.chatType === 'channel' && body.autoReplyAgentId) {
      throw new ConnectorValidationException(
        'Channels are mention-only: a channel post cannot trigger an automatic reply',
      );
    }
    const autoReplyAgentId = resolveAutoReply(
      targetKind,
      binding.chatType,
      agentIds[0] ?? null,
      body.autoReplyAgentId ?? null,
    );
    if (autoReplyAgentId !== null && !agentIds.includes(autoReplyAgentId)) {
      throw new ConnectorValidationException('The auto-reply agent must belong to this thread');
    }
    createThreadForChat(
      {
        connectors: this.connectors,
        threads: this.threads,
        threadAgents: this.threadAgents,
      },
      {
        orgId: connector.orgId,
        connector,
        binding,
        kind: targetKind,
        agentIds,
        autoReplyAgentId,
        ...(body.title ? { title: body.title } : {}),
      },
    );
  }

  private assertThreadMatchesKind(
    thread: ThreadRecord,
    targetKind: 'chat' | 'group',
    agentIds: string[],
    allowPromote: boolean,
  ): void {
    if (targetKind === 'chat') {
      if (thread.kind !== 'chat') {
        throw new ConnectorValidationException('A direct message must connect to a chat thread');
      }
      if (agentIds.length !== 1) {
        throw new ConnectorValidationException('A chat thread must have exactly one agent');
      }
      return;
    }
    if (thread.kind === 'chat') {
      if (!allowPromote) {
        throw new ConnectorPromotionRequiredException();
      }
      this.threads.patch(thread.orgId, thread.id, { kind: 'group' });
      return;
    }
    if (thread.kind !== 'group') {
      throw new ConnectorValidationException('A group or topic must connect to a group thread');
    }
  }

  private agentNames(orgId: string, agentIds: string[]): Array<{ id: string; name: string }> {
    return agentIds.map((agentId) => ({
      id: agentId,
      name: this.agents.findById(orgId, agentId)?.name ?? agentId,
    }));
  }

  private async assertBotCanPost(
    connector: ConnectorRecord,
    chatId: string,
    chatType: string,
  ): Promise<void> {
    const token = await this.secrets.get(connector.orgId, connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    try {
      const me = await this.telegram.getMe(token);
      if (chatType !== 'channel' && me.canReadAllGroupMessages) {
        return;
      }
    } catch (error) {
      if (error instanceof TelegramUnauthorizedError) {
        throw new ConnectorValidationException('Telegram rejected the bot token');
      }
      throw error;
    }
    const member = await this.telegram.getChatMember(token, chatId, connector.botUserId);
    if (member && ADMIN_STATUSES.has(member.status)) {
      return;
    }
    throw new ConnectorValidationException(
      chatType === 'channel'
        ? 'Make the bot an admin of the channel so it can post there.'
        : 'Make the bot a group admin or disable privacy mode in BotFather (/setprivacy).',
    );
  }
}

function resolveAutoReply(
  targetKind: 'chat' | 'group',
  chatType: string,
  firstAgentId: string | null,
  requestedAgentId: string | null,
): string | null {
  if (targetKind === 'chat') {
    return firstAgentId;
  }
  if (chatType === 'channel') {
    return null;
  }
  return requestedAgentId;
}
