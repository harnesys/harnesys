import { Injectable } from '@harnesys/brix';
import { helpText, type PairedCommandName } from '../../domain/connector/bot-commands.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { formatSkillList, formatThreadStats } from '../../domain/connector/thread-stats.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { CompactionNotConfiguredException } from '../../domain/thread/thread.error.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';
import { GetEffectiveSkillsUseCase } from '../skills/get-effective-skills.use-case.ts';
import { CancelRunUseCase } from '../threads/cancel-run.use-case.ts';

export interface RunTelegramCommandRequest {
  orgId: string;
  connector: ConnectorRecord;
  inboxId: string;
  chatId: string;
  threadId: string;
  name: PairedCommandName;
  activeRunId: string | null;
  activeStatus: string | null;
}

@Injectable()
export class RunTelegramCommandUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
    private readonly executor: LocalExecutorPort,
    private readonly usage: UsagePort,
    private readonly cancelRun: CancelRunUseCase,
    private readonly effectiveSkills: GetEffectiveSkillsUseCase,
    private readonly outbound: ConnectorOutboundPort,
  ) {}

  async execute(request: RunTelegramCommandRequest): Promise<void> {
    const text = await this.replyFor(request);
    await this.sendMessage(request, text);
    this.connectors.markInbox(request.orgId, request.inboxId, 'consumed');
  }

  private async replyFor(request: RunTelegramCommandRequest): Promise<string> {
    switch (request.name) {
      case 'help':
        return helpText();
      case 'stop':
        return this.stop(request);
      case 'compact':
        return this.compact(request);
      case 'stats':
        return this.stats(request);
      case 'skills':
        return this.skills(request);
    }
  }

  private async stop(request: RunTelegramCommandRequest): Promise<string> {
    if (!request.activeRunId) {
      return 'Nothing is running.';
    }
    await this.cancelRun.execute({
      orgId: request.orgId,
      threadId: request.threadId,
      runId: request.activeRunId,
    });
    await this.outbound.finalizeOpenDraft(request.connector.id, request.activeRunId);
    return 'Stopped.';
  }

  private async compact(request: RunTelegramCommandRequest): Promise<string> {
    if (request.activeRunId) {
      return 'Stop the run before compacting.';
    }
    try {
      const result = await this.executor.compact(request.orgId, request.threadId);
      return result.compacted ? 'Compacted.' : 'Nothing to compact.';
    } catch (error) {
      if (error instanceof CompactionNotConfiguredException) {
        return 'Compaction is not configured.';
      }
      throw error;
    }
  }

  private async stats(request: RunTelegramCommandRequest): Promise<string> {
    const events = await this.executor.events(request.orgId);
    const own = await events.listByThread(request.threadId);
    const runIds = [
      ...new Set(
        own.flatMap((event) =>
          event.type === 'model.usage' && typeof event.runId === 'string' ? [event.runId] : [],
        ),
      ),
    ];
    const costUsd = this.usage.sumCostUsdByRunIds(request.orgId, runIds);
    return formatThreadStats(own, request.activeStatus, costUsd);
  }

  private async skills(request: RunTelegramCommandRequest): Promise<string> {
    const effective = await this.effectiveSkills.execute({
      orgId: request.orgId,
      agentId: request.connector.agentId,
    });
    return formatSkillList(
      effective.skills.filter((skill) => skill.granted).map((skill) => skill.name),
    );
  }

  private async sendMessage(request: RunTelegramCommandRequest, text: string): Promise<void> {
    const token = await this.secrets.get(request.orgId, request.connector.secretRef);
    if (!token) {
      throw new ConnectorValidationException('Connector token is missing');
    }
    await this.telegram.sendMessage(token, request.chatId, text);
  }
}
