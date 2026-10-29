import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { type ProjectionPlan, planProjection } from '../../domain/connector/project-event.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  appendDraftText,
  type DraftSendDeps,
  type DraftSendState,
  draftStateFromConnector,
  finalizeDraftText,
  maybeFlushDraft,
  sendThinkingDraft,
} from './project-connector-draft.ts';
import {
  sendAskMessage,
  sendFileMessage,
  sendStatusMessage,
  toProjectEvent,
} from './project-connector-send.ts';

interface RouteContext {
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
}

@Injectable()
export class ProjectConnectorEventsUseCase
  extends ConnectorOutboundPort
  implements ModuleInitHook, ModuleDestroyHook
{
  private readonly log: Logger;
  private readonly sessions = new Map<string, DraftSendState>();
  private readonly inflight = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
    private readonly executor: LocalExecutorPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadEvents: ThreadEventsPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('connector-project');
  }

  onModuleInit(): void {
    this.unsubscribe = this.threadEvents.subscribe((orgId, event) => {
      if (event.type !== 'cleared') {
        return;
      }

      // so no sqlite access is allowed here (a nested connection would
      // self-deadlock on the open write tx until busy_timeout).
      const { threadId, runId } = event;
      queueMicrotask(() => this.maybeProjectRun(orgId, threadId, runId));
    });
  }

  private maybeProjectRun(orgId: string, threadId: string, runId: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (thread?.kind !== 'connector') {
      return;
    }
    void this.projectRun(orgId, threadId, runId);
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async projectRun(orgId: string, threadId: string, runId: string): Promise<void> {
    const key = `${orgId}:${runId}`;
    if (this.inflight.has(key)) {
      return;
    }
    const route = this.routeForThread(orgId, threadId);
    if (!route) {
      return;
    }
    if (route.connector.status === 'paused' || route.connector.status === 'awaiting_pair') {
      return;
    }
    const token = await this.secrets.get(orgId, route.connector.secretRef);
    if (!token) {
      return;
    }
    this.inflight.add(key);
    const state = draftStateFromConnector(route.connector, {
      orgId,
      bindingId: route.binding.id,
      threadId,
      runId,
      chatId: route.binding.externalChatId,
      token,
    });
    this.sessions.set(`${route.connector.id}:${runId}`, state);
    const draftTick = setInterval(() => {
      void maybeFlushDraft(this.draftDeps(), state);
    }, 100);
    try {
      const stream = await this.executor.stream(orgId, runId, 0);
      for await (const event of stream) {
        const live = this.connectors.listByOrg(orgId).find((row) => row.id === route.connector.id);
        if (!live || live.status === 'paused' || live.status === 'awaiting_pair') {
          return;
        }
        state.coalesceMs = live.policy.coalesceMs;
        state.streamMode = live.streamMode ?? state.streamMode;
        await this.handleEvent(live, state, event);
      }
    } catch (error) {
      this.log.warn(
        { orgId, threadId, runId, err: error instanceof Error ? error.message : String(error) },
        'connector project failed',
      );
    } finally {
      clearInterval(draftTick);
      this.inflight.delete(key);
      this.sessions.delete(`${route.connector.id}:${runId}`);
    }
  }

  async resumeStreaming(orgId: string, connectorId: string): Promise<void> {
    const connector = this.connectors.listByOrg(orgId).find((row) => row.id === connectorId);
    if (!connector) {
      return;
    }
    const binding = this.connectors.findActiveBinding(orgId, connectorId);
    if (!binding) {
      return;
    }
    const token = await this.secrets.get(orgId, connector.secretRef);
    if (!token) {
      return;
    }
    const lifecycle = await this.executor.lifecycle(orgId);
    for (const delivery of this.connectors.listStreaming(orgId, connectorId)) {
      const rec = await lifecycle.get(delivery.runId);
      const running =
        rec !== null &&
        (rec.status === 'running' ||
          rec.status === 'queued' ||
          rec.status === 'waiting' ||
          rec.status === 'needs_input');
      if (running) {
        void this.projectRun(orgId, delivery.threadId, delivery.runId);
        continue;
      }
      if (delivery.lastText) {
        await this.telegram.sendMessage(token, binding.externalChatId, delivery.lastText);
      }
      this.connectors.upsertDelivery(orgId, {
        ...delivery,
        status: 'final',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async finalizeOpenDraft(connectorId: string, runId: string): Promise<void> {
    const state = this.sessions.get(`${connectorId}:${runId}`);
    if (!state) {
      return;
    }
    await finalizeDraftText(this.draftDeps(), state);
  }

  private async handleEvent(
    connector: ConnectorRecord,
    state: DraftSendState,
    event: SessionEvent,
  ): Promise<void> {
    if (event.type === 'run.started') {
      await sendThinkingDraft(this.draftDeps(), state);
      return;
    }
    const plan = planProjection(
      connector.policy,
      toProjectEvent(event, connector.id),
      state.deliveryId ? { lastText: state.pending || state.lastSent } : null,
    );
    await this.applyPlan(state, event, plan);
  }

  private async applyPlan(
    state: DraftSendState,
    event: SessionEvent,
    plan: ProjectionPlan,
  ): Promise<void> {
    const send = { connectors: this.connectors, telegram: this.telegram };
    switch (plan.type) {
      case 'skip':
        return;
      case 'draft':
        await appendDraftText(this.draftDeps(), state, plan.text);
        return;
      case 'finalize-text':
        await finalizeDraftText(this.draftDeps(), state, plan.text || undefined);
        return;
      case 'echo':
        await this.telegram.sendMessage(state.token, state.chatId, plan.text);
        return;
      case 'ask':
        await finalizeDraftText(this.draftDeps(), state);
        await sendAskMessage(send, state, plan);
        return;
      case 'failed':
        await finalizeDraftText(this.draftDeps(), state);
        await sendStatusMessage(send, state, 'status:failed', plan.text);
        return;
      case 'file':
        await finalizeDraftText(this.draftDeps(), state);
        await sendFileMessage(send, state, event);
        return;
      default: {
        const _exhaustive: never = plan;
        return _exhaustive;
      }
    }
  }

  private routeForThread(orgId: string, threadId: string): RouteContext | null {
    for (const connector of this.connectors.listByOrg(orgId)) {
      const binding = this.connectors.findActiveBinding(orgId, connector.id);
      if (binding?.threadId === threadId) {
        return { connector, binding };
      }
    }
    return null;
  }

  private draftDeps(): DraftSendDeps {
    return {
      connectors: this.connectors,
      telegram: this.telegram,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      updateStreamMode: (orgId, connectorId, mode) => {
        this.connectors.update(orgId, connectorId, {
          streamMode: mode,
          updatedAt: new Date().toISOString(),
        });
      },
    };
  }
}
