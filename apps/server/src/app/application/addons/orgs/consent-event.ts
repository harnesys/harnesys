import type { AddonPermissionView } from '@harnesys/contracts';
import type { GrantDiffEntry } from '../../../domain/addons/permissions.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';

export interface ConsentRequiredNotice {
  orgId: string;
  addonId: string;
  currentVersion: string;
  pendingVersion: string;
  addedPermissions: readonly GrantDiffEntry[];
}

export function publishConsentRequired(events: EventBusPort, notice: ConsentRequiredNotice): void {
  events.publish(notice.orgId, 'addon.consent_required', {
    type: 'addon.consent_required',
    orgId: notice.orgId,
    addonId: notice.addonId,
    at: new Date().toISOString(),
    currentVersion: notice.currentVersion,
    pendingVersion: notice.pendingVersion,
    addedPermissions: permissionViews(notice.addedPermissions),
  });
}

function permissionViews(entries: readonly GrantDiffEntry[]): AddonPermissionView[] {
  return entries.map((entry) => ({
    id: entry.id,
    risk: 'medium',
    ...(entry.scope ? { scope: entry.scope } : {}),
    reason: entry.reason ?? 'expands granted permissions',
    optional: entry.optional ?? false,
    baseline: false,
    granted: false,
  }));
}
