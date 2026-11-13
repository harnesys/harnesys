import { isAbsolute } from 'node:path';
import type { AddonManifest } from '@harnesys/sdk';
import type { AddonTrust } from './addon-package-catalog.port.ts';

export type AddonSourceKind = 'builtin' | 'local-dir' | 'archive' | 'url' | 'registry';

export function isPathLikeAddonSource(source: string): boolean {
  return (
    source.includes('/') || source.includes('\\') || source.startsWith('.') || isAbsolute(source)
  );
}

/** Classifies an install source string; `.zip` paths resolve to the archive kind. */
export function kindOfAddonSource(source: string): AddonSourceKind {
  if (source.toLowerCase().endsWith('.zip')) {
    return 'archive';
  }
  if (isPathLikeAddonSource(source)) {
    return 'local-dir';
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return 'url';
  }
  return 'builtin';
}

/**
 * Single policy rule for both install gates: `allowedSources` lists source-kind
 * tokens (`local-dir`, `archive`, ...) OR exact literal sources.
 */
export function isAddonSourceAllowed(allowedSources: readonly string[], source: string): boolean {
  return allowedSources.includes(source) || allowedSources.includes(kindOfAddonSource(source));
}

export interface AddonStageRequest {
  source: string;
}

export interface AddonStagePlan {
  planId: string;
  manifest: AddonManifest;
  digest: string;
  trust: AddonTrust;
  stagingRef: string;
  warnings: string[];
}

export abstract class AddonSourcePort {
  abstract stage(request: AddonStageRequest): Promise<AddonStagePlan>;

  abstract release(planId: string): void;
}
