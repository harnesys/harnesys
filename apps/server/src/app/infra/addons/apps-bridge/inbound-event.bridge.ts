import { Injectable, Logger } from '@harnesys/brix';
import type { AddonManifest } from '@harnesys/sdk';
import type { OwnerKey } from '../../../domain/addons/owner.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import type { InboundEnvelope } from '../../../domain/apps/ports/inbound-event.port.ts';
import { InboundEventPort } from '../../../domain/apps/ports/inbound-event.port.ts';
import { AddonHookRoutingTable, HookDeliveryService } from '../families/hook/hook.family.ts';
@Injectable()
export class InboundEventBridge extends InboundEventPort {
  constructor(
    private readonly routing: AddonHookRoutingTable,
    private readonly delivery: HookDeliveryService,
    private readonly bindings: BindingRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly logger: Logger,
  ) {
    super();
  }

  override async publish(orgId: string, envelope: InboundEnvelope): Promise<void> {
    if (envelope.accountId === null) {
      return;
    }
    const account = this.accounts.findById(orgId, envelope.accountId);
    if (account === null) {
      return;
    }
    for (const route of this.routing.candidates(orgId)) {
      if (!this.bound(orgId, route.owner, route.connection, envelope.accountId)) {
        continue;
      }
      if (!this.kindAllowed(route.owner, route.connection, account.kind)) {
        continue;
      }
      if (route.types !== undefined && !route.types.includes(envelope.event.type)) {
        continue;
      }
      const dropped = this.deliver(route.owner, route.hookId, envelope);
      if (dropped > 0) {
        this.logger.warn(
          { orgId, addonId: route.owner.addonId, dropped },
          'provider event dropped on hook queue overflow',
        );
      }
    }
  }

  private deliver(owner: OwnerKey, hookId: string, envelope: InboundEnvelope): number {
    return this.delivery.enqueue(owner, hookId, {
      connection: envelope.kind,
      accountId: envelope.accountId,
      type: envelope.event.type,
      deliveryId: envelope.event.deliveryId,
      payload: envelope.event.payload,
      occurredAt: envelope.event.occurredAt ?? null,
    });
  }

  private bound(orgId: string, owner: OwnerKey, connection: string, accountId: string): boolean {
    return this.bindings
      .accountsFor(orgId, owner.addonId, connection)
      .some((binding) => binding.accountId === accountId);
  }

  private kindAllowed(owner: OwnerKey, connection: string, accountKind: string): boolean {
    const manifest: AddonManifest | undefined = this.catalog.find(
      owner.addonId,
      owner.version,
    )?.manifest;
    const requirement = manifest?.connections.find((entry) => entry.id === connection);
    if (requirement === undefined) {
      return false;
    }
    return requirement.accountKinds.includes(accountKind);
  }
}
