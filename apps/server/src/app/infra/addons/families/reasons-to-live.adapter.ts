import { Injectable } from '@harnesys/brix';
import { AddonReasonsToLivePort } from '../../../application/addons/reconcile/reasons-to-live.port.ts';
import { SupervisorHooks } from '../supervisor/supervisor-deps.ts';

/**
 * Delegates to the canonical reasons-to-live logic (§8.2) bound on the
 * supervisor hooks, so the reconciler and the supervisor decide process
 * lifetime from the same source of truth.
 */
@Injectable()
export class WiredReasonsToLiveAdapter extends AddonReasonsToLivePort {
  constructor(private readonly hooks: SupervisorHooks) {
    super();
  }

  override hasReason(orgId: string, addonId: string): boolean {
    return this.hooks.reasonsToLive.hasReason(orgId, addonId);
  }
}
