export type AddonNotifyOutcome = 'delivered' | 'not_running';

export abstract class AddonNotifyPort {
  /**
   * Best-effort JSON-RPC notification to a running addon instance.
   * Stopped addons are expected to read state on their next call (§10.4).
   */
  abstract notify(
    orgId: string,
    addonId: string,
    method: string,
    params: unknown,
  ): AddonNotifyOutcome;
}
