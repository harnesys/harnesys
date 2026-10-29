import { Injectable, Logger } from '@harnesys/brix';
import type { FireWebhookResponse } from '@harnesys/contracts';
import { webhookTaskText } from '@harnesys/studio-shared';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  WebhookNotFoundException,
  WebhookValidationException,
} from '../../domain/webhook/webhook.error.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { mechanicalRunStart } from '../threads/run-attribution.ts';
import { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';

export interface FireWebhookRequest {
  orgId: string;
  webhookId: string;
  text?: string;
}

@Injectable()
export class FireWebhookUseCase {
  private readonly log: Logger;

  constructor(
    private readonly webhooks: WebhookRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly sendThreadRun: SendThreadRunUseCase,
    private readonly executor: LocalExecutorPort,
    logger: Logger,
  ) {
    this.log = logger.child('fire-webhook');
  }

  async execute(request: FireWebhookRequest): Promise<FireWebhookResponse> {
    const webhook = this.webhooks.findById(request.orgId, request.webhookId);
    if (!webhook) {
      throw new WebhookNotFoundException(request.webhookId);
    }
    if (webhook.status === 'paused') {
      return { status: 'paused' };
    }
    if (webhook.status !== 'active') {
      return { status: 'paused' };
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    if (await lifecycle.activeByThread(webhook.threadId)) {
      return { status: 'queued-behind-active-run' };
    }
    const now = new Date().toISOString();
    this.webhooks.update(request.orgId, webhook.id, {
      lastFiredAt: now,
      updatedAt: now,
    });
    try {
      const accepted = await this.sendThreadRun.execute({
        orgId: request.orgId,
        threadId: webhook.threadId,
        body: {
          text: webhookTaskText(webhook.name, request.text ?? webhook.detail),
          mode: 'ask',
        },
        attribution: mechanicalRunStart(webhook.createdByUserId),
        trigger: { kind: 'webhook', id: webhook.id },
      });
      this.threads.touch(request.orgId, webhook.threadId);
      this.clearThreadLaunchError(request.orgId, webhook.threadId, accepted.runId);
      return { runId: accepted.runId, status: 'fired' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fire failed';
      if (
        error instanceof ThreadNotFoundException ||
        (error instanceof ThreadValidationException && error.message === 'agent has no model')
      ) {
        this.webhooks.update(request.orgId, webhook.id, {
          status: 'failed',
          updatedAt: now,
        });
      }
      this.log.warn(
        {
          orgId: request.orgId,
          webhookId: webhook.id,
          err: message,
        },
        'webhook fire failed',
      );
      this.recordThreadLaunchError(request.orgId, webhook.threadId, message);
      throw new WebhookValidationException(`webhook fire failed: ${message}`);
    }
  }

  private recordThreadLaunchError(orgId: string, threadId: string, message: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread) {
      return;
    }
    const at = new Date().toISOString();
    const runId = `launch:${threadId}:${at}`;
    this.threads.patch(orgId, threadId, {
      metadata: { ...thread.metadata, lastError: { runId, message, at } },
    });
    this.threads.touch(orgId, threadId);
    this.threadEvents.emit(orgId, { type: 'failed', threadId, runId, message, at });
  }

  private clearThreadLaunchError(orgId: string, threadId: string, runId: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread || thread.metadata.lastError === undefined) {
      return;
    }
    const { lastError: _dropped, ...metadata } = thread.metadata;
    this.threads.patch(orgId, threadId, { metadata });
    this.threadEvents.emit(orgId, { type: 'cleared', threadId, runId });
  }
}
