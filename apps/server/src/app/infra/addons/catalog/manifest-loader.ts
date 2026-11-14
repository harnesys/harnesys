import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddonManifest, Violation } from '@harnesys/sdk';
import { validateManifest } from '@harnesys/sdk';

export const DESCRIPTOR_MAX_BYTES = 256 * 1024;
export const DESCRIPTOR_MAX_DEPTH = 16;

export interface LoadedManifest {
  manifest: AddonManifest | null;
  violations: Violation[];
}

export function loadAddonManifest(root: string): LoadedManifest {
  const manifestPath = join(root, 'addon.json');
  if (!existsSync(manifestPath)) {
    return {
      manifest: null,
      violations: [
        {
          path: 'addon.json',
          code: 'manifest_missing',
          message: 'addon.json not found in package root',
          severity: 'error',
        },
      ],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      manifest: null,
      violations: [
        {
          path: 'addon.json',
          code: 'manifest_unparseable',
          message: error instanceof Error ? error.message : 'invalid JSON',
          severity: 'error',
        },
      ],
    };
  }
  const l10nKeys = readL10nKeys(root);
  const result = validateManifest(raw, { l10nKeys });
  if (result.manifest) {
    result.violations.push(...descriptorLimitViolations(result.manifest));
  }
  return result;
}

export function readL10nKeys(root: string): string[] {
  const enPath = join(root, 'l10n', 'en.json');
  if (!existsSync(enPath)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(enPath, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
}

function descriptorLimitViolations(manifest: AddonManifest): Violation[] {
  const violations: Violation[] = [];
  for (const contribution of manifest.contributions) {
    const path = `contributions[${contribution.id}]`;
    const serialized = JSON.stringify(contribution.descriptor);
    if (serialized.length > DESCRIPTOR_MAX_BYTES) {
      violations.push({
        path,
        code: 'descriptor_too_large',
        message: `descriptor exceeds ${DESCRIPTOR_MAX_BYTES} bytes`,
        severity: 'error',
      });
    }
    const depth = descriptorDepth(contribution.descriptor);
    if (depth > DESCRIPTOR_MAX_DEPTH) {
      violations.push({
        path,
        code: 'descriptor_too_deep',
        message: `descriptor depth ${depth} exceeds ${DESCRIPTOR_MAX_DEPTH}`,
        severity: 'error',
      });
    }
  }
  return violations;
}

function descriptorDepth(value: unknown, current: number = 0): number {
  if (current > DESCRIPTOR_MAX_DEPTH || typeof value !== 'object' || value === null) {
    return current;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  let max = current;
  for (const child of children) {
    max = Math.max(max, descriptorDepth(child, current + 1));
  }
  return max;
}
