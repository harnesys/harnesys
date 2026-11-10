import type { AddonManifest } from '@harnesys/sdk';
import type { AddonTrust } from './addon-package-catalog.port.ts';

export type AddonSourceKind = 'builtin' | 'local-dir' | 'url' | 'registry';

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

export interface BuiltinAddonInfo {
  source: string;
  id: string;
  version: string;
  title: string;
  description: string;
}

export abstract class AddonSourcePort {
  abstract stage(request: AddonStageRequest): Promise<AddonStagePlan>;

  abstract release(planId: string): void;

  /** Discoverable packages shipped with the host; only the builtin source lists any. */
  listBuiltins(): BuiltinAddonInfo[] {
    return [];
  }
}
