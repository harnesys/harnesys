import { SemverSchema } from '@harnesys/contracts';
import {
  PresetConflictException,
  PresetValidationException,
} from '../../domain/presets/preset.error.ts';

const DEFAULT_VERSION = '1.0.0';

type SemverParts = [number, number, number];

export function nextVersion(current: string | null, requested?: string): string {
  if (current === null) {
    if (requested === undefined) {
      return DEFAULT_VERSION;
    }
    assertSemver(requested);
    return requested;
  }
  const currentParts = parseSemver(current);
  if (requested === undefined) {
    return `${currentParts[0]}.${currentParts[1]}.${currentParts[2] + 1}`;
  }
  const requestedParts = parseSemver(requested);
  if (compareParts(requestedParts, currentParts) <= 0) {
    throw new PresetConflictException(
      `preset version must increase: ${requested} is not greater than ${current}`,
      { current, requested },
    );
  }
  return requested;
}

export function comparePresetVersions(left: string, right: string): number {
  return compareParts(parseSemver(left), parseSemver(right));
}

function assertSemver(version: string): void {
  const parsed = SemverSchema.safeParse(version);
  if (!parsed.success) {
    throw new PresetValidationException(`invalid preset version: ${version}`, parsed.error.issues);
  }
}

function parseSemver(version: string): SemverParts {
  assertSemver(version);
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number(part));
  return [major, minor, patch];
}

function compareParts(left: SemverParts, right: SemverParts): number {
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
