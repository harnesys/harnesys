import type { AddonPackageView, AddonTrust, OrgAddonSummary } from '@harnesys/contracts';

export interface AddonCardModel {
  id: string;
  title: string;
  description: string;
  versions: Array<{ version: string; trust: AddonTrust }>;
  org: OrgAddonSummary | null;
}

export function buildCards(
  packages: AddonPackageView[],
  orgAddons: OrgAddonSummary[],
): AddonCardModel[] {
  const byId = new Map<string, AddonCardModel>();
  for (const pkg of packages) {
    const existing = byId.get(pkg.id);
    if (existing) {
      existing.versions.push({ version: pkg.version, trust: pkg.trust });
      continue;
    }
    byId.set(pkg.id, {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      versions: [{ version: pkg.version, trust: pkg.trust }],
      org: null,
    });
  }
  for (const org of orgAddons) {
    const existing = byId.get(org.addonId);
    if (existing) {
      existing.org = org;
      continue;
    }
    byId.set(org.addonId, {
      id: org.addonId,
      title: org.title,
      description: org.description,
      versions: [],
      org,
    });
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
