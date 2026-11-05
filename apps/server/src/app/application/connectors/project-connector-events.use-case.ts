import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import type {
  ConnectorBindingRecord,
  ConnectorDeliveryRecord,
  ConnectorRecord,
} from '../../domain/connector/connector.ts';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { type ProjectionPlan, planProjection } from '../../domain/connector/project-event.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import {
  appendDraftText,
  type DraftSendDeps,
  type DraftSendState,
  draftStateFromConnector,
  finalizeDraftText,
  maybeFlushDraft,
  sendThinkingDraft,
} from './project-connector-draft.ts';
import { EchoBarrier, echoUserEvents } from './project-connector-echo.ts';
import {
  prefixForRoute,
  prefixOf,
  type RouteContext,
  resolveThreadRoutes,
} from './project-connector-routes.ts';
import {
  sendAskMessage,
  sendFileMessage,
  sendStatusMessage,
  toProjectEvent,
} from './project-connector-send.ts';

const TELEGRAM_PROVIDER = 'telegram';

function resumeDeliveryOf(delivery: ConnectorDeliveryRecord): ConnectorDeliveryRecord | undefined {
  return delivery.blockKey.startsWith('text:') ? delivery : undefined;
}

function isActiveRun(status: string | undefined): boolean {
  return (
    status === 'running' || status === 'queued' || status === 'waiting' || status === 'needs_input'
  );
}

