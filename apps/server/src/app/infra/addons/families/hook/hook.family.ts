import { Injectable, Logger } from '@harnesys/brix';
import { HookDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import { InstanceSupervisorPort } from '../../../../domain/addons/ports/instance-supervisor.port.ts';
import { EventBusPort } from '../../../../domain/events/event-bus.port.ts';
import { HookQueue } from './hook-queue.ts';

type HookSchema = z.infer<typeof HookDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('hook.deliver')];
const HOOK_QUEUE_LIMIT = 256;
const HOOK_DELIVER_TIMEOUT_MS = 10_000;

interface ProviderEventRoute {
  owner: OwnerKey;
  hookId: string;
  connection: string;
  types: readonly string[] | undefined;
}

@Injectable()
export class AddonHookRoutingTable {
  private readonly routes = new Map<string, ProviderEventRoute>();

  add(owner: OwnerKey, hookId: string, connection: string, types?: readonly string[]): void {
    this.routes.set(`${ownerKeyId(owner)}/${hookId}`, { owner, hookId, connection, types });
  }

  removeOwner(owner: OwnerKey): void {
    const prefix = `${ownerKeyId(owner)}/`;
    for (const key of this.routes.keys()) {
      if (key.startsWith(prefix)) {
        this.routes.delete(key);
      }
    }
  }

  candidates(orgId: string): ProviderEventRoute[] {
    return [...this.routes.values()].filter((route) => route.owner.orgId === orgId);
  }
}

@Injectable()
export class HookDeliveryService {
  private readonly queues = new Map<string, HookQueue>();
  private readonly pumping = new Set<string>();
  droppedTotal = 0;

  constructor(
    private readonly supervisor: InstanceSupervisorPort,
    private readonly calls: AddonCallPort,
    private readonly logger: Logger,
  ) {}

  enqueue(owner: OwnerKey, hookId: string, event: Record<string, unknown>): number {
    const queue = this.queueOf(owner);
    const dropped = queue.push({ hookId, event });
    this.droppedTotal += dropped;
    void this.pump(owner);
    return dropped;
  }

  disposeOwner(owner: OwnerKey): void {
    const key = ownerKeyId(owner);
    this.queues.get(key)?.clear();
    this.queues.delete(key);
    this.pumping.delete(key);
  }

  private queueOf(owner: OwnerKey): HookQueue {
    const key = ownerKeyId(owner);
    const existing = this.queues.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const queue = new HookQueue(HOOK_QUEUE_LIMIT);
    this.queues.set(key, queue);
    return queue;
  }

  private async pump(owner: OwnerKey): Promise<void> {
    const key = ownerKeyId(owner);
    if (this.pumping.has(key)) {
      return;
    }
    this.pumping.add(key);
    try {
      const queue = this.queues.get(key);
      if (queue === undefined) {
        return;
      }
      for (let item = queue.take(); item !== undefined; item = queue.take()) {
        await this.deliver(owner, item.hookId, item.event);
      }
    } finally {
      this.pumping.delete(key);
    }
  }

  private async deliver(
    owner: OwnerKey,
    hookId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.supervisor.ensureRunning(owner.orgId, owner.addonId, `hook:${hookId}`);
      await this.calls.hookDeliver(
        owner.orgId,
        owner.addonId,
        { hookId, event },
        { timeoutMs: HOOK_DELIVER_TIMEOUT_MS },
      );
    } catch (error) {
      this.logger.warn({ err: error, addonId: owner.addonId, hookId }, 'hook delivery failed');
    }
  }
}

@Injectable()
export class HookFamilyModule implements FamilyModule<HookSchema> {
  readonly family = 'hook';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = ['events.subscribe'];

  constructor(
    private readonly bus: EventBusPort,
    readonly routing: AddonHookRoutingTable,
    readonly delivery: HookDeliveryService,
  ) {}

  schema(_v: number): z.ZodType<HookSchema> {
    return HookDescriptorSchema as z.ZodType<HookSchema>;
  }

  register(owner: OwnerKey, d: HookSchema): Disposable {
    if ('event' in d.on) {
      return this.registerHostEvent(owner, d.id, d.on.event);
    }
    this.routing.add(owner, d.id, d.on.providerEvent.connection, d.on.providerEvent.types);
    return {
      dispose: () => {
        this.routing.removeOwner(owner);
      },
    };
  }

  private registerHostEvent(owner: OwnerKey, hookId: string, pattern: string): Disposable {
    const subscription = this.bus.subscribe(owner.orgId, [pattern], (envelope) => {
      this.delivery.enqueue(owner, hookId, {
        name: envelope.name,
        version: envelope.version,
        occurredAt: envelope.occurredAt,
        payload: envelope.payload,
      });
    });
    return {
      dispose: () => {
        subscription.close();
        this.delivery.disposeOwner(owner);
      },
    };
  }
}
