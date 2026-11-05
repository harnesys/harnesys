import { Injectable } from '@harnesys/brix';
import type { RefreshChatIssue, RefreshChatsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorBindingRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  TelegramApiPort,
  type TelegramChatInfo,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorView, requireConnector } from './connector-view.ts';

export interface RefreshChatsRequest {
  orgId: string;
  connectorId: string;
}

@Injectable()
export class RefreshChatsUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  async execute(request: RefreshChatsRequest): Promise<RefreshChatsResponse> {
    const connector = requireConnector(this.connectors, request);
    const token = await this.secrets.get(request.orgId, connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    const issues: RefreshChatIssue[] = [];
    const bindings = this.connectors.listBindings(request.orgId, connector.id);
    for (const binding of bindings) {
      const issue = await this.refreshBinding(request.orgId, token, binding);
      if (issue !== null) {
        issues.push(issue);
      }
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
      issues,
    };
  }

  private async refreshBinding(
    orgId: string,
    token: string,
    binding: ConnectorBindingRecord,
  ): Promise<RefreshChatIssue | null> {
    if (binding.externalChatId.length === 0) {
      return null;
    }
    let info: TelegramChatInfo;
    try {
      info = await this.telegram.getChat(token, binding.externalChatId);
    } catch (error) {
      return { bindingId: binding.id, message: issueMessage(error) };
    }
    const title = titleOf(binding, info);
    if (title === null) {
      return null;
    }
    this.connectors.updateBindingTitle(orgId, binding.id, title, new Date().toISOString());
    return null;
  }
}

function titleOf(binding: ConnectorBindingRecord, info: TelegramChatInfo): string | null {
  if (binding.externalTopicId !== null && binding.externalTopicId.length > 0) {
    return null;
  }
  const title = info.title ?? info.username;
  return title !== null && title.length > 0 && title !== binding.title ? title : null;
}

function issueMessage(error: unknown): string {
  if (error instanceof TelegramUnauthorizedError) {
    return 'Telegram rejected the bot token';
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Telegram did not return this chat';
}
