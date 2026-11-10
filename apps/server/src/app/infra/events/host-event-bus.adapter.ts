import { Inject, Injectable, Logger } from '@harnesys/brix';
import type {
  HostEventEnvelope,
  HostEventHandler,
  HostEventSubscription,
} from '../../domain/events/event-bus.port.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { hostEventDefinition } from '../../domain/events/host-event-catalog.ts';

interface BusSubscription {
  patterns: readonly string[];
  handler: HostEventHandler;
  closed: boolean;
}

@Injectable()
export class InProcessEventBus extends EventBusPort {
  private readonly logger: Logger;
  private readonly subscriptions = new Map<string, Set<BusSubscription>>();

  constructor(@Inject(Logger) logger: Logger) {
    super();
    this.logger = logger.child('host-events');
  }

  override publish(orgId: string, name: string, payload: unknown): void {
    const definition = hostEventDefinition(name);
    if (!definition) {
      this.logger.warn({ event: name, orgId }, 'dropped event outside the host event catalog');
      return;
    }
    const parsed = definition.payload.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn({ event: name, orgId }, 'dropped host event with invalid payload');
      return;
    }
    const envelope: HostEventEnvelope = {
      name,
      version: definition.version,
      orgId,
      occurredAt: new Date().toISOString(),
      payload: parsed.data,
    };
    for (const subscription of this.subscriptions.get(orgId) ?? []) {
      if (!subscription.closed && matchesPattern(subscription.patterns, name)) {
        subscription.handler(envelope);
      }
    }
  }

  override subscribe(
    orgId: string,
    patterns: readonly string[],
    handler: HostEventHandler,
  ): HostEventSubscription {
    const subscription: BusSubscription = { patterns: [...patterns], handler, closed: false };
    const set = this.subscriptions.get(orgId) ?? new Set<BusSubscription>();
    set.add(subscription);
    this.subscriptions.set(orgId, set);
    return {
      close: () => {
        subscription.closed = true;
        set.delete(subscription);
      },
    };
  }
}

function matchesPattern(patterns: readonly string[], name: string): boolean {
  return patterns.some((pattern) => {
    if (pattern === name) {
      return true;
    }
    return pattern.endsWith('.*') && name.startsWith(pattern.slice(0, -1));
  });
}
