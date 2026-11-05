import type { Logger } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { planProjection } from '../../domain/connector/project-event.ts';
import type { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { type RouteContext, resolveThreadRoutes } from './project-connector-routes.ts';
import { toProjectEvent } from './project-connector-send.ts';

export class EchoBarrier {
  private readonly pending = new Map<string, Promise<void>>();

  enqueue(key: string, task: () => Promise<void>): void {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    this.pending.set(key, next);
    void next.finally(() => {
      if (this.pending.get(key) === next) {
        this.pending.delete(key);
      }
    });
  }

  async wait(key: string): Promise<void> {
    await this.pending.get(key);
  }
}

export interface ConnectorEchoDeps {
  connectors: Pick<ConnectorRepositoryPort, 'listBindingsByThread' | 'findById'>;
  secrets: Pick<SecretStorePort, 'get'>;
  telegram: Pick<TelegramApiPort, 'sendMessage'>;
  log: Logger;
}

export async function echoUserEvents(
  deps: ConnectorEchoDeps,
  orgId: string,
  threadId: string,
  events: SessionEvent[],
): Promise<void> {
  if (!events.some((event) => event.type === 'user')) {
    return;
  }
  try {
    const routes = resolveThreadRoutes(deps.connectors, orgId, threadId, {
      provider: 'telegram',
      agentName: 'Agent',
    });
    for (const event of events) {
      if (event.type === 'user') {
        await echoUserEvent(deps, routes, event);
      }
    }
  } catch (error) {
    deps.log.warn(
      { orgId, threadId, err: error instanceof Error ? error.message : String(error) },
      'connector echo failed',
    );
  }
}

async function echoUserEvent(
  deps: ConnectorEchoDeps,
  routes: RouteContext[],
  event: SessionEvent,
): Promise<void> {
  for (const route of routes) {
    const plan = planProjection(
      route.connector.policy,
      toProjectEvent(event, route.connector.id),
      null,
    );
    if (plan.type !== 'echo') {
      continue;
    }
    const token = await deps.secrets.get(route.connector.orgId, route.connector.secretRef);
    if (!token) {
      continue;
    }
    await deps.telegram.sendMessage(token, route.binding.externalChatId, plan.text, {
      topicId: route.binding.externalTopicId,
    });
  }
}