@Injectable()
export class ProjectConnectorEventsUseCase
  extends ConnectorOutboundPort
  implements ModuleInitHook, ModuleDestroyHook
{
  private readonly log: Logger;
  private readonly sessions = new Map<string, DraftSendState>();
  private readonly inflight = new Set<string>();
  private readonly echoBarrier = new EchoBarrier();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
    private readonly executor: LocalExecutorPort,
    private readonly threadEvents: ThreadEventsPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('connector-project');
  }

  onModuleInit(): void {
    this.unsubscribe = this.threadEvents.subscribe((orgId, event) => {
      if (event.type === 'cleared') {
        const { threadId, runId } = event;
        queueMicrotask(() => {
          void this.maybeProjectRun(orgId, threadId, runId);
        });
        return;
      }
      if (event.type === 'events') {
        const { threadId, events } = event;
        if (!events.some((item) => item.type === 'user')) {
          return;
        }
        this.echoBarrier.enqueue(`${orgId}:${threadId}`, () =>
          echoUserEvents(
            {
              connectors: this.connectors,
              secrets: this.secrets,
              telegram: this.telegram,
              log: this.log,
            },
            orgId,
            threadId,
            events,
          ),
        );
      }
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async projectRun(orgId: string, threadId: string, runId: string): Promise<void> {
    await this.echoBarrier.wait(`${orgId}:${threadId}`);
    const routes = await this.routesForThread(orgId, threadId, runId);
    await Promise.all(routes.map((route) => this.projectRoute(route, threadId, runId)));
  }

  async resumeStreaming(orgId: string, connectorId: string): Promise<void> {
    const connector = this.connectors.findById(orgId, connectorId);
    if (!connector) {
      return;
    }
    const token = await this.secrets.get(orgId, connector.secretRef);
    if (!token) {
      return;
    }
    const lifecycle = await this.executor.lifecycle(orgId);
    for (const delivery of this.connectors.listStreaming(orgId, connectorId)) {
      const rec = await lifecycle.get(delivery.runId);
      if (isActiveRun(rec?.status)) {
        const route = this.routeForConnector(orgId, connectorId, delivery.threadId, rec?.agentName);
        if (route) {
          void this.projectRoute(
            route,
            delivery.threadId,
            delivery.runId,
            resumeDeliveryOf(delivery),
          );
        }
        continue;
      }
      await this.finishStaleDelivery(orgId, connectorId, delivery, rec?.agentName, token);
    }
  }

  private async finishStaleDelivery(
    orgId: string,
    connectorId: string,
    delivery: ConnectorDeliveryRecord,
    agentName: string | undefined,
    token: string,
  ): Promise<void> {
    const binding = this.connectors.findBinding(orgId, connectorId, delivery.bindingId);
    if (delivery.blockKey.startsWith('text:') && delivery.lastText) {
      await this.deliverStaleText(token, binding, delivery, agentName);
    }
    this.connectors.upsertDelivery(orgId, {
      ...delivery,
      status: 'final',
      updatedAt: new Date().toISOString(),
    });
  }

  private async deliverStaleText(
    token: string,
    binding: ConnectorBindingRecord,
    delivery: ConnectorDeliveryRecord,
    agentName: string | undefined,
  ): Promise<void> {
    if (delivery.externalMessageId) {
      await this.telegram.editMessageText(
        token,
        binding.externalChatId,
        delivery.externalMessageId,
        delivery.lastText ?? '',
      );
      return;
    }
    await this.telegram.sendMessage(
      token,
      binding.externalChatId,
      prefixOf(binding.chatType, agentName) + (delivery.lastText ?? ''),
      { topicId: binding.externalTopicId },
    );
  }

  async finalizeOpenDraft(connectorId: string, runId: string): Promise<void> {
    const state = this.sessions.get(`${connectorId}:${runId}`);
    if (!state) {
      return;
    }
    await finalizeDraftText(this.draftDeps(), state);
  }

  private async projectRoute(
    route: RouteContext,
    threadId: string,
    runId: string,
    resume?: ConnectorDeliveryRecord,
  ): Promise<void> {
    const orgId = route.connector.orgId;
    const sessionKey = `${route.connector.id}:${runId}`;
    const key = `${orgId}:${sessionKey}`;
    if (this.inflight.has(key)) {
      return;
    }
    this.inflight.add(key);
    let draftTick: ReturnType<typeof setInterval> | null = null;
    try {
      const token = await this.secrets.get(orgId, route.connector.secretRef);
      if (!token) {
        return;
      }
      const state = draftStateFromConnector(route.connector, {
        orgId,
        bindingId: route.binding.id,
        threadId,
        runId,
        chatId: route.binding.externalChatId,
        topicId: route.binding.externalTopicId,
        token,
        prefix: prefixForRoute(route),
        ...(resume ? { delivery: resume } : {}),
      });
      this.sessions.set(sessionKey, state);
      draftTick = setInterval(() => {
        void maybeFlushDraft(this.draftDeps(), state);
      }, 100);
      const stream = await this.executor.stream(orgId, runId, state.lastSeq);
      for await (const event of stream) {
        const live = this.connectors.findById(orgId, route.connector.id);
        if (!live || live.status === 'paused') {
          return;
        }
        state.coalesceMs = live.policy.coalesceMs;
        await this.handleEvent(live, state, event);
      }
    } catch (error) {
      this.log.warn(
        { orgId, threadId, runId, err: error instanceof Error ? error.message : String(error) },
        'connector project failed',
      );
    } finally {
      if (draftTick !== null) {
        clearInterval(draftTick);
      }
      this.inflight.delete(key);
      this.sessions.delete(sessionKey);
    }
  }

  private routeForConnector(
    orgId: string,
    connectorId: string,
    threadId: string,
    agentName: string | undefined,
  ): RouteContext | undefined {
    return resolveThreadRoutes(this.connectors, orgId, threadId, {
      provider: TELEGRAM_PROVIDER,
      agentName: agentName ?? 'Agent',
    }).find((route) => route.connector.id === connectorId);
  }

  private async maybeProjectRun(orgId: string, threadId: string, runId: string): Promise<void> {
    await this.projectRun(orgId, threadId, runId);
  }

  private async handleEvent(
    connector: ConnectorRecord,
    state: DraftSendState,
    event: SessionEvent,
  ): Promise<void> {
    if (typeof event.seq === 'number' && event.seq > state.lastSeq) {
      state.lastSeq = event.seq;
    }
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
        await this.telegram.sendMessage(state.token, state.chatId, plan.text, {
          topicId: state.topicId,
        });
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

  private async routesForThread(
    orgId: string,
    threadId: string,
    runId?: string,
  ): Promise<RouteContext[]> {
    const agentName = runId === undefined ? 'Agent' : await this.agentNameOf(orgId, runId);
    return resolveThreadRoutes(this.connectors, orgId, threadId, {
      provider: TELEGRAM_PROVIDER,
      agentName,
    });
  }

  private async agentNameOf(orgId: string, runId: string): Promise<string> {
    const lifecycle = await this.executor.lifecycle(orgId);
    return (await lifecycle.get(runId))?.agentName ?? 'Agent';
  }

  private draftDeps(): DraftSendDeps {
    return {
      connectors: this.connectors,
      telegram: this.telegram,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
  }
}
