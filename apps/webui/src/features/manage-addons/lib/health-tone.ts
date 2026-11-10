import type { OrgAddonHealth } from '@harnesys/contracts';
import type { StatusDotTone } from '@/shared/ui/status-dot';

export function addonHealthTone(health: OrgAddonHealth): StatusDotTone {
  if (health === 'running') {
    return 'ok';
  }
  if (health === 'quarantined' || health === 'failed') {
    return 'danger';
  }
  return 'idle';
}

export const ADDON_HEALTH_LABEL: Record<OrgAddonHealth, string> = {
  stopped: 'Stopped',
  running: 'Running',
  failed: 'Failed',
  quarantined: 'Quarantined',
};
