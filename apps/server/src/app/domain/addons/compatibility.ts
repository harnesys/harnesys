import type { Contribution } from '@harnesys/sdk';

export interface CompatibilityInput {
  platform: number;
  supportedPlatforms: readonly number[];
  features?: readonly string[];
  hostFeatures?: readonly string[];
  contributions: readonly Contribution[];
  knownFamilies: Readonly<Record<string, readonly number[]>>;
}

export interface CompatibilitySkip {
  contributionId: string;
  family: string;
  reason: 'unknown_family' | 'unsupported_descriptor_version';
}

export interface CompatibilityResult {
  outcome: 'ok' | 'incompatible';
  reasons: string[];
  skipped: CompatibilitySkip[];
}

export function supportedPlatformMajors(current: number, previousCount = 1): number[] {
  const majors: number[] = [];
  for (let major = current - previousCount; major <= current; major += 1) {
    if (major >= 1) {
      majors.push(major);
    }
  }
  return majors;
}

function platformReason(input: CompatibilityInput): string | null {
  return input.supportedPlatforms.includes(input.platform)
    ? null
    : `platform_unsupported:${String(input.platform)}`;
}

function featureReasons(input: CompatibilityInput): string[] {
  const hostFeatures = new Set(input.hostFeatures ?? []);
  return (input.features ?? [])
    .filter((feature) => !hostFeatures.has(feature))
    .map((feature) => `feature_missing:${feature}`);
}

function familyReasons(input: CompatibilityInput, skipped: CompatibilitySkip[]): string[] {
  const reasons: string[] = [];
  for (const contribution of input.contributions) {
    const versions = input.knownFamilies[contribution.family];
    if (!versions) {
      if (contribution.optional) {
        skipped.push({
          contributionId: contribution.id,
          family: contribution.family,
          reason: 'unknown_family',
        });
        continue;
      }
      reasons.push(`family_unknown:${contribution.family}/${contribution.id}`);
      continue;
    }
    if (versions.includes(contribution.v ?? 1)) {
      continue;
    }
    if (contribution.optional) {
      skipped.push({
        contributionId: contribution.id,
        family: contribution.family,
        reason: 'unsupported_descriptor_version',
      });
      continue;
    }
    reasons.push(
      `descriptor_version_unsupported:${contribution.family}/${contribution.id}@${String(contribution.v ?? 1)}`,
    );
  }
  return reasons;
}

export function checkCompatibility(input: CompatibilityInput): CompatibilityResult {
  const skipped: CompatibilitySkip[] = [];
  const platform = platformReason(input);
  const reasons = [
    ...(platform ? [platform] : []),
    ...featureReasons(input),
    ...familyReasons(input, skipped),
  ];
  return { outcome: reasons.length === 0 ? 'ok' : 'incompatible', reasons, skipped };
}
