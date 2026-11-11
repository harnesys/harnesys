import type { AddonTrust, OrgAddonDetail } from '@harnesys/contracts';
import { ADDON_TRUST_LABEL } from './addon-labels';

export type AddonBannerTone = 'danger' | 'warning' | 'info';

export interface AddonBanner {
  id: string;
  tone: AddonBannerTone;
  title: string;
  detail?: string;
  /** Extra lines rendered as a list under the detail. */
  notes?: string[];
}

const SKIP_REASON_LABEL = {
  unknown_family: 'unsupported capability family',
  unsupported_descriptor_version: 'descriptor version is newer than this host',
} as const;

/**
 * Banners are derived from structured view fields only. Free-form `warnings`
 * are shown verbatim — never classified by matching words inside them.
 */
export function deriveAddonBanners(
  detail: OrgAddonDetail,
  trust: AddonTrust | null,
): AddonBanner[] {
  const banners: AddonBanner[] = [];

  if (!detail.installed) {
    banners.push({
      id: 'not-installed',
      tone: 'info',
      title: 'Not enabled in this organization',
      detail: `Enabling grants the rights listed below and starts ${detail.title} for this organization.`,
    });
  }

  if (detail.health === 'quarantined') {
    banners.push({
      id: 'quarantined',
      tone: 'danger',
      title: 'Quarantined after repeated crashes',
      detail: 'Autostart is paused until the quarantine is reset.',
      notes: ['Reset the quarantine from the add-on actions to start it again.'],
    });
  } else if (detail.health === 'failed') {
    banners.push({
      id: 'failed',
      tone: 'danger',
      title: 'Instance failed',
      detail: 'The process did not start. Fix the cause reported below, then restart it.',
    });
  }

  if (detail.compatibility.outcome === 'incompatible') {
    banners.push({
      id: 'incompatible',
      tone: 'danger',
      title: 'Not compatible with this host',
      detail:
        detail.compatibility.reasons.join('; ') ||
        'The package requirements are not met on this host.',
    });
  } else if (detail.compatibility.skipped.length > 0) {
    banners.push({
      id: 'skipped-capabilities',
      tone: 'warning',
      title: `${detail.compatibility.skipped.length} capabilities are unavailable`,
      detail: 'This host skipped declared capabilities while loading the add-on.',
      notes: detail.compatibility.skipped.map(
        (skip) => `${skip.contributionId} (${skip.family}): ${SKIP_REASON_LABEL[skip.reason]}`,
      ),
    });
  }

  if (detail.installed && detail.manifest.runtimeProfile === 'trusted' && trust === 'external') {
    banners.push({
      id: 'unsandboxed-external',
      tone: 'warning',
      title: 'External package runs unsandboxed',
      detail: `${ADDON_TRUST_LABEL.external} packages with the trusted runtime profile run with host privileges.`,
    });
  }

  const unbound = detail.connections.filter(
    (connection) => !connection.optional && connection.needsSetup,
  );
  if (detail.installed && unbound.length > 0) {
    banners.push({
      id: 'connection-required',
      tone: 'warning',
      title:
        unbound.length === 1 ? 'Connection required' : `${unbound.length} connections required`,
      detail: 'Bind an account so the add-on can act on your behalf.',
      notes: unbound.map((connection) => connection.label),
    });
  }

  if (detail.installed && detail.updateAvailable) {
    const added = detail.permissions.diff.added;
    if (added.length > 0) {
      banners.push({
        id: 'update-consent',
        tone: 'warning',
        title: `Version ${detail.updateAvailable} needs approval`,
        detail: `The new version requests ${added.length === 1 ? 'a new right' : `${added.length} new rights`}. The add-on stays on ${detail.version} until you approve the update.`,
        notes: added.map((permission) => `${permission.id}: ${permission.reason}`),
      });
    } else {
      banners.push({
        id: 'update-available',
        tone: 'info',
        title: `Version ${detail.updateAvailable} is available`,
        detail: 'No new rights are requested. Updating keeps the current grant set.',
      });
    }
  }

  const packageWarnings = detail.warnings.filter(
    (warning) => !detail.compatibility.reasons.includes(warning),
  );
  if (packageWarnings.length > 0) {
    banners.push({
      id: 'package-warnings',
      tone: 'info',
      title: 'Package warnings',
      notes: packageWarnings,
    });
  }

  return banners;
}
