import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type {
  HostEventEnvelope,
  HostEventSubscription,
} from '../../../domain/events/event-bus.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { ConfigNotifier } from '../families/config/config.family.ts';
import { ManifestPermissionProvider } from './supervisor-hooks/manifest-permission-provider.ts';

const FORWARD_PATTERNS = ['config.changed', 'permissions.changed'] as const;

/**
 * Forwards host-bus `config.changed` / `permissions.changed` events to running
 * addon instances over the notify path (§6.3). Subscriptions are per org and
 * idempotent: the lifecycle service syncs at boot, and the request handler
 * ensures the org of every started instance (new orgs after boot included).
 */
@Injectable()
export class AddonEventForwarder {
  private readonly log: Logger;
  private readonly subscriptions = new Map<string, HostEventSubscription>();

  constructor(
    private readonly bus: EventBusPort,
    private readonly notify: AddonNotifyPort,
    private readonly configNotifier: ConfigNotifier,
    private readonly permissions: ManifestPermissionProvider,
    private readonly orgAddons: OrgAddonRepositoryPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.log = logger.child('addon-event-forwarder');
  }

  syncOrgs(): void {
    for (const row of this.orgAddons.listAll()) {
      this.ensureOrg(row.orgId);
    }
  }

  ensureOrg(orgId: string): void {
    if (this.subscriptions.has(orgId)) {
      return;
    }
    const subscription = this.bus.subscribe(orgId, [...FORWARD_PATTERNS], (envelope) =>
      this.forward(envelope),
    );
    this.subscriptions.set(orgId, subscription);
  }

  progress(orgId: string, addonId: string, token: string, value: unknown): void {
    this.bus.publish(orgId, 'addon.progress', { orgId, addonId, token, value });
  }

  stop(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.close();
    }
    this.subscriptions.clear();
  }

  private forward(envelope: HostEventEnvelope): void {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const orgId = typeof payload.orgId === 'string' ? payload.orgId : envelope.orgId;
    const addonId = typeof payload.addonId === 'string' ? payload.addonId : '';
    if (!addonId) {
      return;
    }
    try {
      if (envelope.name === 'config.changed') {
        const keys = Array.isArray(payload.keys) ? payload.keys.map(String) : [];
        void this.configNotifier.notify(orgId, addonId, keys);
        return;
      }
      if (envelope.name === 'permissions.changed') {
        this.notify.notify(orgId, addonId, 'permissions.changed', {
          permissions: this.permissions.effectivePermissions(orgId, addonId),
        });
      }
    } catch (error) {
      this.log.warn(
        { orgId, addonId, event: envelope.name, error: String(error) },
        'addon event forward failed',
      );
    }
  }
}
