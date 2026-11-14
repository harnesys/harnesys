import { Inject, Injectable, Logger } from '@harnesys/brix';
import { RespondRunUseCase } from '../../../application/threads/respond-run.use-case.ts';
import type { AddonCallOptions } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import type { AddonTransportBindingRow } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import type { TransportAskReply } from '../../../domain/addons/transport-session.ts';
import { ApprovalStorePort } from '../../../domain/approval/approval-store.port.ts';
import { optionByLabel, optionIndexFrom } from './transport-session.draft.ts';
import { TransportSessionDrafts } from './transport-session.drafts.ts';

const CALL_TIMEOUT_MS = 30_000;
const PENDING_APPROVAL_LIMIT = 200;

@Injectable()
export class TransportSessionAsk {
  private readonly logger: Logger;

  constructor(
    private readonly drafts: TransportSessionDrafts,
    private readonly repo: AddonTransportSessionRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly approvals: ApprovalStorePort,
    private readonly respond: RespondRunUseCase,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-transport-ask');
  }

  async park(
    orgId: string,
    bindings: readonly AddonTransportBindingRow[],
    runId: string,
  ): Promise<void> {
    const approval = this.approvals
      .list(orgId)
      .filter((record) => record.runId === runId && record.status === 'pending')
      .slice(0, PENDING_APPROVAL_LIMIT)[0];
    if (approval === undefined) {
      return;
    }
    const options = [...new Set(approval.options)];
    const text = askText(approval.question, options);
    for (const binding of bindings) {
      const session = await this.drafts.ensure(orgId, binding, runId);
      await this.drafts.flush(orgId, session);
      await this.drafts.setTyping(orgId, session, false);
      try {
        const sent = await this.calls.transportSend(
          orgId,
          binding.addonId,
          {
            channel: binding.externalChatId,
            text,
            options: options.map((option, index) => ({
              id: option,
              label: `${index + 1}. ${option}`,
            })),
          },
          { timeoutMs: CALL_TIMEOUT_MS } satisfies AddonCallOptions,
        );
        if (sent.messageId !== undefined) {
          this.repo.rememberOutbound(orgId, binding.addonId, sent.messageId);
        }
      } catch (error) {
        this.logger.warn(
          {
            orgId,
            addonId: binding.addonId,
            error: error instanceof Error ? error.message : String(error),
          },
          'transport ask delivery failed',
        );
      }
      session.row.status = 'parked';
      session.row.askId = approval.interruptId;
      session.row.askOptionsJson = JSON.stringify(options);
      session.row.updatedAt = new Date().toISOString();
      this.repo.patch(orgId, binding.threadId, runId, binding.addonId, {
        status: 'parked',
        askId: approval.interruptId,
        askOptionsJson: session.row.askOptionsJson,
        updatedAt: session.row.updatedAt,
      });
    }
  }

  async tryAnswer(reply: TransportAskReply): Promise<boolean> {
    const row = this.repo.findParked(reply.orgId, reply.addonId, reply.channel);
    if (row === null || row.askId === null) {
      return false;
    }
    const options = parseOptions(row.askOptionsJson);
    const index = optionIndexFrom(reply.text, options.length) ?? optionByLabel(reply.text, options);
    if (index === null) {
      return false;
    }
    const option = options[index];
    if (option === undefined) {
      return false;
    }
    try {
      await this.respond.execute({
        orgId: row.orgId,
        threadId: row.threadId,
        runId: row.runId,
        body: { askId: row.askId, payload: payloadFor(option) },
      });
    } catch (error) {
      this.logger.warn(
        {
          orgId: row.orgId,
          runId: row.runId,
          error: error instanceof Error ? error.message : String(error),
        },
        'transport ask answer failed',
      );
      return false;
    }
    this.repo.patch(row.orgId, row.threadId, row.runId, row.addonId, {
      status: 'streaming',
      askId: null,
      askOptionsJson: null,
      updatedAt: new Date().toISOString(),
    });
    const live = this.drafts.peek(row.orgId, row.threadId, row.runId, row.addonId);
    if (live !== undefined) {
      live.row.status = 'streaming';
      live.row.askId = null;
      live.row.askOptionsJson = null;
    }
    this.logger.info(
      { orgId: row.orgId, runId: row.runId, addonId: row.addonId, option },
      'transport ask answered',
    );
    return true;
  }
}

function parseOptions(json: string | null): string[] {
  if (json === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function payloadFor(option: string): Record<string, unknown> {
  if (option === 'approve' || option === 'approve_once') {
    return { approved: true };
  }
  if (option === 'block_path') {
    return { approved: false, blockPath: true };
  }
  return { approved: false };
}

function askText(question: string, options: readonly string[]): string {
  if (options.length === 0) {
    return question;
  }
  const list = options.map((option, index) => `${index + 1}. ${option}`).join('\n');
  return `${question}\n\n${list}`;
}
