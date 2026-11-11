import type {
  AddonActivation,
  AddonRuntimeProfile,
  AddonTrust,
  OrgAddonHealth,
} from '@harnesys/contracts';
import type { StatusDotTone } from '@/shared/ui/status-dot';

export const ADDON_HEALTH_LABEL: Record<OrgAddonHealth, string> = {
  stopped: 'Stopped',
  running: 'Running',
  failed: 'Failed',
  quarantined: 'Quarantined',
};

export const ADDON_TRUST_LABEL: Record<AddonTrust, string> = {
  builtin: 'System',
  local: 'Local',
  external: 'External',
};

export const ADDON_RUNTIME_PROFILE_LABEL: Record<AddonRuntimeProfile, string> = {
  restricted: 'Sandboxed',
  trusted: 'Trusted (unsandboxed)',
};

export const ADDON_ACTIVATION_LABEL: Record<AddonActivation, string> = {
  lazy: 'Lazy (starts on demand)',
  resident: 'Resident (always on)',
};

export function addonHealthTone(health: OrgAddonHealth): StatusDotTone {
  if (health === 'running') {
    return 'ok';
  }
  if (health === 'failed' || health === 'quarantined') {
    return 'danger';
  }
  return 'idle';
}

export function addonHealthLabel(health: OrgAddonHealth): string {
  return ADDON_HEALTH_LABEL[health];
}

export function runtimeProfileLabel(profile: AddonRuntimeProfile): string {
  return ADDON_RUNTIME_PROFILE_LABEL[profile];
}

export function activationLabel(activation: AddonActivation): string {
  return ADDON_ACTIVATION_LABEL[activation];
}
