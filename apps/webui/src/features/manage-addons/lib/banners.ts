import type { OrgAddonDetail } from '@harnesys/contracts';

export interface AddonBanner {
  id: string;
  tone: 'muted' | 'warning';
  title: string;
  detail?: string;
}

const UNSANDBOXED_PATTERN = /unsandboxed/i;
const DEV_PATTERN = /\bdev\b|local development/i;
const DEPRECATED_PATTERN = /deprecat/i;

export function deriveAddonBanners(detail: OrgAddonDetail): AddonBanner[] {
  const banners: AddonBanner[] = [];
  if (detail.health === 'quarantined') {
    banners.push({
      id: 'quarantined',
      tone: 'warning',
      title: 'Instance quarantined',
      detail:
        detail.lastError ??
        'The add-on crashed repeatedly and autostart is paused. Restart to clear the breaker.',
    });
  }
  if (detail.compatibility.outcome === 'needs_consent') {
    banners.push({
      id: 'needs_consent',
      tone: 'warning',
      title: 'New version needs your consent',
      detail: `Version ${detail.updateAvailable ?? 'pending'} requests additional rights. The add-on stays on the pinned version until you confirm.`,
    });
  }
  if (detail.compatibility.outcome === 'incompatible') {
    banners.push({
      id: 'incompatible',
      tone: 'warning',
      title: 'Incompatible with this host',
      detail: detail.compatibility.reasons.join('; ') || 'The manifest requirements are not met.',
    });
  }
  if (detail.connections.some((connection) => !connection.optional && connection.needsSetup)) {
    banners.push({
      id: 'needs_setup',
      tone: 'warning',
      title: 'Connection required',
      detail: 'Bind an account to every required connection below.',
    });
  }
  for (const warning of detail.warnings) {
    if (UNSANDBOXED_PATTERN.test(warning)) {
      banners.push({
        id: 'unsandboxed',
        tone: 'warning',
        title: 'Running unsandboxed',
        detail: warning,
      });
      continue;
    }
    if (DEV_PATTERN.test(warning)) {
      banners.push({ id: 'dev', tone: 'muted', title: 'Development build', detail: warning });
      continue;
    }
    if (DEPRECATED_PATTERN.test(warning)) {
      banners.push({ id: 'deprecated', tone: 'muted', title: 'Deprecated', detail: warning });
      continue;
    }
    banners.push({
      id: `warning-${banners.length}`,
      tone: 'muted',
      title: 'Warning',
      detail: warning,
    });
  }
  return banners;
}
