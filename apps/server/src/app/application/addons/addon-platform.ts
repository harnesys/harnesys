import { familyRegistry } from '@harnesys/sdk';
import { type CompatibilityResult, checkCompatibility } from '../../domain/addons/compatibility.ts';
import type { InstalledAddonPackage } from '../../domain/addons/ports/addon-package-catalog.port.ts';

export const HOST_PLATFORM_MAJOR = 1;

export function checkPackageCompatibility(
  pkg: Pick<InstalledAddonPackage, 'manifest'>,
): CompatibilityResult {
  const knownFamilies: Record<string, readonly number[]> = {};
  for (const [family, definition] of Object.entries(familyRegistry)) {
    knownFamilies[family] = definition.versions;
  }
  return checkCompatibility({
    platform: pkg.manifest.platform,
    supportedPlatforms: [HOST_PLATFORM_MAJOR],
    features: pkg.manifest.features,
    hostFeatures: [],
    contributions: pkg.manifest.contributions,
    knownFamilies,
  });
}
