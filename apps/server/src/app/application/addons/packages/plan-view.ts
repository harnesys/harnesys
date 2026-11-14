import type { AddonConnectionView, AddonPermissionView, InstallPlan } from '@harnesys/contracts';
import type { AddonManifest, L10n } from '@harnesys/sdk';
import type { StagedInstallPlan } from './plan-store.ts';

function l10nText(value: L10n): string {
  if (typeof value === 'string') {
    return value;
  }
  return value.en ?? Object.values(value)[0] ?? '';
}

function permissionView(manifest: AddonManifest): AddonPermissionView[] {
  return manifest.permissions.map((entry) => ({
    id: entry.id,
    risk: 'medium',
    ...(entry.scope ? { scope: entry.scope } : {}),
    reason: entry.reason,
    optional: entry.optional ?? false,
    baseline: false,
    granted: false,
  }));
}

function connectionView(manifest: AddonManifest): AddonConnectionView[] {
  return manifest.connections.map((entry) => ({
    connectionId: entry.id,
    label: l10nText(entry.label),
    accountKinds: entry.accountKinds,
    cardinality: entry.cardinality,
    optional: entry.optional ?? false,
    accountIds: [],
    needsSetup: true,
  }));
}

export function toInstallPlan(plan: StagedInstallPlan): InstallPlan {
  const { manifest } = plan;
  return {
    planId: plan.planId,
    id: manifest.id,
    version: manifest.version,
    digest: plan.digest,
    source: plan.source,
    trust: plan.trust,
    title: l10nText(manifest.title),
    description: l10nText(manifest.description),
    permissions: permissionView(manifest),
    connections: connectionView(manifest),
    warnings: plan.warnings,
  };
}
