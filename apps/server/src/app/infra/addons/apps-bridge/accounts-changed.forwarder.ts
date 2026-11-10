import { Injectable, Logger } from '@harnesys/brix';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { HostEventSubscription } from '../../../domain/events/event-bus.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import type { AccountsChangedEvent, AccountsChangedSink } from '../families/sinks-reference.ts';

const PATTERNS = ['account.status_changed', 'account.removed'] as const;

@Injectable()
export class AccountsChangedForwarder {
  private readonly subscriptions = new Map<string, HostEventSubscription>();
  private sink: AccountsChangedSink | null = null;

  constructor(
    private readonly bus: EventBusPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly logger: Logger,
  ) {}

  subscribe(orgId: string): void {
    if (this.subscriptions.has(orgId)) {
      return;
    }
    const subscription = this.bus.subscribe(orgId, PATTERNS, (envelope) => {
      void this.forward(envelope.orgId, envelope.payload);
    });
    this.subscriptions.set(orgId, subscription);
  }

  unsubscribe(orgId: string): void {
    this.subscriptions.get(orgId)?.close();
    this.subscriptions.delete(orgId);
  }

  setSink(sink: AccountsChangedSink): void {
    this.sink = sink;
  }

  async forward(orgId: string, payload: unknown): Promise<void> {
    const event = parseEvent(payload);
    if (event === null) {
      return;
    }
    for (const binding of this.bindings.byAccount(orgId, event.accountId)) {
      const snapshot = this.supervisor.snapshot(orgId, binding.addonId);
      if (snapshot === null || snapshot.state !== 'running') {
        continue;
      }
      const sink = this.sink;
      if (sink === null) {
        this.logger.warn(
          { orgId, addonId: binding.addonId },
          'accounts.changed recipient found but no sink wired',
        );
        continue;
      }
      await sink.accountsChanged(orgId, binding.addonId, event);
    }
  }
}

function parseEvent(payload: unknown): AccountsChangedEvent | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.accountId !== 'string' || typeof record.kind !== 'string') {
    return null;
  }
  return {
    connection: record.kind,
    accountId: record.accountId,
    status: typeof record.status === 'string' ? record.status : 'unknown',
  };
}
